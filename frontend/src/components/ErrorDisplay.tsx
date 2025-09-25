import React from 'react';

export interface ErrorInfo {
  type: 'scraping' | 'api' | 'network' | 'validation' | 'timeout' | 'not_found' | 'invalid_state' | 'unknown';
  message: string;
  details?: string;
  retryable: boolean;
  sessionId?: string;
}

interface ErrorDisplayProps {
  error: ErrorInfo;
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
}

const getErrorIcon = (type: ErrorInfo['type']) => {
  switch (type) {
    case 'scraping':
      return (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      );
    case 'network':
      return (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      );
    case 'api':
      return (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'timeout':
      return (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'validation':
      return (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      );
    default:
      return (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      );
  }
};

const getErrorColor = (type: ErrorInfo['type']) => {
  switch (type) {
    case 'validation':
      return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    case 'network':
    case 'timeout':
      return 'text-orange-600 bg-orange-50 border-orange-200';
    default:
      return 'text-red-600 bg-red-50 border-red-200';
  }
};

const getErrorTitle = (type: ErrorInfo['type']) => {
  switch (type) {
    case 'scraping':
      return 'Scraping Failed';
    case 'api':
      return 'API Error';
    case 'network':
      return 'Network Error';
    case 'validation':
      return 'Validation Error';
    case 'timeout':
      return 'Request Timeout';
    default:
      return 'Error';
  }
};

const getErrorSuggestion = (type: ErrorInfo['type']) => {
  switch (type) {
    case 'scraping':
      return 'The page might be temporarily unavailable or the URL format may have changed. Please try again or check if the URL is accessible.';
    case 'api':
      return 'Our analysis service encountered an issue. This is usually temporary - please try again in a moment.';
    case 'network':
      return 'Please check your internet connection and try again.';
    case 'validation':
      return 'Please check that you\'ve entered a valid Google URL that shows reviews.';
    case 'timeout':
      return 'The request took too long to complete. This might be due to a large number of reviews or server load.';
    default:
      return 'An unexpected error occurred. Please try again.';
  }
};

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({
  error,
  onRetry,
  onDismiss,
  className = ''
}) => {
  const colorClasses = getErrorColor(error.type);
  const title = getErrorTitle(error.type);
  const suggestion = getErrorSuggestion(error.type);

  return (
    <div className={`border rounded-lg p-6 ${colorClasses} ${className}`}>
      <div className="flex items-start">
        <div className="flex-shrink-0">
          {getErrorIcon(error.type)}
        </div>
        <div className="ml-3 flex-1">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">{title}</h3>
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="ml-2 flex-shrink-0 rounded-md p-1.5 hover:bg-black hover:bg-opacity-10 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-current"
              >
                <span className="sr-only">Dismiss</span>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </div>
          
          <p className="mt-1 text-sm font-medium">{error.message}</p>
          
          {error.details && (
            <details className="mt-2">
              <summary className="text-sm cursor-pointer hover:underline">
                Technical Details
              </summary>
              <p className="mt-1 text-sm opacity-75 font-mono text-xs bg-black bg-opacity-5 p-2 rounded">
                {error.details}
              </p>
            </details>
          )}
          
          <p className="mt-3 text-sm">{suggestion}</p>
          
          {error.retryable && onRetry && (
            <div className="mt-4 flex space-x-3">
              <button
                onClick={onRetry}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-current hover:bg-opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-current"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Helper function to create ErrorInfo from different error sources
export const createErrorInfo = (
  error: unknown,
  context: 'scraping' | 'api' | 'network' | 'validation' = 'api',
  sessionId?: string
): ErrorInfo => {
  if (error instanceof Error) {
    // Start with the provided context
    let type: ErrorInfo['type'] = context;
    let retryable = true;

    // Override with message-based detection only if context is 'api'
    if (context === 'api') {
      if (error.message.includes('validation') || error.message.includes('invalid')) {
        type = 'validation';
        retryable = false;
      } else if (error.message.includes('network') || error.message.includes('fetch')) {
        type = 'network';
      } else if (error.message.includes('timeout')) {
        type = 'timeout';
      } else if (error.message.includes('scraping') || error.message.includes('scrape')) {
        type = 'scraping';
      } else if (error.message.includes('API') || error.message.includes('OpenAI')) {
        type = 'api';
      }
    } else {
      // Set retryable based on the provided context
      if (context === 'validation') {
        retryable = false;
      }
    }

    return {
      type,
      message: error.message,
      details: error.stack,
      retryable,
      sessionId
    };
  }

  return {
    type: 'unknown',
    message: typeof error === 'string' ? error : 'An unexpected error occurred',
    retryable: true,
    sessionId
  };
};