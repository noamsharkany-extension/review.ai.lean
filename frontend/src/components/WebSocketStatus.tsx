import React from 'react';
import { WebSocketState } from '../hooks/useWebSocket';
import { isDevelopmentEnvironment } from '../utils/backendHealth';

interface WebSocketStatusProps {
  websocketState: WebSocketState;
  onReconnect: () => void;
}

export const WebSocketStatus: React.FC<WebSocketStatusProps> = ({ 
  websocketState, 
  onReconnect 
}) => {
  const { isConnected, isConnecting, error, connectionAttempts, lastConnectedAt } = websocketState;

  // Don't show anything if connected and no errors
  if (isConnected && !error) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 max-w-sm">
      {isConnecting && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 shadow-lg">
          <div className="flex items-center">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-600 mr-2"></div>
            <div className="text-sm text-yellow-800">
              Connecting to real-time updates...
              {connectionAttempts > 1 && (
                <span className="block text-xs text-yellow-600">
                  Attempt {connectionAttempts}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {!isConnected && !isConnecting && error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 shadow-lg">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-4 w-4 text-red-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-2 flex-1">
              <div className="text-sm text-red-800">
                Real-time updates unavailable
              </div>
              <div className="text-xs text-red-600 mt-1">
                {error}
              </div>
              
              {/* Development-specific guidance */}
              {isDevelopmentEnvironment() && error?.includes('Backend server not running') && (
                <div className="mt-2 p-2 bg-red-100 rounded text-xs text-red-700">
                  <div className="font-medium mb-1">Development Setup:</div>
                  <div>1. Open a new terminal</div>
                  <div>2. Run: <code className="bg-red-200 px-1 rounded">cd backend && npm run dev</code></div>
                  <div>3. Wait for "Server running on port 3001"</div>
                  <div>4. Refresh this page</div>
                </div>
              )}
              
              {lastConnectedAt && (
                <div className="text-xs text-red-500 mt-1">
                  Last connected: {lastConnectedAt.toLocaleTimeString()}
                </div>
              )}
              
              <div className="flex gap-2 mt-2">
                <button
                  onClick={onReconnect}
                  className="text-xs bg-red-100 hover:bg-red-200 text-red-800 px-2 py-1 rounded transition-colors"
                >
                  Try Reconnect
                </button>
                
                {isDevelopmentEnvironment() && (
                  <button
                    onClick={() => window.location.reload()}
                    className="text-xs bg-red-100 hover:bg-red-200 text-red-800 px-2 py-1 rounded transition-colors"
                  >
                    Refresh Page
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {isConnected && error && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 shadow-lg">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-4 w-4 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-2 text-sm text-green-800">
              Real-time updates reconnected
            </div>
          </div>
        </div>
      )}
    </div>
  );
};