import { Router, Request, Response } from 'express';
import { ReviewAnalysisOrchestrator } from '../services/orchestration.js';
import { validateGoogleMapsUrl } from '../utils/urlValidator.js';
import { AnalyzeRequest, AnalyzeResponse, AnalysisStatusResponse } from '@shared/types';
import { analysisRateLimit, retryRateLimit } from '../middleware/rateLimiter.js';
import { cacheAnalysisResults, cacheUrlValidation } from '../middleware/cache.js';
import { DatabaseService } from '../services/database.js';

const router = Router();

// Create orchestrator function that accepts database service
export function createOrchestrator(databaseService?: DatabaseService): ReviewAnalysisOrchestrator {
  return new ReviewAnalysisOrchestrator(databaseService);
}

// Default orchestrator instance (will be updated by server.ts)
let orchestratorInstance = new ReviewAnalysisOrchestrator();

// Function to update the orchestrator instance
export function setOrchestrator(newOrchestrator: ReviewAnalysisOrchestrator): void {
  orchestratorInstance = newOrchestrator;
}

// Export the orchestrator instance
export const orchestrator = orchestratorInstance;

// POST /api/analyze - Initiate analysis
router.post('/analyze', analysisRateLimit, cacheUrlValidation(), async (req: Request<{}, AnalyzeResponse, AnalyzeRequest>, res: Response<AnalyzeResponse>) => {
  try {
    const { googleUrl } = req.body;

    // Validate request body
    if (!googleUrl || typeof googleUrl !== 'string') {
      return res.status(400).json({
        sessionId: '',
        status: 'error',
        error: 'Google URL is required and must be a string',
        errorType: 'validation'
      } as any);
    }

    // Validate URL format
    if (!validateGoogleMapsUrl(googleUrl)) {
      return res.status(400).json({
        sessionId: '',
        status: 'error',
        error: 'Invalid Google URL. Please provide a valid Google Maps, Google Search, or other Google URL that shows reviews.',
        errorType: 'validation'
      } as any);
    }

    // Check if URL is accessible (basic check)
    try {
      const url = new URL(googleUrl);
      if (!url.hostname.includes('google.com')) {
        return res.status(400).json({
          sessionId: '',
          status: 'error',
          error: 'URL must be from a Google domain (google.com)',
          errorType: 'validation'
        } as any);
      }
    } catch (urlError) {
      return res.status(400).json({
        sessionId: '',
        status: 'error',
        error: 'Invalid URL format. Please provide a valid URL starting with http:// or https://',
        errorType: 'validation'
      } as any);
    }

    // Start analysis
    const sessionId = await orchestrator.startAnalysis(googleUrl);

    return res.status(202).json({
      sessionId,
      status: 'started'
    });

  } catch (error) {
    console.error('Error starting analysis:', error);
    
    // Determine error type based on error message
    let errorType = 'api';
    if (error instanceof Error) {
      if (error.message.includes('network') || error.message.includes('fetch')) {
        errorType = 'network';
      } else if (error.message.includes('timeout')) {
        errorType = 'timeout';
      } else if (error.message.includes('scraping')) {
        errorType = 'scraping';
      }
    }

    return res.status(500).json({
      sessionId: '',
      status: 'error',
      error: error instanceof Error ? error.message : 'Internal server error',
      errorType
    } as any);
  }
});

// GET /api/analysis/:id - Get analysis status and results
router.get('/analysis/:id', cacheAnalysisResults(), async (req: Request<{ id: string }>, res: Response<AnalysisStatusResponse>) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        session: null,
        error: 'Session ID is required',
        errorType: 'validation'
      } as any);
    }

    const session = await orchestrator.getAnalysisStatus(id);

    if (!session) {
      return res.status(404).json({
        session: null,
        error: 'Analysis session not found. It may have expired or never existed.',
        errorType: 'not_found'
      } as any);
    }

    return res.json({ session });

  } catch (error) {
    console.error('Error retrieving analysis status:', error);
    return res.status(500).json({
      session: null,
      error: error instanceof Error ? error.message : 'Internal server error',
      errorType: 'api'
    } as any);
  }
});

// POST /api/analysis/:id/retry - Retry failed analysis
router.post('/analysis/:id/retry', retryRateLimit, async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        error: 'Session ID is required',
        errorType: 'validation'
      });
    }

    const session = await orchestrator.getAnalysisStatus(id);
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

  } catch (error) {
    console.error('Error retrying analysis:', error);
    
    let errorType = 'api';
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        errorType = 'not_found';
      } else if (error.message.includes('not in error state') || error.message.includes('invalid state')) {
        errorType = 'invalid_state';
      } else if (error.message.includes('network')) {
        errorType = 'network';
      } else if (error.message.includes('timeout')) {
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

// GET /api/sessions - Get all active sessions (for debugging/monitoring)
router.get('/sessions', (req: Request, res: Response) => {
  try {
    const sessions = orchestrator.getActiveSessions();
    res.json({ sessions });
  } catch (error) {
    console.error('Error retrieving sessions:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

export { router as analysisRouter };