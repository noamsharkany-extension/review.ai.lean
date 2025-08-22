import './config/environment.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createServer } from 'http';
import { analysisRouter, orchestrator } from './routes/analysis.js';
import { ProgressWebSocketServer } from './websocket/progressSocket.js';
import { generalRateLimit } from './middleware/rateLimiter.js';
import { cacheManager, closeCacheConnections } from './middleware/cache.js';
import { productionConfig, createHealthCheck, productionErrorHandler, createGracefulShutdown } from './config/production.js';
const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3001;
let dbService = null;
app.use(helmet(productionConfig.security.helmet));
app.use(compression({
    filter: (req, res) => {
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
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});
import { comprehensiveCollectionRouter, setProgressCallback } from './routes/comprehensiveCollection.js';
app.use('/api', analysisRouter);
app.use('/api/comprehensive', comprehensiveCollectionRouter);
app.get('/api/health', createHealthCheck(dbService, cacheManager));
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
const progressWS = new ProgressWebSocketServer(server, orchestrator);
setProgressCallback((sessionId, progress) => {
    progressWS.broadcastComprehensiveProgress(sessionId, progress);
});
app.use(productionErrorHandler);
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Not found',
        message: `Route ${req.method} ${req.originalUrl} not found`
    });
});
if (dbService) {
    setInterval(async () => {
        try {
            const cleaned = await dbService.cleanupOldSessions(30);
            if (cleaned > 0) {
                console.log(`Cleaned up ${cleaned} old sessions`);
            }
        }
        catch (error) {
            console.error('Error during cleanup:', error);
        }
    }, productionConfig.performance.cleanupIntervalHours * 60 * 60 * 1000);
}
const cleanup = async () => {
    try {
        await progressWS.close();
        console.log('WebSocket server closed');
        await orchestrator.shutdown();
        console.log('Orchestrator shutdown complete');
        closeCacheConnections();
        console.log('Cache connections closed');
    }
    catch (error) {
        console.error('Error during cleanup:', error);
        throw error;
    }
};
const gracefulShutdown = createGracefulShutdown(server, cleanup);
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`WebSocket server available at ws://localhost:${PORT}/ws/progress`);
});
//# sourceMappingURL=server.js.map