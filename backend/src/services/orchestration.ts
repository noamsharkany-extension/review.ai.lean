import { EventEmitter } from 'events';
import { 
  AnalysisSession, 
  AnalysisProgress, 
  AnalysisResults, 
  RawReview,
  SentimentAnalysis,
  FakeReviewAnalysis,
  SampledReviews
} from '@shared/types';
import { GoogleReviewScraperService } from './scraper.js';
import { IntelligentSamplingEngine } from './sampling.js';
import { OpenAIAnalysisEngine } from './analysis.js';
import { ReviewVerdictGenerator } from './verdict.js';
import { DatabaseService } from './database.js';

export interface AnalysisOrchestrationService {
  startAnalysis(googleUrl: string): Promise<string>;
  getAnalysisStatus(sessionId: string): Promise<AnalysisSession | null>;
  retryFailedStep(sessionId: string): Promise<void>;
  on(event: 'progress' | 'complete' | 'error', listener: (sessionId: string, data: any) => void): void;
}

export class ReviewAnalysisOrchestrator extends EventEmitter implements AnalysisOrchestrationService {
  private sessions: Map<string, AnalysisSession> = new Map();
  private scraper: GoogleReviewScraperService;
  private samplingEngine: IntelligentSamplingEngine;
  private analysisEngine: OpenAIAnalysisEngine;
  private verdictGenerator: ReviewVerdictGenerator;
  private databaseService: DatabaseService | null;

  constructor(databaseService?: DatabaseService) {
    super();
    this.databaseService = databaseService || null;
    
    // Pass progress callback to scraper for detailed logging
    this.scraper = new GoogleReviewScraperService((message: string) => {
      // Find the current session and emit detailed progress
      for (const [sessionId, session] of this.sessions.entries()) {
        if (session.status === 'scraping') {
          this.emit('progress', sessionId, {
            phase: 'scraping',
            progress: session.progress.progress,
            message
          });
          break;
        }
      }
    });
    this.samplingEngine = new IntelligentSamplingEngine();
    this.analysisEngine = new OpenAIAnalysisEngine();
    this.verdictGenerator = new ReviewVerdictGenerator();
  }

  async startAnalysis(googleUrl: string): Promise<string> {
    const sessionId = this.generateSessionId();
    
    const session: AnalysisSession = {
      id: sessionId,
      googleUrl,
      status: 'pending',
      progress: {
        phase: 'scraping',
        progress: 0,
        message: 'Initializing analysis...'
      },
      createdAt: new Date()
    };

    this.sessions.set(sessionId, session);
    
    // Save session to database if available
    if (this.databaseService) {
      try {
        await this.databaseService.createSession(session);
      } catch (error) {
        console.warn('Failed to save session to database:', error);
      }
    }
    
    // Wire session context to scraper for per-session headless file logging
    try {
      this.scraper.setSessionContext(sessionId, googleUrl);
    } catch {}

    // Start the analysis process asynchronously
    this.runAnalysisWorkflow(sessionId).catch(error => {
      this.handleAnalysisError(sessionId, error);
    });

    return sessionId;
  }

  async getAnalysisStatus(sessionId: string): Promise<AnalysisSession | null> {
    // Check memory first
    const memorySession = this.sessions.get(sessionId);
    if (memorySession) {
      return memorySession;
    }

    // If not in memory and we have database service, try to load from database
    if (this.databaseService) {
      try {
        const dbSession = await this.databaseService.getSession(sessionId);
        if (dbSession) {
          // Restore to memory for faster subsequent access
          this.sessions.set(sessionId, dbSession);
          return dbSession;
        }
      } catch (error) {
        console.warn('Failed to load session from database:', error);
      }
    }

    return null;
  }

  async retryFailedStep(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Analysis session not found');
    }
    
    if (session.status !== 'error') {
      throw new Error(`Cannot retry analysis in '${session.status}' state. Only failed analyses can be retried.`);
    }

    // Check if error is retryable
    const errorDetails = (session as any).errorDetails;
    if (errorDetails && !errorDetails.retryable) {
      throw new Error(`This error cannot be retried: ${errorDetails.message}`);
    }

