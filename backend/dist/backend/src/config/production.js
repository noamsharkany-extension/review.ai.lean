export const productionConfig = {
    rateLimiting: {
        windowMs: 15 * 60 * 1000,
        maxRequests: 10,
        maxGeneral: 100
    },
    cache: {
        ttl: 3600,
        maxSize: 1000
    },
    performance: {
        maxConcurrentAnalyses: 5,
        cleanupIntervalHours: 24,
        compressionLevel: 6,
        compressionThreshold: 1024
    },
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
export const createHealthCheck = (dbService, cacheManager) => {
    return async (req, res) => {
        try {
            const startTime = Date.now();
            const health = {
                status: 'ok',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                environment: process.env.NODE_ENV || 'development',
                version: '1.0.0'
            };
            if (dbService && typeof dbService.getStats === 'function') {
                try {
                    health.database = await dbService.getStats();
                }
                catch (error) {
                    health.database = { error: 'Database unavailable' };
                }
            }
            if (cacheManager && typeof cacheManager.getStats === 'function') {
                try {
                    health.cache = cacheManager.getStats();
                }
                catch (error) {
                    health.cache = { error: 'Cache unavailable' };
                }
            }
            const responseTime = Date.now() - startTime;
            health.responseTime = responseTime;
            res.json(health);
        }
        catch (error) {
            res.status(503).json({
                status: 'error',
                message: 'Health check failed',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    };
};
export const productionErrorHandler = (error, req, res, next) => {
    console.error('Production error:', {
        message: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
        timestamp: new Date().toISOString()
    });
    const isDevelopment = process.env.NODE_ENV === 'development';
    res.status(500).json({
        error: 'Internal server error',
        message: isDevelopment ? error.message : 'Something went wrong',
        timestamp: new Date().toISOString()
    });
};
export const createGracefulShutdown = (server, cleanup) => {
    return async (signal) => {
        console.log(`${signal} received, shutting down gracefully...`);
        try {
            server.close(async () => {
                console.log('HTTP server closed');
                try {
                    await cleanup();
                    console.log('Cleanup completed');
                    process.exit(0);
                }
                catch (error) {
                    console.error('Error during cleanup:', error);
                    process.exit(1);
                }
            });
            setTimeout(() => {
                console.error('Forced shutdown due to timeout');
                process.exit(1);
            }, 30000);
        }
        catch (error) {
            console.error('Error during shutdown:', error);
            process.exit(1);
        }
    };
};
//# sourceMappingURL=production.js.map