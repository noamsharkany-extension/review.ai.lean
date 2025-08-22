import { Router } from 'express';
import { ComprehensiveCollectionOrchestrator } from '../services/comprehensiveCollectionOrchestrator.js';
import { ComprehensiveCollectionService } from '../services/comprehensiveCollectionService.js';
import { validateGoogleMapsUrl } from '../utils/urlValidator.js';
import { analysisRateLimit, retryRateLimit } from '../middleware/rateLimiter.js';
import { cacheComprehensiveResults, cacheUrlValidation } from '../middleware/cache.js';
const router = Router();
let progressCallback;
export function setProgressCallback(callback) {
    progressCallback = callback;
}
const comprehensiveService = new ComprehensiveCollectionService(progressCallback, false);
const orchestrator = new ComprehensiveCollectionOrchestrator(progressCallback, false);
const activeSessions = new Map();
router.post('/collect', analysisRateLimit, cacheUrlValidation(), async (req, res) => {
    try {
        const { googleUrl, config } = req.body;
        if (!googleUrl || typeof googleUrl !== 'string') {
            return res.status(400).json({
                sessionId: '',
                status: 'error',
                error: 'Google URL is required and must be a string',
                errorType: 'validation'
            });
        }
        if (!validateGoogleMapsUrl(googleUrl)) {
            return res.status(400).json({
                sessionId: '',
                status: 'error',
                error: 'Invalid Google URL. Please provide a valid Google Maps, Google Search, or other Google URL that shows reviews.',
                errorType: 'validation'
            });
        }
        try {
            const url = new URL(googleUrl);
            if (!url.hostname.includes('google.com')) {
                return res.status(400).json({
                    sessionId: '',
                    status: 'error',
                    error: 'URL must be from a Google domain (google.com)',
                    errorType: 'validation'
                });
            }
        }
        catch (urlError) {
            return res.status(400).json({
                sessionId: '',
                status: 'error',
                error: 'Invalid URL format. Please provide a valid URL starting with http:// or https://',
                errorType: 'validation'
            });
        }
        const defaultOrchestratorConfig = orchestrator.getDefaultConfig();
        const finalConfig = {
            orchestratorConfig: {
                ...defaultOrchestratorConfig,
                ...config,
                targetCounts: {
                    ...defaultOrchestratorConfig.targetCounts,
                    ...config?.targetCounts
                },
                timeouts: {
                    ...defaultOrchestratorConfig.timeouts,
                    ...config?.timeouts
                },
                retryLimits: {
                    ...defaultOrchestratorConfig.retryLimits,
                    ...config?.retryLimits
                },
                performance: {
                    ...defaultOrchestratorConfig.performance,
                    ...config?.performance
                }
            },
            scraperConfig: {
                enableReliabilityFramework: true,
                enableDegradedMode: true,
                enableProgressiveSelectors: true,
                enableResourceMonitoring: true
            }
        };
        const sessionId = await startComprehensiveCollection(googleUrl, finalConfig);
        return res.status(202).json({
            sessionId,
            status: 'started'
        });
    }
    catch (error) {
        console.error('Error starting comprehensive collection:', error);
        let errorType = 'api';
        if (error instanceof Error) {
            if (error.message.includes('network') || error.message.includes('fetch')) {
                errorType = 'network';
            }
            else if (error.message.includes('timeout')) {
                errorType = 'timeout';
            }
            else if (error.message.includes('scraping')) {
                errorType = 'scraping';
            }
        }
        return res.status(500).json({
            sessionId: '',
            status: 'error',
            error: error instanceof Error ? error.message : 'Internal server error',
            errorType
        });
    }
});
router.get('/collection/:id', cacheComprehensiveResults(), async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({
                session: null,
                error: 'Session ID is required',
                errorType: 'validation'
            });
        }
        const session = activeSessions.get(id);
        if (!session) {
            return res.status(404).json({
                session: null,
                error: 'Comprehensive collection session not found. It may have expired or never existed.',
                errorType: 'not_found'
            });
        }
        const progress = comprehensiveService.getSessionProgress(id);
        const apiSession = {
            id: session.sessionId,
            status: session.status,
            progress: progress || {
                currentPhase: 'recent',
                phaseProgress: { current: 0, target: 100, percentage: 0 },
                overallProgress: { reviewsCollected: 0, totalTarget: 300, percentage: 0 },
                timeElapsed: 0,
                estimatedTimeRemaining: 0
            },
            error: session.error ? {
                message: session.error,
                type: 'collection'
            } : undefined,
            createdAt: new Date(session.startTime),
            completedAt: session.endTime ? new Date(session.endTime) : undefined
        };
        if (session.status === 'complete' && session.promise) {
            try {
                const results = await session.promise;
                apiSession.results = results;
            }
            catch (error) {
            }
        }
        return res.json({ session: apiSession });
    }
    catch (error) {
        console.error('Error retrieving comprehensive collection status:', error);
        return res.status(500).json({
            session: null,
            error: error instanceof Error ? error.message : 'Internal server error',
            errorType: 'api'
        });
    }
});
router.post('/collection/:id/retry', retryRateLimit, async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({
                error: 'Session ID is required',
                errorType: 'validation'
            });
        }
        const session = activeSessions.get(id);
        if (!session) {
            return res.status(404).json({
                error: 'Comprehensive collection session not found',
                errorType: 'not_found'
            });
        }
        if (session.status !== 'error') {
            return res.status(400).json({
                error: `Cannot retry comprehensive collection in '${session.status}' state. Only failed collections can be retried.`,
                errorType: 'invalid_state'
            });
        }
        const newSessionId = await startComprehensiveCollection(session.googleUrl, session.config);
        return res.json({
            status: 'retry_started',
            message: 'Comprehensive collection retry initiated successfully',
            originalSessionId: id,
            newSessionId: newSessionId
        });
    }
    catch (error) {
        console.error('Error retrying comprehensive collection:', error);
        let errorType = 'api';
        if (error instanceof Error) {
            if (error.message.includes('not found')) {
                errorType = 'not_found';
            }
            else if (error.message.includes('not in error state') || error.message.includes('invalid state')) {
                errorType = 'invalid_state';
            }
            else if (error.message.includes('network')) {
                errorType = 'network';
            }
            else if (error.message.includes('timeout')) {
                errorType = 'timeout';
            }
        }
        const statusCode = errorType === 'not_found' ? 404 : errorType === 'invalid_state' ? 400 : 500;
        return res.status(statusCode).json({
            error: error instanceof Error ? error.message : 'Internal server error',
            errorType
        });
    }
});
router.get('/sessions', (req, res) => {
    try {
        const sessions = getActiveComprehensiveSessions();
        res.json({ sessions });
    }
    catch (error) {
        console.error('Error retrieving comprehensive collection sessions:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Internal server error'
        });
    }
});
router.get('/config/default', (req, res) => {
    try {
        const defaultConfig = orchestrator.getDefaultConfig();
        res.json({ config: defaultConfig });
    }
    catch (error) {
        console.error('Error retrieving default configuration:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Internal server error'
        });
    }
});
router.get('/stats', (req, res) => {
    try {
        const memoryStats = comprehensiveService.getMemoryStats();
        const cacheStats = comprehensiveService.getCacheStats();
        res.json({
            memory: memoryStats,
            cache: cacheStats,
            activeSessions: activeSessions.size
        });
    }
    catch (error) {
        console.error('Error retrieving comprehensive collection statistics:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Internal server error'
        });
    }
});
if (process.env.NODE_ENV === 'development') {
    router.post('/cleanup', async (req, res) => {
        try {
            const cleanupResult = await comprehensiveService.performManualCleanup();
            res.json({
                message: 'Manual cleanup completed',
                result: cleanupResult
            });
        }
        catch (error) {
            console.error('Error performing manual cleanup:', error);
            res.status(500).json({
                error: error instanceof Error ? error.message : 'Internal server error'
            });
        }
    });
}
async function startComprehensiveCollection(googleUrl, config) {
    const sessionId = `comprehensive_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    console.log(`Starting comprehensive collection for ${googleUrl} with session ${sessionId}`);
    const session = {
        sessionId,
        googleUrl,
        config,
        status: 'pending',
        startTime: Date.now()
    };
    activeSessions.set(sessionId, session);
    const collectionPromise = comprehensiveService.collectComprehensiveReviews(googleUrl, config)
        .then((result) => {
        const session = activeSessions.get(sessionId);
        if (session) {
            session.status = 'complete';
            session.endTime = Date.now();
            activeSessions.set(sessionId, session);
        }
        if (progressCallback) {
            progressCallback(sessionId, {
                type: 'comprehensive_complete',
                data: result
            });
        }
        return result;
    })
        .catch((error) => {
        const session = activeSessions.get(sessionId);
        if (session) {
            session.status = 'error';
            session.endTime = Date.now();
            session.error = error instanceof Error ? error.message : 'Unknown error';
            activeSessions.set(sessionId, session);
        }
        if (progressCallback) {
            progressCallback(sessionId, {
                type: 'comprehensive_error',
                data: { error: error instanceof Error ? error.message : 'Unknown error' }
            });
        }
        throw error;
    });
    session.promise = collectionPromise;
    session.status = 'collecting';
    activeSessions.set(sessionId, session);
    return sessionId;
}
function mapInternalStatusToAPI(internalStatus) {
    switch (internalStatus) {
        case 'pending':
        case 'initialized':
            return 'pending';
        case 'collecting':
        case 'recent':
        case 'worst':
        case 'best':
        case 'deduplication':
            return 'collecting';
        case 'complete':
        case 'completed':
            return 'complete';
        case 'error':
        case 'failed':
            return 'error';
        default:
            return 'pending';
    }
}
function getActiveComprehensiveSessions() {
    const sessions = Array.from(activeSessions.values()).map(session => ({
        id: session.sessionId,
        googleUrl: session.googleUrl,
        status: session.status,
        startTime: session.startTime,
        endTime: session.endTime,
        error: session.error
    }));
    return sessions;
}
setInterval(() => {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000;
    for (const [sessionId, session] of activeSessions.entries()) {
        if (now - session.startTime > maxAge) {
            console.log(`Cleaning up old comprehensive collection session: ${sessionId}`);
            activeSessions.delete(sessionId);
        }
    }
}, 60 * 60 * 1000);
export { router as comprehensiveCollectionRouter };
//# sourceMappingURL=comprehensiveCollection.js.map