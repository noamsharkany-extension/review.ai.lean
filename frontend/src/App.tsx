import { useCallback, useEffect } from 'react'
import { Layout } from './components/Layout'
import { UrlInput } from './components/UrlInput'
import { ResultsArea } from './components/ResultsArea'
import { ErrorDisplay, ErrorInfo, createErrorInfo } from './components/ErrorDisplay'
import { PhaseIndicator } from './components/LoadingStates'
import { WebSocketStatus } from './components/WebSocketStatus'
import { useWebSocket } from './hooks/useWebSocket'
import { useAnalysisSession } from './hooks/useAnalysisSession'
import { AnalysisResults, AnalysisProgress } from '../../shared/types'

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

  const handleProgress = useCallback((progress: AnalysisProgress) => {
    // Progress updates are now handled through WebSocket
    // The session state will be updated via polling
  }, []);

  const handleComplete = useCallback((results: AnalysisResults) => {
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
  
  const { isConnected, reconnect, subscribe, unsubscribe } = websocketState;

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
    sessionId: session?.id,
    timestamp: new Date()
  } : undefined;

  // Determine current state - include all active phases
  const isLoading = sessionLoading || (session?.status === 'pending' || session?.status === 'scraping' || session?.status === 'analyzing' || session?.status === 'sampling' || session?.status === 'sentiment' || session?.status === 'fake_detection' || session?.status === 'verdict');
  const results = session?.status === 'complete' ? session.results : undefined;
  const progress = session?.progress;

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
        {isLoading && progress && (
          <div className="w-full max-w-4xl mx-auto">
            <PhaseIndicator
              currentPhase={progress.phase}
              progress={progress.progress}
              message={progress.message}
            />
          </div>
        )}

        {/* Results Section */}
        <ResultsArea 
          results={results}
          isLoading={isLoading && !progress}
          error={error?.message}
        />
      </div>
    </Layout>
  )
}

export default App