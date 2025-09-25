// Load environment variables first
import './config/environment.js';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createServer } from 'http';
import { analysisRouter, createOrchestrator, setOrchestrator } from './routes/analysis.js';
import { ProgressWebSocketServer } from './websocket/progressSocket.js';
import { generalRateLimit } from './middleware/rateLimiter.js';
import { cacheManager, closeCacheConnections } from './middleware/cache.js';
// Database imports
import { DatabaseService } from './services/database.js';
import { closeDatabaseConnection } from './database/connection.js';
import { productionConfig, createHealthCheck, productionErrorHandler, createGracefulShutdown } from './config/production.js';

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3001;

// Initialize database service (with error handling)
let dbService: DatabaseService | null = null;
try {
  dbService = new DatabaseService();
  console.log('Database service initialized successfully');
} catch (error) {
  console.warn('Database service initialization failed:', error);
  console.log('Continuing without database - results will only be stored in memory');
}

// Initialize orchestrator with database service
const orchestrator = createOrchestrator(dbService || undefined);
setOrchestrator(orchestrator);

// Middleware
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
    ? ['http://localhost:5174', 'http://localhost:3000']
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

// Import comprehensive collection router
import { comprehensiveCollectionRouter, setProgressCallback } from './routes/comprehensiveCollection.js';

// API Routes
app.use('/api', analysisRouter);
app.use('/api/comprehensive', comprehensiveCollectionRouter);

// Health check endpoint with detailed status
app.get('/api/health', createHealthCheck(dbService, cacheManager));

// Cache management endpoint (development only)
if (process.env.NODE_ENV === 'development') {
  app.post('/api/cache/clear', (req, res) => {
    cacheManager.clear();
    res.json({ message: 'Cache cleared successfully' });
  });

  app.get('/api/cache/stats', (req, res) => {
    res.json(cacheManager.getStats());
  });

  app.post('/api/cache/clear/comprehensive', (req, res) => {
    const cleared = cacheManager.clearComprehensive();
    res.json({ message: `Cleared ${cleared} comprehensive collection cache entries` });
  });
}

// WebSocket server for progress updates
const progressWS = new ProgressWebSocketServer(server, orchestrator);

// Set up comprehensive collection progress callback
setProgressCallback((sessionId: string, progress: any) => {
  progressWS.broadcastComprehensiveProgress(sessionId, progress);
});

// Error handling middleware
app.use(productionErrorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.method} ${req.originalUrl} not found`
  });
});

// Cleanup old sessions periodically
if (dbService) {
  setInterval(async () => {
    try {
      const cleaned = await dbService!.cleanupOldSessions(30);
      if (cleaned > 0) {
        console.log(`Cleaned up ${cleaned} old sessions`);
      }
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }, productionConfig.performance.cleanupIntervalHours * 60 * 60 * 1000);
}

// Graceful shutdown
const cleanup = async () => {
  try {
    await progressWS.close();
    console.log('WebSocket server closed');
    
    await orchestrator.shutdown();
    console.log('Orchestrator shutdown complete');
    
    closeCacheConnections();
    console.log('Cache connections closed');
    
    // await closeDatabaseConnection();
    // console.log('Database connections closed');
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
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server available at ws://localhost:${PORT}/ws/progress`);
});