import { Router, Request, Response } from 'express';
import { ComprehensiveCollectionConfig, ComprehensiveCollectionResult, ComprehensiveCollectionOrchestrator } from '../services/comprehensiveCollectionOrchestrator.js';
import { ComprehensiveCollectionService, ComprehensiveCollectionServiceConfig } from '../services/comprehensiveCollectionService.js';
import { validateGoogleMapsUrl } from '../utils/urlValidator.js';
import { analysisRateLimit, retryRateLimit } from '../middleware/rateLimiter.js';
import { cacheComprehensiveResults, cacheUrlValidation } from '../middleware/cache.js';

const router = Router();

// Create service instance with progress callback for WebSocket integration
let progressCallback: ((sessionId: string, progress: any) => void) | undefined;

// Set progress callback (called from server.ts)
export function setProgressCallback(callback: (sessionId: string, progress: any) => void) {
  progressCallback = callback;
}

const comprehensiveService = new ComprehensiveCollectionService(progressCallback, false);
const orchestrator = new ComprehensiveCollectionOrchestrator(progressCallback, false);

// Active sessions tracking
interface SessionData {
  sessionId: string;
  googleUrl: string;
  config: ComprehensiveCollectionServiceConfig;
  status: 'pending' | 'collecting' | 'complete' | 'error';
  startTime: number;
  endTime?: number;
  error?: string;
  promise?: Promise<ComprehensiveCollectionResult>;
}

const activeSessions = new Map<string, SessionData>();

// Request/Response interfaces for comprehensive collection
export interface ComprehensiveCollectionRequest {
  googleUrl: string;
  config?: Partial<ComprehensiveCollectionConfig>;
}

export interface ComprehensiveCollectionResponse {
  sessionId: string;
  status: 'started' | 'error';
  error?: string;
  errorType?: string;
}

export interface ComprehensiveCollectionStatusResponse {
  session: {
    id: string;
    status: 'pending' | 'collecting' | 'complete' | 'error';
    progress: {
      currentPhase: 'recent' | 'worst' | 'best' | 'deduplication' | 'complete';
      phaseProgress: {
        current: number;
        target: number;
        percentage: number;
      };
      overallProgress: {
        reviewsCollected: number;
        totalTarget: number;
        percentage: number;
      };
      timeElapsed: number;
      estimatedTimeRemaining: number;
    };
    results?: ComprehensiveCollectionResult;
    error?: {
      message: string;
      type: string;
    };
    createdAt: Date;
    completedAt?: Date;
  } | null;
  error?: string;
  errorType?: string;
}

// POST /api/comprehensive/collect - Initiate comprehensive collection
router.post('/collect', analysisRateLimit, cacheUrlValidation(), async (
  req: Request<{}, ComprehensiveCollectionResponse, ComprehensiveCollectionRequest>, 
  res: Response<ComprehensiveCollectionResponse>
) => {
  try {
    const { googleUrl, config } = req.body;

    // Validate request body
    if (!googleUrl || typeof googleUrl !== 'string') {
      return res.status(400).json({
        sessionId: '',
        status: 'error',
        error: 'Google URL is required and must be a string',
        errorType: 'validation'
      });
    }

    // Validate URL format
    if (!validateGoogleMapsUrl(googleUrl)) {
      return res.status(400).json({
        sessionId: '',
        status: 'error',
        error: 'Invalid Google URL. Please provide a valid Google Maps, Google Search, or other Google URL that shows reviews.',
        errorType: 'validation'
      });
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
        });
      }
    } catch (urlError) {
      return res.status(400).json({
        sessionId: '',
        status: 'error',
        error: 'Invalid URL format. Please provide a valid URL starting with http:// or https://',
        errorType: 'validation'
      });
    }

    // Merge user config with defaults
    const defaultOrchestratorConfig = orchestrator.getDefaultConfig();
    const finalConfig: ComprehensiveCollectionServiceConfig = {
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

    // Start comprehensive collection
    const sessionId = await startComprehensiveCollection(googleUrl, finalConfig);

    return res.status(202).json({
      sessionId,
      status: 'started'
    });

  } catch (error) {
    console.error('Error starting comprehensive collection:', error);
    
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
    });
  }
});

