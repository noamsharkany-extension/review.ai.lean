import { useState, useCallback, useRef, useEffect } from 'react';
import { AnalysisSession, AnalysisResults, AnalysisProgress } from '../../../shared/types';
import { apiClient, ApiError } from '../services/apiClient';

export interface AnalysisSessionState {
  session?: AnalysisSession;
  isLoading: boolean;
  error?: ApiError;
  isPolling: boolean;
}

export interface UseAnalysisSessionReturn extends AnalysisSessionState {
  startAnalysis: (googleUrl: string) => Promise<void>;
  retryAnalysis: () => Promise<void>;
  clearError: () => void;
  clearSession: () => void;
  refreshStatus: () => Promise<void>;
}

// Simple in-memory cache for analysis results
class AnalysisCache {
  private cache = new Map<string, { session: AnalysisSession; timestamp: number }>();
  private readonly TTL = 5 * 60 * 1000; // 5 minutes

  set(sessionId: string, session: AnalysisSession): void {
    this.cache.set(sessionId, {
      session: { ...session },
      timestamp: Date.now()
    });
  }

  get(sessionId: string): AnalysisSession | null {
    const cached = this.cache.get(sessionId);
    if (!cached) return null;

    // Check if cache entry is still valid
    if (Date.now() - cached.timestamp > this.TTL) {
      this.cache.delete(sessionId);
      return null;
    }

    return { ...cached.session };
  }

  clear(): void {
    this.cache.clear();
  }

  has(sessionId: string): boolean {
    const cached = this.cache.get(sessionId);
    if (!cached) return false;

    if (Date.now() - cached.timestamp > this.TTL) {
      this.cache.delete(sessionId);
      return false;
    }

    return true;
  }
}

const analysisCache = new AnalysisCache();

export const useAnalysisSession = (): UseAnalysisSessionReturn => {
  const [state, setState] = useState<AnalysisSessionState>({
    isLoading: false,
    isPolling: false
  });

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentSessionIdRef = useRef<string | null>(null);

  // Stop polling when component unmounts or session changes
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setState(prev => ({ ...prev, isPolling: false }));
  }, []);

  // Start polling for session status updates
  const startPolling = useCallback((sessionId: string) => {
    stopPolling();

    setState(prev => ({ ...prev, isPolling: true }));

    const poll = async () => {
      try {
        // Check cache first
        const cachedSession = analysisCache.get(sessionId);
        if (cachedSession && (cachedSession.status === 'complete' || cachedSession.status === 'error')) {
          setState(prev => ({ 
            ...prev, 
            session: cachedSession,
            isPolling: false 
          }));
          stopPolling();
          return;
        }

        const session = await apiClient.getAnalysisStatus(sessionId);
        
        // Update cache
        analysisCache.set(sessionId, session);

        setState(prev => ({ 
          ...prev, 
          session,
          error: undefined 
        }));

        // Stop polling if analysis is complete or failed
        if (session.status === 'complete' || session.status === 'error') {
          stopPolling();
        }
      } catch (error) {
        console.error('Polling error:', error);
        
        // Don't show polling errors unless it's the first poll
        if (!state.session) {
          setState(prev => ({ 
            ...prev, 
            error: error as ApiError,
            isPolling: false 
          }));
          stopPolling();
        }
      }
    };

    // Poll immediately, then every 2 seconds
    poll();
    pollingIntervalRef.current = setInterval(poll, 2000);
  }, [state.session, stopPolling]);

  // Start a new analysis
  const startAnalysis = useCallback(async (googleUrl: string) => {
    setState(prev => ({ 
      ...prev, 
      isLoading: true, 
      error: undefined,
      session: undefined 
    }));

    try {
      const response = await apiClient.startAnalysis(googleUrl);
      currentSessionIdRef.current = response.sessionId;

      // Start polling for updates
      startPolling(response.sessionId);

    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        isLoading: false,
        error: error as ApiError 
      }));
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [startPolling]);

  // Retry a failed analysis
  const retryAnalysis = useCallback(async () => {
    if (!state.session?.id) {
      console.error('No session to retry');
      return;
    }

    setState(prev => ({ 
      ...prev, 
      isLoading: true, 
      error: undefined 
    }));

    try {
      await apiClient.retryAnalysis(state.session.id);
      
      // Clear cache for this session and start polling again
      analysisCache.clear();
      startPolling(state.session.id);

    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        isLoading: false,
        error: error as ApiError 
      }));
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [state.session?.id, startPolling]);

  // Manually refresh session status
  const refreshStatus = useCallback(async () => {
    if (!currentSessionIdRef.current) return;

    try {
      const session = await apiClient.getAnalysisStatus(currentSessionIdRef.current);
      analysisCache.set(currentSessionIdRef.current, session);
      
      setState(prev => ({ 
        ...prev, 
        session,
        error: undefined 
      }));
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        error: error as ApiError 
      }));
    }
  }, []);

  // Clear error state
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: undefined }));
  }, []);

  // Clear session and stop polling
  const clearSession = useCallback(() => {
    stopPolling();
    currentSessionIdRef.current = null;
    setState({
      isLoading: false,
      isPolling: false
    });
  }, [stopPolling]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  return {
    ...state,
    startAnalysis,
    retryAnalysis,
    clearError,
    clearSession,
    refreshStatus
  };
};