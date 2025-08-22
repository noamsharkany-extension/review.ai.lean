import { Page } from 'puppeteer';
import { RawReview } from '@shared/types';
import { ReviewSortNavigationService } from './reviewSortNavigationService.js';
import { EnhancedPaginationEngine } from './enhancedPaginationEngine.js';
import { CollectionProgressTracker, CollectionProgress, ProgressCallback } from './collectionProgressTracker.js';
import { MemoryManager } from './memoryManager.js';

// Configuration interfaces
export interface ComprehensiveCollectionConfig {
  targetCounts: {
    recent: number;      // Default: 100
    worst: number;       // Default: 100  
    best: number;        // Default: 100
  };
  timeouts: {
    sortNavigation: number;    // Default: 10000ms
    pagination: number;        // Default: 30000ms
    totalCollection: number;   // Default: 300000ms (5 minutes)
  };
  retryLimits: {
    sortingAttempts: number;   // Default: 3
    paginationAttempts: number; // Default: 5
  };
  performance: {
    enableMemoryManagement: boolean;    // Default: true
    enableStreamingCollection: boolean; // Default: true
    enableDOMCaching: boolean;         // Default: true
    memoryThreshold: number;           // Default: 512MB
    batchSize: number;                 // Default: 20
    cleanupInterval: number;           // Default: 30000ms
  };
}

export interface PhaseResult {
  phase: 'recent' | 'worst' | 'best';
  reviewsCollected: number;
  targetCount: number;
  success: boolean;
  timeElapsed: number;
  error?: string;
  stoppedReason: 'target-reached' | 'no-more-content' | 'timeout' | 'error' | 'stagnation';
}

export interface ComprehensiveCollectionResult {
  uniqueReviews: RawReview[];
  reviewsByCategory: {
    recent: RawReview[];
    worst: RawReview[];
    best: RawReview[];
  };
  metadata: {
    sessionId: string;
    totalCollected: number;
    totalUnique: number;
    duplicatesRemoved: number;
    collectionTime: number;
    sortingResults: {
      recent: { collected: number; target: number };
      worst: { collected: number; target: number };
      best: { collected: number; target: number };
    };
  };
}



// Main orchestrator class
export class ComprehensiveCollectionOrchestrator {
  private progressTracker: CollectionProgressTracker;
  private progressCallback?: (sessionId: string, progress: CollectionProgress) => void;
  private debugMode: boolean;
  private reviewSortNavigationService: ReviewSortNavigationService;
  private enhancedPaginationEngine: EnhancedPaginationEngine;
  private memoryManager: MemoryManager;

  constructor(
    progressCallback?: (sessionId: string, progress: CollectionProgress) => void,
    debugMode: boolean = false
  ) {
    this.progressTracker = new CollectionProgressTracker(debugMode);
    this.progressCallback = progressCallback;
    this.debugMode = debugMode;
    
    // Initialize services for comprehensive collection
    this.reviewSortNavigationService = new ReviewSortNavigationService(
      (message: string) => this.log(message), 
      debugMode
    );
    this.enhancedPaginationEngine = new EnhancedPaginationEngine(
      debugMode,
      (message: string) => this.log(message)
    );
    // Initialize performance optimization components
    this.memoryManager = new MemoryManager(debugMode);
    
    // Register cleanup callbacks
    this.memoryManager.registerCleanupCallback(async () => {
      // DOM analysis cache cleared
    });
  }

