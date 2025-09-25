import { useEffect, useRef, useState, useCallback } from 'react';
import { WebSocketMessage, AnalysisProgress, AnalysisResults } from '../../../shared/types';

export interface WebSocketState {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  lastMessage: WebSocketMessage | null;
  connectionAttempts: number;
  lastConnectedAt: Date | null;
}

export interface UseWebSocketReturn extends WebSocketState {
  subscribe: (sessionId: string) => void;
  unsubscribe: (sessionId: string) => void;
  reconnect: () => void;
}

export const useWebSocket = (
  onProgress?: (progress: AnalysisProgress) => void,
  onComplete?: (results: AnalysisResults) => void,
  onError?: (error: string) => void
): UseWebSocketReturn => {
  const [state, setState] = useState<WebSocketState>({
    isConnected: false,
    isConnecting: false,
    error: null,
    lastMessage: null,
    connectionAttempts: 0,
    lastConnectedAt: null
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  // Reconnect indefinitely with capped backoff
  const maxReconnectDelayMs = 10000;
  const subscribedSessionsRef = useRef<Set<string>>(new Set());
  const manualCloseRef = useRef(false);

  const connect = useCallback(() => {
    // Clear any pending reconnect timers
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Avoid duplicate connections
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    manualCloseRef.current = false;
    setState(prev => ({ 
      ...prev, 
      isConnecting: true, 
      error: null,
      connectionAttempts: prev.connectionAttempts + 1
    }));

    try {
      // Use development proxy or direct connection based on environment
      const isDevelopment = window.location.hostname === 'localhost' && window.location.port === '5174';
      let wsUrl: string;
      
      if (isDevelopment) {
        // In development, use the Vite proxy on port 5174
        wsUrl = `ws://localhost:5174/ws/progress`;
      } else {
        // In production, connect directly
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${protocol}//${window.location.host}/ws/progress`;
      }
      
      console.log('Connecting to WebSocket:', wsUrl);
      wsRef.current = new WebSocket(wsUrl);

      // Set a connection timeout
      const connectionTimeout = setTimeout(() => {
        if (wsRef.current?.readyState === WebSocket.CONNECTING) {
          console.warn('WebSocket connection timeout');
          wsRef.current.close();
          setState(prev => ({ 
            ...prev, 
            isConnecting: false,
            error: isDevelopment 
              ? 'Backend server not running. Please start with: npm run dev:backend'
              : 'Connection timeout. Server may be unavailable.'
          }));
        }
      }, 5000);

      wsRef.current.onopen = () => {
        clearTimeout(connectionTimeout);
        console.log('WebSocket connected successfully');
        setState(prev => ({ 
          ...prev, 
          isConnected: true, 
          isConnecting: false, 
          error: null,
          lastConnectedAt: new Date()
        }));
        reconnectAttemptsRef.current = 0;

        // Re-subscribe to any sessions we were subscribed to
        subscribedSessionsRef.current.forEach(sessionId => {
          wsRef.current?.send(JSON.stringify({
            type: 'subscribe',
            sessionId
          }));
        });
      };

      wsRef.current.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          
          setState(prev => ({ ...prev, lastMessage: message }));

          switch (message.type) {
            case 'progress':
              onProgress?.(message.data as AnalysisProgress);
              break;
            case 'complete':
              onComplete?.(message.data as AnalysisResults);
              break;
            case 'error':
              const errorData = message.data as { error: string };
              onError?.(errorData.error);
              break;
            case 'connected':
            case 'subscribed':
            case 'unsubscribed':
              // Handle connection status messages
              console.log('WebSocket status:', message.type, message.data);
              break;
            case 'keepalive':
              // Reset connection state on keep-alive to prevent false disconnections
              setState(prev => ({ 
                ...prev, 
                isConnected: true, 
                error: null 
              }));
              reconnectAttemptsRef.current = 0;
              break;
            default:
              console.warn('Unknown WebSocket message type:', message.type);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
          setState(prev => ({ 
            ...prev, 
            error: 'Failed to parse server message' 
          }));
        }
      };

      wsRef.current.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        setState(prev => ({ 
          ...prev, 
          isConnected: false, 
          isConnecting: false 
        }));

        // Don't auto-reconnect if we intentionally closed the socket
        if (manualCloseRef.current) {
          return;
        }

        // Always attempt to reconnect (indefinitely) with capped backoff
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), maxReconnectDelayMs);
        console.log(`Attempting to reconnect in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1})`);

        setState(prev => ({ 
          ...prev, 
          error: `Connection lost. Reconnecting in ${Math.ceil(delay/1000)}s... (attempt ${reconnectAttemptsRef.current + 1})`
        }));

        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttemptsRef.current++;
          connect();
        }, delay);
      };

      wsRef.current.onerror = (error) => {
        clearTimeout(connectionTimeout);
        console.error('WebSocket error:', error);
        
        const isDevelopment = window.location.hostname === 'localhost' && window.location.port === '5174';
        let errorMessage = 'WebSocket connection failed';
        
        if (isDevelopment && reconnectAttemptsRef.current === 0) {
          errorMessage = 'Backend server not running. Please start with: npm run dev';
        } else {
          errorMessage = 'Connection error. Attempting to reconnect...';
        }
        
        setState(prev => ({ 
          ...prev, 
          error: errorMessage,
          isConnecting: false 
        }));
      };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      setState(prev => ({ 
        ...prev, 
        error: 'Failed to establish WebSocket connection',
        isConnecting: false 
      }));
    }
  }, [onProgress, onComplete, onError]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    manualCloseRef.current = true;
    if (wsRef.current) {
      wsRef.current.close(1000, 'Component unmounting');
      wsRef.current = null;
    }

    subscribedSessionsRef.current.clear();
    setState({
      isConnected: false,
      isConnecting: false,
      error: null,
      lastMessage: null,
      connectionAttempts: 0,
      lastConnectedAt: null
    });
  }, []);

  const subscribe = useCallback((sessionId: string) => {
    subscribedSessionsRef.current.add(sessionId);
    
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'subscribe',
        sessionId
      }));
    }
  }, []);

  const unsubscribe = useCallback((sessionId: string) => {
    subscribedSessionsRef.current.delete(sessionId);
    
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'unsubscribe',
        sessionId
      }));
    }
  }, []);

  const reconnect = useCallback(() => {
    // Force a reconnect cycle without marking as manual close
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    reconnectAttemptsRef.current = 0;
    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close(4000, 'Manual reconnect');
      }
    } catch {}
    setTimeout(connect, 100);
  }, [connect]);

  useEffect(() => {
    connect();
    return disconnect;
  }, [connect, disconnect]);

  return {
    ...state,
    subscribe,
    unsubscribe,
    reconnect
  };
};