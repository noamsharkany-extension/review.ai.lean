import { useState, useCallback, useRef, useEffect } from 'react';
import { AnalysisSession } from '../../../shared/types';
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

    // Normalize date fields returned from the API (they arrive as strings)
    const normalizeAnalysisSession = (raw: AnalysisSession): AnalysisSession => {
      return {
        ...raw,
        createdAt: new Date(raw.createdAt as unknown as string),
        completedAt: raw.completedAt ? new Date(raw.completedAt as unknown as string) : undefined,
      };
    };

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
        const normalized = normalizeAnalysisSession(session);
        
        // Update cache
        analysisCache.set(sessionId, normalized);

        setState(prev => ({ 
          ...prev, 
          session: normalized,
          error: undefined,
          isLoading: normalized.status === 'pending' || normalized.status === 'scraping' || normalized.status === 'analyzing'
        }));

        // Stop polling if analysis is complete or failed
        if (normalized.status === 'complete' || normalized.status === 'error') {
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

      // Don't set isLoading to false here - let the polling handle the state
      // The loading state will be managed by the session status

    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        isLoading: false,
        error: error as ApiError 
      }));
    }
    // Remove the finally block that was setting isLoading to false
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

      // Don't set isLoading to false here - let the polling handle the state

    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        isLoading: false,
        error: error as ApiError 
      }));
    }
    // Remove the finally block that was setting isLoading to false
  }, [state.session?.id, startPolling]);

  // Manually refresh session status
  const refreshStatus = useCallback(async () => {
    if (!currentSessionIdRef.current) return;

    try {
      const session = await apiClient.getAnalysisStatus(currentSessionIdRef.current);
      const normalized: AnalysisSession = {
        ...session,
        createdAt: new Date(session.createdAt as unknown as string),
        completedAt: session.completedAt ? new Date(session.completedAt as unknown as string) : undefined,
      };
      analysisCache.set(currentSessionIdRef.current, normalized);
      
      setState(prev => ({ 
        ...prev, 
        session: normalized,
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