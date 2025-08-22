import { 
  AnalyzeRequest, 
  AnalyzeResponse, 
  AnalysisStatusResponse, 
  AnalysisResults,
  AnalysisSession 
} from '../../../shared/types';

export interface ApiError {
  message: string;
  type: 'validation' | 'network' | 'api' | 'scraping' | 'timeout' | 'not_found' | 'invalid_state';
  retryable: boolean;
  sessionId?: string;
}

export class ReviewAnalyzerApiClient {
  private baseUrl: string;
  private timeout: number;

  constructor(baseUrl?: string, timeout = 30000) {
    this.baseUrl = baseUrl || this.getDefaultBaseUrl();
    this.timeout = timeout;
  }

  private getDefaultBaseUrl(): string {
    // In development, use localhost:3001, in production use relative URLs
    if (import.meta.env.DEV) {
      return 'http://localhost:3001/api';
    }
    return '/api';
  }

  private async fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  }

  private createApiError(error: any, defaultType: ApiError['type'] = 'api'): ApiError {
    if (error instanceof Error) {
      // Network errors
      if (error.message.includes('fetch') || error.message.includes('NetworkError')) {
        return {
          message: 'Network error. Please check your internet connection and try again.',
          type: 'network',
          retryable: true
        };
      }

      // Timeout errors
      if (error.message.includes('timeout') || error.message.includes('AbortError')) {
        return {
          message: 'Request timed out. The server may be busy, please try again.',
          type: 'timeout',
          retryable: true
        };
      }

      return {
        message: error.message,
        type: defaultType,
        retryable: defaultType !== 'validation'
      };
    }

    // Handle error objects with message and type properties
    if (error && typeof error === 'object' && error.message) {
      return {
        message: error.message,
        type: error.type || defaultType,
        retryable: error.type !== 'validation'
      };
    }

    return {
      message: 'An unexpected error occurred',
      type: defaultType,
      retryable: true
    };
  }

  /**
   * Start a new analysis for the given Google URL
   */
  async startAnalysis(googleUrl: string): Promise<{ sessionId: string; status: string }> {
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/analyze`, {
        method: 'POST',
        body: JSON.stringify({ googleUrl } as AnalyzeRequest),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw this.createApiError({
          message: errorData.error || `HTTP ${response.status}: ${response.statusText}`,
          type: errorData.errorType || 'api'
        });
      }

      const data: AnalyzeResponse = await response.json();
      return data;
    } catch (error) {
      throw this.createApiError(error);
    }
  }

  /**
   * Get the status and results of an analysis session
   */
  async getAnalysisStatus(sessionId: string): Promise<AnalysisSession> {
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/analysis/${sessionId}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw this.createApiError({
          message: errorData.error || `HTTP ${response.status}: ${response.statusText}`,
          type: errorData.errorType || 'api'
        });
      }

      const data: AnalysisStatusResponse = await response.json();
      return data.session;
    } catch (error) {
      throw this.createApiError(error);
    }
  }

  /**
   * Retry a failed analysis
   */
  async retryAnalysis(sessionId: string): Promise<{ status: string; message: string }> {
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/analysis/${sessionId}/retry`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw this.createApiError({
          message: errorData.error || `HTTP ${response.status}: ${response.statusText}`,
          type: errorData.errorType || 'api'
        });
      }

      return await response.json();
    } catch (error) {
      throw this.createApiError(error);
    }
  }

  /**
   * Check if the API is healthy
   */
  async healthCheck(): Promise<{ status: string; message: string; timestamp: string }> {
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/health`);
      
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      throw this.createApiError(error);
    }
  }
}

// Create a singleton instance
export const apiClient = new ReviewAnalyzerApiClient();