// GET /api/comprehensive/collection/:id - Get comprehensive collection status and results
router.get('/collection/:id', cacheComprehensiveResults(), async (
  req: Request<{ id: string }>, 
  res: Response<ComprehensiveCollectionStatusResponse>
) => {
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

    // Get progress from service
    const progress = comprehensiveService.getSessionProgress(id);
    
    // Transform session format to API response format
    const apiSession: {
      id: string;
      status: 'pending' | 'collecting' | 'complete' | 'error';
      progress: any;
      results?: ComprehensiveCollectionResult;
      error?: { message: string; type: string };
      createdAt: Date;
      completedAt?: Date;
    } = {
      id: session.sessionId,
      status: session.status,
      progress: progress || {
        currentPhase: 'recent' as const,
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

    // If collection is complete, try to get results from the promise
    if (session.status === 'complete' && session.promise) {
      try {
        const results = await session.promise;
        apiSession.results = results;
      } catch (error) {
        // Results already handled in error case
      }
    }

    return res.json({ session: apiSession });

  } catch (error) {
    console.error('Error retrieving comprehensive collection status:', error);
    return res.status(500).json({
      session: null,
      error: error instanceof Error ? error.message : 'Internal server error',
      errorType: 'api'
    });
  }
});

// POST /api/comprehensive/collection/:id/retry - Retry failed comprehensive collection
router.post('/collection/:id/retry', retryRateLimit, async (
  req: Request<{ id: string }>, 
  res: Response
) => {
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

    // For comprehensive collection, we need to restart the entire process
    // as it's not easily resumable from a specific point
    const newSessionId = await startComprehensiveCollection(session.googleUrl, session.config);

    return res.json({
      status: 'retry_started',
      message: 'Comprehensive collection retry initiated successfully',
      originalSessionId: id,
      newSessionId: newSessionId
    });

  } catch (error) {
    console.error('Error retrying comprehensive collection:', error);
    
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

// GET /api/comprehensive/sessions - Get all active comprehensive collection sessions
router.get('/sessions', (req: Request, res: Response) => {
  try {
    const sessions = getActiveComprehensiveSessions();
    res.json({ sessions });
  } catch (error) {
    console.error('Error retrieving comprehensive collection sessions:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// GET /api/comprehensive/config/default - Get default configuration
router.get('/config/default', (req: Request, res: Response) => {
  try {
    const defaultConfig = orchestrator.getDefaultConfig();
    res.json({ config: defaultConfig });
  } catch (error) {
    console.error('Error retrieving default configuration:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// GET /api/comprehensive/stats - Get comprehensive collection statistics
router.get('/stats', (req: Request, res: Response) => {
  try {
    const memoryStats = comprehensiveService.getMemoryStats();
    const cacheStats = comprehensiveService.getCacheStats();

    res.json({
      memory: memoryStats,
      cache: cacheStats,
      activeSessions: activeSessions.size
    });
  } catch (error) {
    console.error('Error retrieving comprehensive collection statistics:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// POST /api/comprehensive/cleanup - Manual cleanup (development only)
if (process.env.NODE_ENV === 'development') {
  router.post('/cleanup', async (req: Request, res: Response) => {
    try {
      const cleanupResult = await comprehensiveService.performManualCleanup();
      res.json({
        message: 'Manual cleanup completed',
        result: cleanupResult
      });
    } catch (error) {
      console.error('Error performing manual cleanup:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  });
}

// Helper functions
async function startComprehensiveCollection(
  googleUrl: string, 
  config: ComprehensiveCollectionServiceConfig
): Promise<string> {
  const sessionId = `comprehensive_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  
  console.log(`Starting comprehensive collection for ${googleUrl} with session ${sessionId}`);
  
  // Create session entry
  const session: SessionData = {
    sessionId,
    googleUrl,
    config,
    status: 'pending',
    startTime: Date.now()
  };
  
  activeSessions.set(sessionId, session);
  
  // Start collection asynchronously
  const collectionPromise = comprehensiveService.collectComprehensiveReviews(googleUrl, sessionId, config)
    .then((result) => {
      // Update session with success
      const session = activeSessions.get(sessionId);
      if (session) {
        session.status = 'complete';
        session.endTime = Date.now();
        activeSessions.set(sessionId, session);
      }
      
      // Broadcast completion via WebSocket
      if (progressCallback) {
        progressCallback(sessionId, {
          type: 'comprehensive_complete',
          data: result
        });
      }
      
      return result;
    })
    .catch((error) => {
      // Update session with error
      const session = activeSessions.get(sessionId);
      if (session) {
        session.status = 'error';
        session.endTime = Date.now();
        session.error = error instanceof Error ? error.message : 'Unknown error';
        activeSessions.set(sessionId, session);
      }
      
      // Broadcast error via WebSocket
      if (progressCallback) {
        progressCallback(sessionId, {
          type: 'comprehensive_error',
          data: { error: error instanceof Error ? error.message : 'Unknown error' }
        });
      }
      
      throw error;
    });
  
  // Store promise for potential cancellation
  session.promise = collectionPromise;
  session.status = 'collecting';
  activeSessions.set(sessionId, session);
  
  return sessionId;
}

function mapInternalStatusToAPI(internalStatus: string): 'pending' | 'collecting' | 'complete' | 'error' {
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

// Cleanup old sessions periodically
setInterval(() => {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  
  for (const [sessionId, session] of activeSessions.entries()) {
    if (now - session.startTime > maxAge) {
      console.log(`Cleaning up old comprehensive collection session: ${sessionId}`);
      activeSessions.delete(sessionId);
    }
  }
}, 60 * 60 * 1000); // Check every hour

export { router as comprehensiveCollectionRouter };