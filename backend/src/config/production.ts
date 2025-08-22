// Production configuration and optimizations
import { Request, Response, NextFunction } from 'express';

// Production middleware configuration
export const productionConfig = {
  // Rate limiting settings
  rateLimiting: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 10,
    maxGeneral: 100
  },
  
  // Cache settings
  cache: {
    ttl: 3600, // 1 hour
    maxSize: 1000 // Max number of cached items
  },
  
  // Performance settings
  performance: {
    maxConcurrentAnalyses: 5,
    cleanupIntervalHours: 24,
    compressionLevel: 6,
    compressionThreshold: 1024
  },
  
  // Security settings
  security: {
    helmet: {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "ws:", "wss:"]
        }
      }
    }
  }
};

// Production health check with detailed metrics
export const createHealthCheck = (dbService: any, cacheManager: any) => {
  return async (req: Request, res: Response) => {
    try {
      const startTime = Date.now();
      
      // Basic health indicators
      const health: any = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        environment: process.env.NODE_ENV || 'development',
        version: '1.0.0'
      };

      // Add database stats if available
      if (dbService && typeof dbService.getStats === 'function') {
        try {
          health.database = await dbService.getStats();
        } catch (error) {
          health.database = { error: 'Database unavailable' };
        }
      }

      // Add cache stats if available
      if (cacheManager && typeof cacheManager.getStats === 'function') {
        try {
          health.cache = cacheManager.getStats();
        } catch (error) {
          health.cache = { error: 'Cache unavailable' };
        }
      }

      const responseTime = Date.now() - startTime;
      health.responseTime = responseTime;

      res.json(health);
    } catch (error) {
      res.status(503).json({
        status: 'error',
        message: 'Health check failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };
};

// Production error handler
export const productionErrorHandler = (error: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Production error:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(500).json({
    error: 'Internal server error',
    message: isDevelopment ? error.message : 'Something went wrong',
    timestamp: new Date().toISOString()
  });
};

// Graceful shutdown handler
export const createGracefulShutdown = (server: any, cleanup: () => Promise<void>) => {
  return async (signal: string) => {
    console.log(`${signal} received, shutting down gracefully...`);
    
    try {
      // Stop accepting new connections
      server.close(async () => {
        console.log('HTTP server closed');
        
        try {
          await cleanup();
          console.log('Cleanup completed');
          process.exit(0);
        } catch (error) {
          console.error('Error during cleanup:', error);
          process.exit(1);
        }
      });
      
      // Force shutdown after timeout
      setTimeout(() => {
        console.error('Forced shutdown due to timeout');
        process.exit(1);
      }, 30000);
      
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  };
};