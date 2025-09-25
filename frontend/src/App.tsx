import { useCallback, useEffect } from 'react'
import { Layout } from './components/Layout'
import { UrlInput } from './components/UrlInput'
import { ResultsArea } from './components/ResultsArea'
import { ErrorDisplay, ErrorInfo } from './components/ErrorDisplay'
import { PhaseIndicator } from './components/LoadingStates'
import { WebSocketStatus } from './components/WebSocketStatus'
import { useWebSocket } from './hooks/useWebSocket'
import { useAnalysisSession } from './hooks/useAnalysisSession'
// import { AnalysisResults, AnalysisProgress } from '../../shared/types'

function App() {
  const {
    session,
    isLoading: sessionLoading,
    error: sessionError,
    startAnalysis,
    retryAnalysis,
    clearError,
    clearSession
  } = useAnalysisSession();

  const handleProgress = useCallback((_progress: any) => {
    // Progress updates are now handled through WebSocket
    // The session state will be updated via polling
  }, []);

  const handleComplete = useCallback((_results: any) => {
    // Completion is now handled through session polling
    // This callback is kept for WebSocket real-time updates
  }, []);

  const handleWebSocketError = useCallback((error: string) => {
    console.warn('WebSocket error (non-critical):', error);
    // WebSocket errors are non-critical since we have polling fallback
  }, []);

  const websocketState = useWebSocket(
    handleProgress,
    handleComplete,
    handleWebSocketError
  );
  
  const { reconnect, subscribe, unsubscribe } = websocketState;

  // Subscribe to WebSocket updates when we have a session
  useEffect(() => {
    if (session?.id) {
      subscribe(session.id);
      return () => unsubscribe(session.id);
    }
  }, [session?.id, subscribe, unsubscribe]);

  const handleStartAnalysis = useCallback(async (url: string) => {
    try {
      await startAnalysis(url);
    } catch (error) {
      console.error('Failed to start analysis:', error);
    }
  }, [startAnalysis]);

  const handleRetry = useCallback(async () => {
    try {
      await retryAnalysis();
    } catch (error) {
      console.error('Failed to retry analysis:', error);
    }
  }, [retryAnalysis]);

  const handleRetryWithNewUrl = useCallback(() => {
    clearSession();
  }, [clearSession]);

  const handleDismissError = useCallback(() => {
    clearError();
  }, [clearError]);

  // Convert session error to ErrorInfo format
  const error: ErrorInfo | undefined = sessionError ? {
    message: sessionError.message,
    type: sessionError.type,
    retryable: sessionError.retryable,
    sessionId: session?.id
  } : undefined;

  // Determine current state - treat all phases except complete/error as loading
  const isLoading = sessionLoading || (!!session && session.status !== 'complete' && session.status !== 'error');
  const isComplete = session?.status === 'complete' && session.results;
  const results = isComplete ? session.results : undefined;
  const progress = session?.progress;

  // Debug logging for development
  if (process.env.NODE_ENV === 'development') {
    console.log('App State Debug:', {
      sessionLoading,
      sessionStatus: session?.status,
      hasResults: !!session?.results,
      isComplete,
      hasProgress: !!progress,
      sessionId: session?.id
    });
  }

  return (
    <Layout>
      {/* WebSocket Status Indicator */}
      <WebSocketStatus 
        websocketState={websocketState} 
        onReconnect={reconnect} 
      />
      
      <div className="space-y-8">
        {/* Introduction */}
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Analyze Google Reviews with AI
          </h2>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto">
            Get trustworthy insights from Google Reviews with intelligent sampling, 
            sentiment analysis, and fake review detection powered by OpenAI.
          </p>
          

        </div>

        {/* URL Input Section */}
        <UrlInput 
          onSubmit={handleStartAnalysis}
          isLoading={isLoading}
          disabled={isLoading}
        />

        {/* Error Display */}
        {error && (
          <div className="w-full max-w-4xl mx-auto">
            <ErrorDisplay
              error={error}
              onRetry={error.retryable ? handleRetry : undefined}
              onDismiss={handleDismissError}
            />
            
            {/* Additional retry options for certain error types */}
            {(error.type === 'scraping' || error.type === 'validation') && (
              <div className="mt-4 text-center">
                <button
                  onClick={handleRetryWithNewUrl}
                  className="text-blue-600 hover:text-blue-800 underline text-sm"
                >
                  Try a different URL instead
                </button>
              </div>
            )}
          </div>
        )}

        {/* Progress Indicator */}
        {isLoading && session && (
          <div className="w-full max-w-4xl mx-auto">
            <PhaseIndicator
              currentPhase={session.progress?.phase || 'scraping'}
              progress={session.progress?.progress ?? 0}
              message={session.progress?.message || 'Starting analysis...'}
            />
          </div>
        )}

        {/* Results Section */}
        <ResultsArea 
          results={results}
          isLoading={isLoading}
          session={session}
          error={error?.message}
        />

        {/* Debug Panel - Development Only */}
        {process.env.NODE_ENV === 'development' && session && (
          <div className="w-full max-w-4xl mx-auto mt-8">
            <details className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <summary className="text-sm font-medium text-gray-700 cursor-pointer hover:text-gray-900">
                Debug: Session State
              </summary>
              <div className="mt-3 text-xs text-gray-600 space-y-2">
                <div><strong>Session ID:</strong> {session.id}</div>
                <div><strong>Status:</strong> {session.status}</div>
                <div><strong>Has Results:</strong> {session.results ? 'Yes' : 'No'}</div>
                <div><strong>Has Progress:</strong> {session.progress ? 'Yes' : 'No'}</div>
                <div><strong>Progress Phase:</strong> {session.progress?.phase}</div>
                <div><strong>Progress %:</strong> {session.progress?.progress}%</div>
                <div><strong>Created:</strong> {session.createdAt.toISOString()}</div>
                <div><strong>Completed:</strong> {session.completedAt?.toISOString() || 'Not completed'}</div>
                {session.error && (
                  <div><strong>Error:</strong> {JSON.stringify(session.error)}</div>
                )}
                {session.results && (
                  <div><strong>Results Summary:</strong> {JSON.stringify({
                    verdict: session.results.verdict,
                    sampling: session.results.sampling,
                    citationsCount: session.results.citations.length
                  })}</div>
                )}
              </div>
            </details>
          </div>
        )}
      </div>
    </Layout>
  )
}

export default App