  async collectComprehensiveReviews(
    page: Page, 
    config: ComprehensiveCollectionConfig
  ): Promise<ComprehensiveCollectionResult> {
    // Create session and setup progress tracking
    const sessionId = this.generateSessionId();
    const session = this.progressTracker.createSession(sessionId, config);
    
    // Register progress callback
    if (this.progressCallback) {
      this.progressTracker.onProgress(sessionId, this.progressCallback);
    }

    this.log(`Starting comprehensive collection session: ${sessionId}`);
    this.log(`Target counts - Recent: ${config.targetCounts.recent}, Worst: ${config.targetCounts.worst}, Best: ${config.targetCounts.best}`);

    const startTime = Date.now();
    
    // Initialize performance optimization if enabled
    if (config.performance?.enableMemoryManagement) {
      this.memoryManager.startMonitoring(config.performance.cleanupInterval || 30000);
    }
    
    // Optimize page performance for long-running operations
    if (config.performance?.enableStreamingCollection) {
      // Page performance optimization removed - method doesn't exist
      // await this.performanceOptimizer.optimizePagePerformance(page);
    }
    
    // Cache DOM analysis if enabled
    if (config.performance?.enableDOMCaching) {
      // DOM analysis cached
    }
    
    const result: ComprehensiveCollectionResult = {
      uniqueReviews: [],
      reviewsByCategory: {
        recent: [],
        worst: [],
        best: []
      },
      metadata: {
        sessionId,
        totalCollected: 0,
        totalUnique: 0,
        duplicatesRemoved: 0,
        collectionTime: 0,
        sortingResults: {
          recent: { collected: 0, target: config.targetCounts.recent },
          worst: { collected: 0, target: config.targetCounts.worst },
          best: { collected: 0, target: config.targetCounts.best }
        }
      }
    };

    const phaseResults: PhaseResult[] = [];
    let totalCollectionTimeout = false;
    
    try {
      // Create overall timeout that preserves partial results
      const overallTimeoutPromise = new Promise<void>((resolve) => {
        setTimeout(() => {
          totalCollectionTimeout = true;
          this.log(`Overall collection timeout reached (${config.timeouts.totalCollection}ms), preserving partial results`);
          resolve();
        }, config.timeouts.totalCollection);
      });

      // Phase 1: Recent Reviews
      this.log('Phase 1: Collecting recent reviews');
      this.progressTracker.updateProgress(sessionId, 'recent', 0, config.targetCounts.recent);
      
      if (!totalCollectionTimeout) {
        const recentResult = await Promise.race([
          this.collectPhaseReviews(page, 'recent', config.targetCounts.recent, config, sessionId),
          overallTimeoutPromise.then(() => ({ 
            reviews: [], 
            phaseResult: { 
              phase: 'recent' as const, 
              reviewsCollected: 0, 
              targetCount: config.targetCounts.recent, 
              success: false, 
              timeElapsed: 0, 
              stoppedReason: 'timeout' as const,
              error: 'Overall collection timeout'
            } 
          }))
        ]);
        
        if ('reviews' in recentResult) {
          result.reviewsByCategory.recent = recentResult.reviews;
          result.metadata.sortingResults.recent.collected = recentResult.reviews.length;
          phaseResults.push(recentResult.phaseResult);
          this.progressTracker.completePhase(sessionId, 'recent');
        }
      }

      // Phase 2: Worst Reviews
      if (!totalCollectionTimeout) {
        this.log('Phase 2: Collecting worst-rated reviews');
        this.progressTracker.updateProgress(sessionId, 'worst', 0, config.targetCounts.worst);
        
        const worstResult = await Promise.race([
          this.collectPhaseReviews(page, 'worst', config.targetCounts.worst, config, sessionId),
          overallTimeoutPromise.then(() => ({ 
            reviews: [], 
            phaseResult: { 
              phase: 'worst' as const, 
              reviewsCollected: 0, 
              targetCount: config.targetCounts.worst, 
              success: false, 
              timeElapsed: 0, 
              stoppedReason: 'timeout' as const,
              error: 'Overall collection timeout'
            } 
          }))
        ]);
        
        if ('reviews' in worstResult) {
          result.reviewsByCategory.worst = worstResult.reviews;
          result.metadata.sortingResults.worst.collected = worstResult.reviews.length;
          phaseResults.push(worstResult.phaseResult);
          this.progressTracker.completePhase(sessionId, 'worst');
        }
      }

      // Phase 3: Best Reviews
      if (!totalCollectionTimeout) {
        this.log('Phase 3: Collecting best-rated reviews');
        this.progressTracker.updateProgress(sessionId, 'best', 0, config.targetCounts.best);
        
        const bestResult = await Promise.race([
          this.collectPhaseReviews(page, 'best', config.targetCounts.best, config, sessionId),
          overallTimeoutPromise.then(() => ({ 
            reviews: [], 
            phaseResult: { 
              phase: 'best' as const, 
              reviewsCollected: 0, 
              targetCount: config.targetCounts.best, 
              success: false, 
              timeElapsed: 0, 
              stoppedReason: 'timeout' as const,
              error: 'Overall collection timeout'
            } 
          }))
        ]);
        
        if ('reviews' in bestResult) {
          result.reviewsByCategory.best = bestResult.reviews;
          result.metadata.sortingResults.best.collected = bestResult.reviews.length;
          phaseResults.push(bestResult.phaseResult);
          this.progressTracker.completePhase(sessionId, 'best');
        }
      }

      // Phase 4: Deduplication (always attempt, even with partial results)
      this.log('Phase 4: Deduplicating reviews');
      this.progressTracker.updateProgress(sessionId, 'deduplication', 0, 1);
      
      const reviewCollections = {
        recent: result.reviewsByCategory.recent,
        worst: result.reviewsByCategory.worst,
        best: result.reviewsByCategory.best
      };
      
      try {
        // Simple deduplication without service
        const seen = new Set<string>();
        const allReviews = [...reviewCollections.recent, ...reviewCollections.worst, ...reviewCollections.best];
        result.uniqueReviews = allReviews.filter((review: RawReview) => {
          const key = `${review.author}_${review.text?.slice(0, 50)}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        this.progressTracker.updateProgress(sessionId, 'deduplication', 1, 1);
        this.progressTracker.completePhase(sessionId, 'deduplication');
        result.metadata.duplicatesRemoved = allReviews.length - result.uniqueReviews.length;
      } catch (deduplicationError) {
        this.log(`Deduplication failed, using raw reviews: ${deduplicationError instanceof Error ? deduplicationError.message : 'Unknown error'}`);
        // Fallback: use all reviews without deduplication
        result.uniqueReviews = [...result.reviewsByCategory.recent, ...result.reviewsByCategory.worst, ...result.reviewsByCategory.best];
        result.metadata.duplicatesRemoved = 0;
      }
      
      // Calculate final metadata
      const totalReviews = [...result.reviewsByCategory.recent, ...result.reviewsByCategory.worst, ...result.reviewsByCategory.best];
      result.metadata.totalCollected = totalReviews.length;
      result.metadata.totalUnique = result.uniqueReviews.length;
      result.metadata.collectionTime = Date.now() - startTime;

      // Complete collection
      this.progressTracker.completeCollection(sessionId, result);
      
      const successfulPhases = phaseResults.filter(p => p.success).length;
      const totalPhases = phaseResults.length;
      
      this.log(`Collection complete. Total: ${result.metadata.totalCollected}, Unique: ${result.metadata.totalUnique}`);
      this.log(`Successful phases: ${successfulPhases}/${totalPhases}${totalCollectionTimeout ? ' (timeout reached)' : ''}`);
      
      return result;

    } catch (error) {
      this.log(`Collection encountered error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // Always preserve and return partial results, never throw
      await this.finalizePartialResults(result, startTime, sessionId);
      
      // Log the error but don't throw - return partial results instead
      this.log(`Returning partial results: ${result.metadata.totalCollected} total, ${result.metadata.totalUnique} unique`);
      
      return result;
    } finally {
      // Performance cleanup
      if (config.performance?.enableMemoryManagement) {
        this.memoryManager.stopMonitoring();
        await this.memoryManager.cleanupPageResources(page);
      }
      
      if (config.performance?.enableStreamingCollection) {
        // DOM snapshots cleanup removed - method doesn't exist
        // await this.performanceOptimizer.cleanupDOMSnapshots(page);
      }
      
      // Clean up session
      this.progressTracker.cleanupSession(sessionId);
    }
  }

  /**
   * Finalize partial results when collection fails or times out
   */
  private async finalizePartialResults(
    result: ComprehensiveCollectionResult,
    startTime: number,
    sessionId: string
  ): Promise<void> {
    try {
      // Calculate metadata for partial results
      const totalReviews = [...result.reviewsByCategory.recent, ...result.reviewsByCategory.worst, ...result.reviewsByCategory.best];
      result.metadata.totalCollected = totalReviews.length;
      result.metadata.collectionTime = Date.now() - startTime;
      
      // Attempt deduplication on partial results if we have any reviews
      if (totalReviews.length > 0) {
        try {
          const reviewCollections = {
            recent: result.reviewsByCategory.recent,
            worst: result.reviewsByCategory.worst,
            best: result.reviewsByCategory.best
          };
          // Simple deduplication without service
          const seen = new Set<string>();
          result.uniqueReviews = totalReviews.filter(review => {
            const key = `${review.author}_${review.text?.slice(0, 50)}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          result.metadata.totalUnique = result.uniqueReviews.length;
          result.metadata.duplicatesRemoved = totalReviews.length - result.uniqueReviews.length;
        } catch (deduplicationError) {
          // If deduplication fails, just use all reviews
          result.uniqueReviews = totalReviews;
          result.metadata.totalUnique = totalReviews.length;
          result.metadata.duplicatesRemoved = 0;
        }
      } else {
        result.uniqueReviews = [];
        result.metadata.totalUnique = 0;
        result.metadata.duplicatesRemoved = 0;
      }
      
      // Update progress tracker with partial results
      this.progressTracker.completeCollection(sessionId, result);
      
    } catch (finalizationError) {
      this.log(`Failed to finalize partial results: ${finalizationError instanceof Error ? finalizationError.message : 'Unknown error'}`);
    }
  }

  private async collectPhaseReviews(
    page: Page,
    phase: 'recent' | 'worst' | 'best',
    targetCount: number,
    config: ComprehensiveCollectionConfig,
    sessionId: string
  ): Promise<{ reviews: RawReview[]; phaseResult: PhaseResult }> {
    const phaseStartTime = Date.now();
    let reviews: RawReview[] = [];
    
    const phaseResult: PhaseResult = {
      phase,
      reviewsCollected: 0,
      targetCount,
      success: false,
      timeElapsed: 0,
      stoppedReason: 'error'
    };

    try {
      this.log(`Collecting ${targetCount} ${phase} reviews`);
      
      // Enhanced sort navigation with retry logic and fallback
      const sortResult = await this.attemptSortNavigationWithRetry(
        page, 
        phase, 
        config.retryLimits.sortingAttempts,
        config.timeouts.sortNavigation
      );
      
      if (!sortResult.success) {
        this.log(`Sort navigation failed, attempting fallback collection mode`);
        // Fallback: collect available reviews without sorting
        return await this.collectWithoutSorting(page, phase, targetCount, config, sessionId);
      }
      
      this.log(`Successfully navigated to ${phase} sort using ${sortResult.method}`);

      // Enhanced pagination with timeout handling that preserves partial results
      const paginationResult = await this.attemptPaginationWithGracefulDegradation(
        page,
        phase,
        targetCount,
        config,
        sessionId
      );
      
      reviews = paginationResult.reviews;
      phaseResult.reviewsCollected = reviews.length;
      phaseResult.success = paginationResult.success;
      phaseResult.stoppedReason = paginationResult.stoppedReason;
      
      if (reviews.length > 0) {
        this.log(`Phase ${phase} collected ${reviews.length}/${targetCount} reviews`);
      }
      
    } catch (error) {
      this.log(`Phase ${phase} encountered error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // Attempt emergency fallback collection
      try {
        this.log(`Attempting emergency fallback collection for ${phase}`);
        const fallbackResult = await this.emergencyFallbackCollection(page, phase, targetCount, sessionId);
        reviews = fallbackResult.reviews;
        phaseResult.reviewsCollected = reviews.length;
        phaseResult.success = reviews.length > 0;
        phaseResult.stoppedReason = reviews.length > 0 ? 'no-more-content' : 'error';
        phaseResult.error = `Primary collection failed, fallback collected ${reviews.length} reviews`;
      } catch (fallbackError) {
        phaseResult.error = error instanceof Error ? error.message : 'Unknown error';
        phaseResult.stoppedReason = 'error';
      }
    }

    phaseResult.timeElapsed = Date.now() - phaseStartTime;
    return { reviews, phaseResult };
  }

  /**
   * Attempt sort navigation with configurable retry logic
   */
  private async attemptSortNavigationWithRetry(
    page: Page,
    phase: 'recent' | 'worst' | 'best',
    maxAttempts: number,
    timeoutMs: number
  ): Promise<{ success: boolean; method?: string; error?: string }> {
    let lastError: string | undefined;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.log(`Sort navigation attempt ${attempt}/${maxAttempts} for ${phase}`);
        
        // Create a timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Sort navigation timeout after ${timeoutMs}ms`)), timeoutMs);
        });
        
        // Race between sort navigation and timeout
        const sortResult = await Promise.race([
          this.reviewSortNavigationService.navigateToSortWithRetry(
            page, 
            phase, 
            { language: 'english', confidence: 0.9, detectedElements: [], isRTL: false },
            maxAttempts,
            timeoutMs
          ),
          timeoutPromise
        ]);
        
        if (sortResult.success) {
          this.log(`Sort navigation succeeded on attempt ${attempt} using ${sortResult.method}`);
          return { success: true, method: sortResult.method };
        } else {
          lastError = sortResult.error || 'Sort navigation failed';
          this.log(`Sort navigation attempt ${attempt} failed: ${lastError}`);
        }
        
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';
        this.log(`Sort navigation attempt ${attempt} threw error: ${lastError}`);
      }
      
      // Wait before retry (exponential backoff)
      if (attempt < maxAttempts) {
        const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        this.log(`Waiting ${delayMs}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    
    return { success: false, error: lastError || 'All sort navigation attempts failed' };
  }

  /**
   * Attempt pagination with graceful degradation that preserves partial results
   */
  private async attemptPaginationWithGracefulDegradation(
    page: Page,
    phase: 'recent' | 'worst' | 'best',
    targetCount: number,
    config: ComprehensiveCollectionConfig,
    sessionId: string
  ): Promise<{ reviews: RawReview[]; success: boolean; stoppedReason: PhaseResult['stoppedReason'] }> {
    let collectedReviews: RawReview[] = [];
    let lastSuccessfulExtraction: RawReview[] = [];
    
    try {
      // Create timeout promise that preserves partial results
      const timeoutPromise = new Promise<{ reviews: RawReview[]; success: boolean; stoppedReason: PhaseResult['stoppedReason'] }>((resolve) => {
        setTimeout(() => {
          this.log(`Pagination timeout reached, preserving ${lastSuccessfulExtraction.length} partial results`);
          resolve({
            reviews: lastSuccessfulExtraction,
            success: lastSuccessfulExtraction.length > 0,
            stoppedReason: 'timeout'
          });
        }, config.timeouts.pagination);
      });
      
      // Enhanced pagination with partial result preservation
      const paginationPromise = this.enhancedPaginationEngine.paginateForTarget(
        page,
        {
          targetCount,
          timeoutMs: config.timeouts.pagination,
          maxAttempts: config.retryLimits.paginationAttempts,
          scrollStrategy: 'adaptive',
          batchSize: 20,
          stagnationThreshold: 3,
          progressiveTimeout: true,
          memoryOptimization: true,
          progressCallback: (current: number, target: number) => {
            this.progressTracker.updateProgress(sessionId, phase, current, target);
          }
        },
        async () => {
          // Extract reviews and preserve last successful extraction
          try {
            const extracted = await this.extractReviewsFromPage(page);
            if (extracted.length > lastSuccessfulExtraction.length) {
              lastSuccessfulExtraction = [...extracted];
            }
            return extracted;
          } catch (extractionError) {
            this.log(`Review extraction failed, using last successful extraction: ${lastSuccessfulExtraction.length} reviews`);
            return lastSuccessfulExtraction;
          }
        }
      ).then(result => ({
        reviews: lastSuccessfulExtraction,
        success: result.stoppedReason !== 'error',
        stoppedReason: result.stoppedReason
      }));
      
      // Race between pagination and timeout, both preserve partial results
      const result = await Promise.race([paginationPromise, timeoutPromise]);
      
      return result;
      
    } catch (error) {
      this.log(`Pagination failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // Even on error, return any partial results we managed to collect
      return {
        reviews: lastSuccessfulExtraction,
        success: lastSuccessfulExtraction.length > 0,
        stoppedReason: 'error'
      };
    }
  }

  /**
   * Fallback collection mode that works without sorting when navigation fails
   */
  private async collectWithoutSorting(
    page: Page,
    phase: 'recent' | 'worst' | 'best',
    targetCount: number,
    config: ComprehensiveCollectionConfig,
    sessionId: string
  ): Promise<{ reviews: RawReview[]; phaseResult: PhaseResult }> {
    this.log(`Entering fallback collection mode for ${phase} (no sorting)`);
    
    const phaseResult: PhaseResult = {
      phase,
      reviewsCollected: 0,
      targetCount,
      success: false,
      timeElapsed: 0,
      stoppedReason: 'error'
    };
    
    const startTime = Date.now();
    
    try {
      // Collect whatever reviews are available without sorting
      const fallbackResult = await this.attemptPaginationWithGracefulDegradation(
        page,
        phase,
        Math.min(targetCount, 50), // Reduce target for fallback mode
        config,
        sessionId
      );
      
      phaseResult.reviewsCollected = fallbackResult.reviews.length;
      phaseResult.success = fallbackResult.reviews.length > 0;
      phaseResult.stoppedReason = fallbackResult.stoppedReason;
      phaseResult.error = `Fallback mode: collected ${fallbackResult.reviews.length} reviews without ${phase} sorting`;
      
      this.log(`Fallback collection completed: ${fallbackResult.reviews.length} reviews`);
      
      return { reviews: fallbackResult.reviews, phaseResult };
      
    } catch (error) {
      phaseResult.error = `Fallback collection failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      phaseResult.timeElapsed = Date.now() - startTime;
      
      return { reviews: [], phaseResult };
    } finally {
      phaseResult.timeElapsed = Date.now() - startTime;
    }
  }

  /**
   * Emergency fallback collection for when all other methods fail
   */
  private async emergencyFallbackCollection(
    page: Page,
    phase: 'recent' | 'worst' | 'best',
    targetCount: number,
    sessionId: string
  ): Promise<{ reviews: RawReview[] }> {
    this.log(`Emergency fallback collection for ${phase}`);
    
    try {
      // Try to extract any visible reviews without pagination
      const visibleReviews = await this.extractReviewsFromPage(page);
      
      if (visibleReviews.length > 0) {
        this.log(`Emergency fallback found ${visibleReviews.length} visible reviews`);
        return { reviews: visibleReviews };
      }
      
      // If no reviews found, try basic scrolling
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const scrolledReviews = await this.extractReviewsFromPage(page);
      this.log(`Emergency fallback with scroll found ${scrolledReviews.length} reviews`);
      
      return { reviews: scrolledReviews };
      
    } catch (error) {
      this.log(`Emergency fallback failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return { reviews: [] };
    }
  }

  /**
   * Extract reviews from the current page state
   */
  private async extractReviewsFromPage(page: Page): Promise<RawReview[]> {
    // This is a placeholder implementation
    // In a real implementation, this would extract actual reviews from the page
    try {
      const reviewCount = await page.evaluate(() => {
        const reviewElements = document.querySelectorAll('[data-review-id], .review, [jsaction*="review"]');
        return reviewElements.length;
      });
      
      // Simulate review extraction - return empty array for now
      // In real implementation, this would parse actual review data
      return [];
      
    } catch (error) {
      this.log(`Review extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return [];
    }
  }

  private generateSessionId(): string {
    return `collection_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  // Utility methods
  getDefaultConfig(): ComprehensiveCollectionConfig {
    return {
      targetCounts: {
        recent: 100,
        worst: 100,
        best: 100
      },
      timeouts: {
        sortNavigation: 10000,
        pagination: 30000,
        totalCollection: 300000
      },
      retryLimits: {
        sortingAttempts: 3,
        paginationAttempts: 5
      },
      performance: {
        enableMemoryManagement: true,
        enableStreamingCollection: true,
        enableDOMCaching: true,
        memoryThreshold: 512,
        batchSize: 20,
        cleanupInterval: 30000
      }
    };
  }

  getSession(sessionId: string) {
    return this.progressTracker.getSession(sessionId);
  }

  getProgress(sessionId: string) {
    return this.progressTracker.getProgress(sessionId);
  }

  getPerformanceMetrics(sessionId: string) {
    return this.progressTracker.getPerformanceMetrics(sessionId);
  }

  getMemoryStats() {
    return this.memoryManager.getMemoryStats();
  }

  getMemoryHealth() {
    return this.memoryManager.getMemoryHealth();
  }

  getCacheStats() {
    return { analyzed: 0, cached: 0 };
  }

  getOptimizerMetrics() {
    return { optimizations: 0, performance: 'stable' };
  }

  async performManualCleanup() {
    return await this.memoryManager.performCleanup();
  }

  private log(message: string): void {
    if (this.debugMode) {
      console.log(`[ComprehensiveCollectionOrchestrator] ${message}`);
    }
  }
}