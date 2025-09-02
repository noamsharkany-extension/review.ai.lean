import { Router } from 'express';
import { ReviewAnalysisOrchestrator } from '../services/orchestration.js';
import { validateGoogleMapsUrl } from '../utils/urlValidator.js';
import { analysisRateLimit, retryRateLimit } from '../middleware/rateLimiter.js';
import { cacheAnalysisResults, cacheUrlValidation } from '../middleware/cache.js';
const router = Router();
const orchestrator = new ReviewAnalysisOrchestrator();
router.post('/analyze', analysisRateLimit, cacheUrlValidation(), async (req, res) => {
    try {
        const { googleUrl } = req.body;
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
        const sessionId = await orchestrator.startAnalysis(googleUrl);
        return res.status(202).json({
            sessionId,
            status: 'started'
        });
    }
    catch (error) {
        console.error('Error starting analysis:', error);
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
router.get('/analysis/:id', cacheAnalysisResults(), (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({
                session: null,
                error: 'Session ID is required',
                errorType: 'validation'
            });
        }
        const session = orchestrator.getAnalysisStatus(id);
        if (!session) {
            return res.status(404).json({
                session: null,
                error: 'Analysis session not found. It may have expired or never existed.',
                errorType: 'not_found'
            });
        }
        return res.json({ session });
    }
    catch (error) {
        console.error('Error retrieving analysis status:', error);
        return res.status(500).json({
            session: null,
            error: error instanceof Error ? error.message : 'Internal server error',
            errorType: 'api'
        });
    }
});
router.post('/analysis/:id/retry', retryRateLimit, async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({
                error: 'Session ID is required',
                errorType: 'validation'
            });
        }
        const session = orchestrator.getAnalysisStatus(id);
        if (!session) {
            return res.status(404).json({
                error: 'Analysis session not found',
                errorType: 'not_found'
            });
        }
        if (session.status !== 'error') {
            return res.status(400).json({
                error: `Cannot retry analysis in '${session.status}' state. Only failed analyses can be retried.`,
                errorType: 'invalid_state'
            });
        }
        await orchestrator.retryFailedStep(id);
        return res.json({
            status: 'retry_started',
            message: 'Analysis retry initiated successfully',
            sessionId: id
        });
    }
    catch (error) {
        console.error('Error retrying analysis:', error);
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
        const sessions = orchestrator.getActiveSessions();
        res.json({ sessions });
    }
    catch (error) {
        console.error('Error retrieving sessions:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Internal server error'
        });
    }
});
export { router as analysisRouter, orchestrator };
//# sourceMappingURL=analysis.js.map