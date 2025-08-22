import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createServer } from 'http';
import { generalRateLimit } from './middleware/rateLimiter.js';
import { cacheManager, closeCacheConnections } from './middleware/cache.js';
import { productionConfig, createHealthCheck, productionErrorHandler, createGracefulShutdown } from './config/production.js';

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3001;

// Production middleware
app.use(helmet(productionConfig.security.helmet));

app.use(compression({
  filter: (req: any, res: any) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: productionConfig.performance.compressionLevel,
  threshold: productionConfig.performance.compressionThreshold
}));

app.use(cors({
  origin: process.env.NODE_ENV === 'development' 
    ? ['http://localhost:5173', 'http://localhost:3000']
    : process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

app.use(generalRateLimit);
app.use(express.json({ limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check endpoint with production optimizations
app.get('/api/health', createHealthCheck(null, cacheManager));

// Cache management endpoints (development only)
if (process.env.NODE_ENV === 'development') {
  app.post('/api/cache/clear', (req, res) => {
    cacheManager.clear();
    res.json({ message: 'Cache cleared successfully' });
  });

  app.get('/api/cache/stats', (req, res) => {
    res.json(cacheManager.getStats());
  });
}

// Demo endpoint to show rate limiting works
app.get('/api/demo', (req, res) => {
  res.json({
    message: 'Production optimizations demo',
    timestamp: new Date().toISOString(),
    rateLimiting: 'Active',
    compression: 'Active',
    caching: 'Active',
    security: 'Helmet enabled'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.method} ${req.originalUrl} not found`
  });
});

// Error handling middleware
app.use(productionErrorHandler);

// Graceful shutdown
const cleanup = async () => {
  try {
    closeCacheConnections();
    console.log('Cache connections closed');
  } catch (error) {
    console.error('Error during cleanup:', error);
    throw error;
  }
};

const gracefulShutdown = createGracefulShutdown(server, cleanup);
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
server.listen(PORT, () => {
  console.log(`Production-optimized server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`Demo endpoint: http://localhost:${PORT}/api/demo`);
});