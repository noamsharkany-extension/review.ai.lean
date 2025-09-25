/**
 * Backend health check utilities for development
 */

export interface BackendHealthStatus {
  isHealthy: boolean;
  isReachable: boolean;
  error?: string;
}

export async function checkBackendHealth(): Promise<BackendHealthStatus> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const response = await fetch('/api/health', {
      method: 'GET',
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    return {
      isHealthy: response.ok,
      isReachable: true,
      error: response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}`
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Check if it's a connection refused error
    const isConnectionRefused = errorMessage.includes('fetch') || 
                               errorMessage.includes('NetworkError') ||
                               errorMessage.includes('Failed to fetch');

    return {
      isHealthy: false,
      isReachable: !isConnectionRefused,
      error: isConnectionRefused 
        ? 'Backend server not running on port 3001'
        : errorMessage
    };
  }
}

export function isDevelopmentEnvironment(): boolean {
  // Frontend dev server uses port 5174 (see package.json and vite.config)
  return window.location.hostname === 'localhost' && window.location.port === '5174';
}

export function getBackendUrl(): string {
  if (isDevelopmentEnvironment()) {
    return 'http://localhost:3001';
  }
  
  const protocol = window.location.protocol;
  const host = window.location.host;
  return `${protocol}//${host}`;
}

export function getWebSocketUrl(): string {
  if (isDevelopmentEnvironment()) {
    // Use Vite proxy in development (port 5174)
    return `ws://localhost:5174/ws/progress`;
  }
  
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}/ws/progress`;
}