    // Reset session to retry from the failed phase
    const failedPhase = session.progress.phase;
    session.status = failedPhase as any;
    session.progress = {
      phase: failedPhase,
      progress: 0,
      message: `Retrying ${failedPhase} phase...`
    };

    // Clear error details
    delete (session as any).errorDetails;
    this.sessions.set(sessionId, session);

    // Emit retry started event
    this.emit('progress', sessionId, session.progress);

    // Restart the workflow from the failed phase
    try {
      await this.runAnalysisWorkflowFromPhase(sessionId, failedPhase);
    } catch (error) {
      this.handleAnalysisError(sessionId, error);
    }
  }

  private async runAnalysisWorkflowFromPhase(sessionId: string, startPhase: AnalysisProgress['phase']): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    try {
      let reviews: RawReview[] = [];
      let sampledReviews: SampledReviews = { reviews: [], breakdown: { recent: 0, fivestar: 0, onestar: 0 }, samplingUsed: false };
      let sentimentAnalysis: SentimentAnalysis[] = [];
      let fakeAnalysis: FakeReviewAnalysis[] = [];

      // Execute phases starting from the failed phase
      switch (startPhase) {
        case 'scraping':
          reviews = await this.executeScrapingPhase(sessionId);
          if (startPhase === 'scraping') {
            sampledReviews = await this.executeSamplingPhase(sessionId, reviews);
            sentimentAnalysis = await this.executeSentimentAnalysisPhase(sessionId, sampledReviews.reviews);
            fakeAnalysis = await this.executeFakeDetectionPhase(sessionId, sampledReviews.reviews);
          }
          break;
        case 'sampling':
          // If retrying from sampling, we need the reviews from previous execution
          // For now, we'll re-scrape. In production, you might want to cache intermediate results
          reviews = await this.executeScrapingPhase(sessionId);
          sampledReviews = await this.executeSamplingPhase(sessionId, reviews);
          if (startPhase === 'sampling') {
            sentimentAnalysis = await this.executeSentimentAnalysisPhase(sessionId, sampledReviews.reviews);
            fakeAnalysis = await this.executeFakeDetectionPhase(sessionId, sampledReviews.reviews);
          }
          break;
        case 'sentiment':
          // Re-execute previous phases if needed
          reviews = await this.executeScrapingPhase(sessionId);
          sampledReviews = await this.executeSamplingPhase(sessionId, reviews);
          sentimentAnalysis = await this.executeSentimentAnalysisPhase(sessionId, sampledReviews.reviews);
          if (startPhase === 'sentiment') {
            fakeAnalysis = await this.executeFakeDetectionPhase(sessionId, sampledReviews.reviews);
          }
          break;
        case 'fake-detection':
          // Re-execute previous phases if needed
          reviews = await this.executeScrapingPhase(sessionId);
          sampledReviews = await this.executeSamplingPhase(sessionId, reviews);
          sentimentAnalysis = await this.executeSentimentAnalysisPhase(sessionId, sampledReviews.reviews);
          fakeAnalysis = await this.executeFakeDetectionPhase(sessionId, sampledReviews.reviews);
          break;
        case 'verdict':
          if (startPhase === 'verdict') {
            // Re-execute previous phases if needed
            reviews = await this.executeScrapingPhase(sessionId);
            sampledReviews = await this.executeSamplingPhase(sessionId, reviews);
            sentimentAnalysis = await this.executeSentimentAnalysisPhase(sessionId, sampledReviews.reviews);
            fakeAnalysis = await this.executeFakeDetectionPhase(sessionId, sampledReviews.reviews);
          }
          const results = await this.executeVerdictPhase(sessionId, reviews, sampledReviews, sentimentAnalysis, fakeAnalysis);
          await this.completeAnalysis(sessionId, results);
          break;
      }
    } catch (error) {
      throw error; // Re-throw to be handled by caller
    }
  }

  private async runAnalysisWorkflow(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    try {
      // Phase 1: Scraping Reviews
      const reviews = await this.executeScrapingPhase(sessionId);
      
      // Phase 2: Sampling Reviews
      const sampledReviews = await this.executeSamplingPhase(sessionId, reviews);
      
      // Phase 3: Sentiment Analysis
      const sentimentAnalysis = await this.executeSentimentAnalysisPhase(sessionId, sampledReviews.reviews);
      
      // Phase 4: Fake Review Detection
      const fakeAnalysis = await this.executeFakeDetectionPhase(sessionId, sampledReviews.reviews);
      
      // Phase 5: Generate Verdict
      const results = await this.executeVerdictPhase(sessionId, reviews, sampledReviews, sentimentAnalysis, fakeAnalysis);
      
      // Complete the analysis
      await this.completeAnalysis(sessionId, results);

    } catch (error) {
      this.handleAnalysisError(sessionId, error);
    }
  }

  private async executeScrapingPhase(sessionId: string): Promise<RawReview[]> {
    const session = this.sessions.get(sessionId)!;
    // Reuse cached reviews if available to avoid re-scraping on retries
    if (session.cachedReviews && session.cachedReviews.length > 0) {
      this.updateProgress(sessionId, {
        phase: 'scraping',
        progress: 100,
        message: `Using cached ${session.cachedReviews.length} reviews (skipped scraping)`
      });
      return session.cachedReviews;
    }
    
    this.updateProgress(sessionId, {
      phase: 'scraping',
      progress: 5,
      message: 'Validating Google URL...'
    });

    // Validate URL first
    if (!this.scraper.validateUrl(session.googleUrl)) {
      throw new Error('Invalid Google URL provided. Please provide a valid Google Maps, Google Search, or other Google URL that shows reviews.');
    }

    this.updateProgress(sessionId, {
      phase: 'scraping',
      progress: 15,
      message: 'Starting browser and navigation...'
    });

    // Scrape reviews with enhanced retry logic and comprehensive timeout handling
    const reviews = await this.executeWithRetry(
      async () => {
        // Add overall timeout for scraping operation with more generous time
        return await Promise.race([
          this.scraper.scrapeReviews(session.googleUrl),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Scraping operation timeout after 300 seconds')), 300000)
          )
        ]);
      },
      3, // Increased retries with better error handling
      'Failed to scrape reviews after multiple attempts'
    );

    if (!reviews || reviews.length === 0) {
      throw new Error('No reviews found on this page. Please verify the URL contains reviews and try again.');
    }

    // Cache reviews for future retries in the same session
    session.cachedReviews = reviews;
    this.sessions.set(sessionId, session);

    this.updateProgress(sessionId, {
      phase: 'scraping',
      progress: 100,
      message: `Successfully scraped ${reviews.length} reviews`
    });

    return reviews;
  }

  private async executeSamplingPhase(sessionId: string, reviews: RawReview[]): Promise<SampledReviews> {
    // Reuse cached sampling if available and reviews match length (basic check)
    const session = this.sessions.get(sessionId)!;
    if (session.cachedSampledReviews && session.cachedSampledReviews.reviews.length <= reviews.length) {
      this.updateProgress(sessionId, {
        phase: 'sampling',
        progress: 100,
        message: session.cachedSampledReviews.samplingUsed 
          ? `Using cached sampling: ${session.cachedSampledReviews.reviews.length} reviews` 
          : `Using cached sampling: analyzing all ${reviews.length} reviews`
      });
      return session.cachedSampledReviews;
    }

    this.updateProgress(sessionId, {
      phase: 'sampling',
      progress: 20,
      message: 'Analyzing review dataset...'
    });

    const sampledReviews = this.samplingEngine.sampleReviews(reviews);

    // Cache sampled result for retries
    session.cachedSampledReviews = sampledReviews;
    this.sessions.set(sessionId, session);

    this.updateProgress(sessionId, {
      phase: 'sampling',
      progress: 100,
      message: sampledReviews.samplingUsed 
        ? `Applied intelligent sampling: ${sampledReviews.reviews.length} reviews selected`
        : `No sampling needed: analyzing all ${reviews.length} reviews`
    });

    return sampledReviews;
  }

  private async executeSentimentAnalysisPhase(sessionId: string, reviews: RawReview[]): Promise<SentimentAnalysis[]> {
    this.updateProgress(sessionId, {
      phase: 'sentiment',
      progress: 10,
      message: 'Starting sentiment analysis with OpenAI...'
    });

    const sentimentAnalysis = await this.executeWithRetry(
      async () => {
        const results = await this.analysisEngine.analyzeSentiment(reviews);
        
        // Update progress during analysis
        this.updateProgress(sessionId, {
          phase: 'sentiment',
          progress: 75,
          message: 'Processing sentiment analysis results...'
        });
        
        return results;
      },
      2,
      'Failed to complete sentiment analysis after multiple attempts'
    );

    this.updateProgress(sessionId, {
      phase: 'sentiment',
      progress: 100,
      message: `Sentiment analysis complete: ${sentimentAnalysis.filter(s => s.mismatchDetected).length} mismatches detected`
    });

    return sentimentAnalysis;
  }

  private async executeFakeDetectionPhase(sessionId: string, reviews: RawReview[]): Promise<FakeReviewAnalysis[]> {
    this.updateProgress(sessionId, {
      phase: 'fake-detection',
      progress: 10,
      message: 'Starting fake review detection with OpenAI...'
    });

    const fakeAnalysis = await this.executeWithRetry(
      async () => {
        const results = await this.analysisEngine.detectFakeReviews(reviews);
        
        // Update progress during analysis
        this.updateProgress(sessionId, {
          phase: 'fake-detection',
          progress: 75,
          message: 'Processing fake review detection results...'
        });
        
        return results;
      },
      2,
      'Failed to complete fake review detection after multiple attempts'
    );

    this.updateProgress(sessionId, {
      phase: 'fake-detection',
      progress: 100,
      message: `Fake review detection complete: ${fakeAnalysis.filter(f => f.isFake).length} suspicious reviews identified`
    });

    return fakeAnalysis;
  }

  private async executeVerdictPhase(
    sessionId: string,
    originalReviews: RawReview[],
    sampledReviews: SampledReviews,
    sentimentAnalysis: SentimentAnalysis[],
    fakeAnalysis: FakeReviewAnalysis[]
  ): Promise<AnalysisResults> {
    this.updateProgress(sessionId, {
      phase: 'verdict',
      progress: 25,
      message: 'Calculating verdict scores...'
    });

    const results = this.verdictGenerator.generateVerdict(
      sampledReviews.reviews,
      sentimentAnalysis,
      fakeAnalysis,
      sampledReviews,
      originalReviews.length // Pass original review count
    );

    this.updateProgress(sessionId, {
      phase: 'verdict',
      progress: 75,
      message: 'Generating citations and transparency report...'
    });

    this.updateProgress(sessionId, {
      phase: 'verdict',
      progress: 100,
      message: 'Analysis complete!'
    });

    return results;
  }

  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number,
    errorMessage: string
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Executing operation attempt ${attempt}/${maxRetries}`);
        const result = await operation();
        if (attempt > 1) {
          console.log(`Operation succeeded on attempt ${attempt}`);
        }
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.log(`Operation failed on attempt ${attempt}: ${lastError.message}`);
        
        if (attempt < maxRetries) {
          // Progressive backoff with jitter to avoid thundering herd
          const baseDelay = Math.min(2000 * Math.pow(1.5, attempt - 1), 15000);
          const jitter = Math.random() * 1000;
          const delay = baseDelay + jitter;
          
          console.log(`Retrying in ${Math.round(delay)}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    console.error(`Operation failed after ${maxRetries} attempts: ${lastError!.message}`);
    throw new Error(`${errorMessage}: ${lastError!.message}`);
  }

  private updateProgress(sessionId: string, progress: AnalysisProgress): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.progress = progress;
    session.status = progress.phase as any;
    this.sessions.set(sessionId, session);

    // Emit progress event
    this.emit('progress', sessionId, progress);
  }

  private async completeAnalysis(sessionId: string, results: AnalysisResults): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = 'complete';
    session.results = results;
    session.completedAt = new Date();
    session.progress = {
      phase: 'verdict',
      progress: 100,
      message: 'Analysis complete!'
    };

    this.sessions.set(sessionId, session);

    // Save results to database if available
    if (this.databaseService) {
      try {
        await this.databaseService.saveResults(sessionId, results);
        await this.databaseService.updateSession(sessionId, {
          status: 'complete',
          completedAt: new Date(),
          progress: session.progress
        });
      } catch (error) {
        console.warn('Failed to save results to database:', error);
      }
    }

    // Emit completion event
    this.emit('complete', sessionId, results);
  }

  private handleAnalysisError(sessionId: string, error: unknown): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error(`Analysis error in session ${sessionId}:`, errorMessage);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    // Determine error type and whether it's retryable with more comprehensive categorization
    let errorType = 'unknown';
    let retryable = true;
    let userFriendlyMessage = errorMessage;
    
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      
      if (msg.includes('invalid google url') || msg.includes('validation')) {
        errorType = 'validation';
        retryable = false;
        userFriendlyMessage = 'The provided URL is not a valid Google URL with reviews. Please check the URL and try again.';
      } else if (msg.includes('no reviews found') || msg.includes('unable to find reviews section')) {
        errorType = 'no_reviews';
        retryable = false;
        userFriendlyMessage = 'No reviews were found on this page. Please verify the URL shows reviews and try again.';
      } else if (msg.includes('browser launch') || msg.includes('failed to launch browser')) {
        errorType = 'browser_launch';
        retryable = true;
        userFriendlyMessage = 'Failed to start the browser. This may be a temporary issue - please try again.';
      } else if (msg.includes('navigation') || msg.includes('page navigation') || msg.includes('net::err')) {
        errorType = 'navigation';
        retryable = true;
        userFriendlyMessage = 'Failed to load the Google page. Please check your internet connection and try again.';
      } else if (msg.includes('timeout') || msg.includes('etimedout') || msg.includes('scraping operation timeout')) {
        errorType = 'timeout';
        retryable = true;
        userFriendlyMessage = 'The operation took too long to complete (over 5 minutes). This may be due to slow internet, heavy page content, or a large number of reviews. Please try again.';
      } else if (msg.includes('scraping') || msg.includes('scrape') || msg.includes('puppeteer') || msg.includes('extraction')) {
        errorType = 'scraping';
        retryable = true;
        userFriendlyMessage = 'Failed to extract reviews from the page. The page structure may have changed. Please try again.';
      } else if (msg.includes('openai') || msg.includes('api') || msg.includes('rate limit')) {
        errorType = 'api';
        retryable = true;
        userFriendlyMessage = 'AI analysis service is temporarily unavailable. Please try again in a few moments.';
      } else if (msg.includes('network') || msg.includes('fetch') || msg.includes('enotfound') || msg.includes('econnrefused')) {
        errorType = 'network';
        retryable = true;
        userFriendlyMessage = 'Network connection error. Please check your internet connection and try again.';
      }
    }
    
    session.status = 'error';
    session.progress = {
      phase: session.progress.phase,
      progress: session.progress.progress,
      message: `Error: ${userFriendlyMessage}`
    };

    // Store comprehensive error details for debugging and recovery
    (session as any).errorDetails = {
      type: errorType,
      message: errorMessage,
      userFriendlyMessage,
      retryable,
      timestamp: new Date(),
      phase: session.progress.phase,
      stack: error instanceof Error ? error.stack : undefined,
      url: session.googleUrl,
      sessionDuration: Date.now() - session.createdAt.getTime()
    };

    this.sessions.set(sessionId, session);

    // Emit comprehensive error event
    this.emit('error', sessionId, { 
      error: userFriendlyMessage,
      originalError: errorMessage,
      type: errorType,
      retryable,
      phase: session.progress.phase,
      timestamp: new Date().toISOString()
    });

    // Log error for monitoring
    console.error(`[Analysis Error] Session: ${sessionId}, Type: ${errorType}, Phase: ${session.progress.phase}, Retryable: ${retryable}`);
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Cleanup method to remove old sessions
  public cleanupOldSessions(maxAgeHours: number = 24): void {
    const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.createdAt < cutoffTime) {
        this.sessions.delete(sessionId);
      }
    }
  }

  // Method to get all active sessions (for monitoring/debugging)
  public getActiveSessions(): AnalysisSession[] {
    return Array.from(this.sessions.values());
  }

  // Graceful shutdown
  public async shutdown(): Promise<void> {
    // Close the scraper browser
    await this.scraper.close();
    
    // Clear all sessions
    this.sessions.clear();
    
    // Remove all listeners
    this.removeAllListeners();
  }
}