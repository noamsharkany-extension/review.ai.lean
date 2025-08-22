import { Page } from 'puppeteer';
import { RawReview } from '../../../shared/types';

export interface PaginationConfig {
  targetCount: number;
  maxAttempts: number;
  scrollStrategy: 'aggressive' | 'conservative' | 'adaptive';
  progressCallback?: (current: number, target: number) => void;
  timeoutMs?: number;
  scrollDelayMs?: number;
  adaptiveThresholds?: {
    slowResponseMs: number;
    fastResponseMs: number;
  };
  // Enhanced configuration for large-scale collection
  batchSize?: number; // Process reviews in batches for memory efficiency
  stagnationThreshold?: number; // Number of attempts without progress before giving up
  progressiveTimeout?: boolean; // Increase timeout as we get closer to target
  memoryOptimization?: boolean; // Enable memory cleanup during long collections
}

export interface PaginationResult {
  reviewsCollected: number;
  pagesTraversed: number;
  paginationMethod: 'scroll' | 'click' | 'hybrid';
  stoppedReason: 'target-reached' | 'no-more-content' | 'timeout' | 'error' | 'stagnation';
  timeElapsed: number;
  scrollAttempts: number;
  clickAttempts: number;
  averageResponseTime: number;
  // Enhanced metrics for large-scale collection
  batchesProcessed: number;
  stagnationDetected: boolean;
  memoryCleanupCount: number;
  adaptiveAdjustments: number;
  progressiveTimeoutUsed: boolean;
}

export interface PaginationAttempt {
  method: 'scroll' | 'click';
  reviewsBeforeAttempt: number;
  reviewsAfterAttempt: number;
  responseTimeMs: number;
  success: boolean;
  error?: string;
  // Enhanced tracking for large-scale collection
  memoryUsageMB?: number;
  adaptiveAdjustment?: 'speed-up' | 'slow-down' | 'none';
  batchNumber?: number;
}

export class EnhancedPaginationEngine {
  private debugMode: boolean;
  private progressCallback?: (message: string) => void;

  constructor(debugMode: boolean = false, progressCallback?: (message: string) => void) {
    this.debugMode = debugMode;
    this.progressCallback = progressCallback;
  }

  private log(message: string): void {
    if (this.debugMode) {
      console.log(`[EnhancedPaginationEngine] ${message}`);
    }
    this.progressCallback?.(message);
  }

  /**
   * Main pagination method that handles large-scale review collection
   */
  async paginateForTarget(
    page: Page,
    config: PaginationConfig,
    extractionCallback: () => Promise<RawReview[]>
  ): Promise<PaginationResult> {
    const startTime = Date.now();
    const attempts: PaginationAttempt[] = [];
    let currentReviews: RawReview[] = [];
    let paginationAttempts = 0;
    let scrollAttempts = 0;
    let clickAttempts = 0;
    let stoppedReason: PaginationResult['stoppedReason'] = 'error';
    let paginationMethod: 'scroll' | 'click' | 'hybrid' = 'scroll';
    
    // Enhanced tracking for large-scale collection
    let batchesProcessed = 0;
    let stagnationCount = 0;
    let memoryCleanupCount = 0;
    let adaptiveAdjustments = 0;
    let progressiveTimeoutUsed = false;

    // Set default configuration values with enhanced defaults for large-scale collection
    const finalConfig: Required<PaginationConfig> & Required<Pick<PaginationConfig, 'batchSize' | 'stagnationThreshold' | 'progressiveTimeout' | 'memoryOptimization'>> = {
      targetCount: config.targetCount,
      maxAttempts: config.maxAttempts,
      scrollStrategy: config.scrollStrategy,
      progressCallback: config.progressCallback || (() => {}),
      timeoutMs: config.timeoutMs || (config.targetCount > 50 ? 600000 : 300000), // 10 minutes for large collections
      scrollDelayMs: config.scrollDelayMs || 1500,
      adaptiveThresholds: config.adaptiveThresholds || {
        slowResponseMs: 3000,
        fastResponseMs: 1000
      },
      batchSize: config.batchSize || Math.max(10, Math.floor(config.targetCount / 10)), // Process in batches
      stagnationThreshold: config.stagnationThreshold || Math.max(3, Math.floor(config.maxAttempts / 4)),
      progressiveTimeout: config.progressiveTimeout ?? (config.targetCount > 50),
      memoryOptimization: config.memoryOptimization ?? (config.targetCount > 50)
    };

    this.log(`Starting enhanced pagination for target: ${finalConfig.targetCount} reviews`);
    this.log(`Strategy: ${finalConfig.scrollStrategy}, Max attempts: ${finalConfig.maxAttempts}`);

    try {
      // Initial extraction to get baseline
      currentReviews = await extractionCallback();
      this.log(`Initial extraction: ${currentReviews.length} reviews found`);
      
      // Report initial progress
      finalConfig.progressCallback?.(currentReviews.length, finalConfig.targetCount);

      // Detect the best pagination method for this page
      paginationMethod = await this.detectPaginationMethod(page);
      this.log(`Detected pagination method: ${paginationMethod}`);

      // Main pagination loop with enhanced large-scale collection logic
      while (
        currentReviews.length < finalConfig.targetCount &&
        paginationAttempts < finalConfig.maxAttempts &&
        (Date.now() - startTime) < this.calculateDynamicTimeout(finalConfig, currentReviews.length, startTime) &&
        stagnationCount < finalConfig.stagnationThreshold
      ) {
        const attemptStartTime = Date.now();
        const reviewsBeforeAttempt = currentReviews.length;
        let attemptSuccess = false;
        let attemptError: string | undefined;
        let adaptiveAdjustment: 'speed-up' | 'slow-down' | 'none' = 'none';

        try {
          // Memory optimization for large collections
          if (finalConfig.memoryOptimization && paginationAttempts > 0 && paginationAttempts % 10 === 0) {
            await this.performMemoryCleanup(page);
            memoryCleanupCount++;
          }

          // Batch processing logic
          const currentBatch = Math.floor(currentReviews.length / finalConfig.batchSize);
          if (currentBatch > batchesProcessed) {
            batchesProcessed = currentBatch;
            this.log(`Processing batch ${batchesProcessed + 1} (${currentReviews.length}/${finalConfig.targetCount} reviews)`);
          }

          // Choose pagination strategy based on detected method and current strategy
          if (paginationMethod === 'scroll' || paginationMethod === 'hybrid') {
            // Enhanced scroll attempt with adaptive adjustments
            const scrollResult = await this.performEnhancedScrollAttempt(page, finalConfig, currentReviews.length, attempts);
            scrollAttempts++;
            adaptiveAdjustment = scrollResult.adaptiveAdjustment;
            if (scrollResult.adaptiveAdjustment !== 'none') {
              adaptiveAdjustments++;
            }
          }

          if (paginationMethod === 'click' || paginationMethod === 'hybrid') {
            // Try clicking load more buttons
            const clickSuccess = await this.performClickAttempt(page);
            if (clickSuccess) {
              clickAttempts++;
            }
          }

          // Enhanced content loading wait with progress tracking
          await this.waitForContentLoadWithProgress(page, finalConfig, currentReviews.length);

          // Extract reviews after pagination attempt
          const newReviews = await extractionCallback();
          const reviewsAfterAttempt = newReviews.length;
          
          // Check if we got new reviews
          if (reviewsAfterAttempt > reviewsBeforeAttempt) {
            currentReviews = newReviews;
            attemptSuccess = true;
            stagnationCount = 0; // Reset stagnation counter
            
            const newReviewsCount = reviewsAfterAttempt - reviewsBeforeAttempt;
            this.log(`Pagination attempt ${paginationAttempts + 1}: ${newReviewsCount} new reviews (total: ${reviewsAfterAttempt}/${finalConfig.targetCount})`);
            
            // Enhanced progress reporting with rate information
            const progressPercentage = Math.round((reviewsAfterAttempt / finalConfig.targetCount) * 100);
            const timeElapsed = Date.now() - startTime;
            const reviewsPerMinute = Math.round((reviewsAfterAttempt / timeElapsed) * 60000);
            this.log(`Progress: ${progressPercentage}% complete, ${reviewsPerMinute} reviews/min`);
            
            // Report progress
            finalConfig.progressCallback?.(reviewsAfterAttempt, finalConfig.targetCount);
          } else {
            this.log(`Pagination attempt ${paginationAttempts + 1}: No new reviews found`);
            stagnationCount++;
          }

          // Get memory usage if available
          const memoryUsage = await this.getMemoryUsage(page);

          // Record attempt with enhanced tracking
          const responseTime = Date.now() - attemptStartTime;
          attempts.push({
            method: paginationMethod === 'hybrid' ? 'scroll' : paginationMethod,
            reviewsBeforeAttempt,
            reviewsAfterAttempt,
            responseTimeMs: responseTime,
            success: attemptSuccess,
            error: attemptError,
            memoryUsageMB: memoryUsage,
            adaptiveAdjustment,
            batchNumber: batchesProcessed
          });

          // Enhanced stagnation detection
          if (!attemptSuccess) {
            if (paginationMethod === 'hybrid' && stagnationCount < 2) {
              this.log('Trying alternative pagination method due to stagnation...');
            } else if (stagnationCount >= finalConfig.stagnationThreshold) {
              this.log(`Stagnation detected: ${stagnationCount} attempts without progress`);
              stoppedReason = 'stagnation';
              break;
            }
          }

        } catch (error) {
          attemptError = error instanceof Error ? error.message : String(error);
          this.log(`Pagination attempt ${paginationAttempts + 1} failed: ${attemptError}`);
          
          attempts.push({
            method: paginationMethod === 'hybrid' ? 'scroll' : paginationMethod,
            reviewsBeforeAttempt,
            reviewsAfterAttempt: reviewsBeforeAttempt,
            responseTimeMs: Date.now() - attemptStartTime,
            success: false,
            error: attemptError,
            batchNumber: batchesProcessed
          });
          
          stagnationCount++;
        }

        paginationAttempts++;
      }

      // Determine final stopped reason with enhanced logic
      if (currentReviews.length >= finalConfig.targetCount) {
        stoppedReason = 'target-reached';
      } else if (stagnationCount >= finalConfig.stagnationThreshold) {
        stoppedReason = 'stagnation';
      } else if (paginationAttempts >= finalConfig.maxAttempts) {
        stoppedReason = 'no-more-content';
      } else if ((Date.now() - startTime) >= this.calculateDynamicTimeout(finalConfig, currentReviews.length, startTime)) {
        stoppedReason = 'timeout';
        if (finalConfig.progressiveTimeout) {
          progressiveTimeoutUsed = true;
        }
      }

    } catch (error) {
      this.log(`Pagination failed with error: ${error instanceof Error ? error.message : String(error)}`);
      stoppedReason = 'error';
    }

    const timeElapsed = Date.now() - startTime;
    const averageResponseTime = attempts.length > 0 
      ? attempts.reduce((sum, attempt) => sum + attempt.responseTimeMs, 0) / attempts.length 
      : 0;

    const result: PaginationResult = {
      reviewsCollected: currentReviews.length,
      pagesTraversed: paginationAttempts,
      paginationMethod,
      stoppedReason,
      timeElapsed,
      scrollAttempts,
      clickAttempts,
      averageResponseTime,
      batchesProcessed,
      stagnationDetected: stagnationCount >= finalConfig.stagnationThreshold,
      memoryCleanupCount,
      adaptiveAdjustments,
      progressiveTimeoutUsed
    };

    this.log(`Pagination completed: ${result.reviewsCollected}/${finalConfig.targetCount} reviews collected in ${result.timeElapsed}ms`);
    this.log(`Stopped reason: ${result.stoppedReason}, Method: ${result.paginationMethod}`);
    this.log(`Attempts - Scroll: ${result.scrollAttempts}, Click: ${result.clickAttempts}, Total: ${result.pagesTraversed}`);
    this.log(`Enhanced metrics - Batches: ${result.batchesProcessed}, Stagnation: ${result.stagnationDetected}, Memory cleanups: ${result.memoryCleanupCount}`);
    this.log(`Adaptive adjustments: ${result.adaptiveAdjustments}, Progressive timeout: ${result.progressiveTimeoutUsed}`);

    return result;
  }

  /**
   * Detects the best pagination method for the current page
   */
  private async detectPaginationMethod(page: Page): Promise<'scroll' | 'click' | 'hybrid'> {
    try {
      this.log('Detecting pagination method...');

      // Check for load more buttons
      const loadMoreSelectors = [
        'button[aria-label*="more" i]',
        'button[aria-label*="More"]',
        '.section-expand-review button',
        '[data-expandable-section] button',
        'button:has-text("Show more")',
        'button:has-text("Load more")',
        '.load-more',
        '.show-more',
        '.expand-reviews',
        '[role="button"][aria-label*="more" i]'
      ];

      let hasLoadMoreButton = false;
      for (const selector of loadMoreSelectors) {
        try {
          const button = await page.$(selector);
          if (button) {
            const isVisible = await button.isIntersectingViewport();
            if (isVisible) {
              hasLoadMoreButton = true;
              break;
            }
          }
        } catch (error) {
          // Continue checking other selectors
        }
      }

      // Check for scrollable containers
      const hasScrollableContainer = await page.evaluate(() => {
        const containers = [
          '.section-layout-root',
          '[role="main"]',
          '.section-listbox',
          '.reviews-container',
          '[data-review-id]'
        ];

        for (const containerSelector of containers) {
          const container = document.querySelector(containerSelector);
          if (container) {
            const hasScrollbar = container.scrollHeight > container.clientHeight;
            if (hasScrollbar) {
              return true;
            }
          }
        }
        return false;
      });

      // Determine method based on what we found
      if (hasLoadMoreButton && hasScrollableContainer) {
        this.log('Detected hybrid pagination (both scroll and click available)');
        return 'hybrid';
      } else if (hasLoadMoreButton) {
        this.log('Detected click-based pagination (load more buttons)');
        return 'click';
      } else if (hasScrollableContainer) {
        this.log('Detected scroll-based pagination (infinite scroll)');
        return 'scroll';
      } else {
        this.log('No clear pagination method detected, defaulting to scroll');
        return 'scroll';
      }

    } catch (error) {
      this.log(`Error detecting pagination method: ${error instanceof Error ? error.message : String(error)}`);
      return 'scroll'; // Default fallback
    }
  }





  /**
   * Standard scrolling with fixed parameters
   */
  private async standardScrolling(page: Page, config: Required<PaginationConfig>): Promise<void> {
    const scrollAmount = config.scrollStrategy === 'aggressive' ? 1500 : 1000;
    const scrollCount = config.scrollStrategy === 'aggressive' ? 5 : 3;

    this.log(`Performing ${config.scrollStrategy} scrolling (${scrollCount} scrolls of ${scrollAmount}px)`);

    for (let i = 0; i < scrollCount; i++) {
      await this.scrollPage(page, scrollAmount);
      await new Promise(resolve => setTimeout(resolve, config.scrollDelayMs));
    }
  }

  /**
   * Performs the actual scrolling on the page
   */
  private async scrollPage(page: Page, scrollAmount: number): Promise<void> {
    await page.evaluate((amount) => {
      // Try to find and scroll within the reviews container first
      const reviewsContainers = [
        '.section-layout-root',
        '[role="main"]',
        '.section-listbox',
        '.reviews-container'
      ];

      let scrolled = false;
      for (const containerSelector of reviewsContainers) {
        const container = document.querySelector(containerSelector) as HTMLElement;
        if (container && container.scrollHeight > container.clientHeight) {
          container.scrollTop += amount;
          scrolled = true;
          break;
        }
      }

      // Fallback to window scrolling if no container found
      if (!scrolled) {
        window.scrollBy(0, amount);
      }
    }, scrollAmount);
  }

  /**
   * Attempts to click load more buttons
   */
  private async performClickAttempt(page: Page): Promise<boolean> {
    const loadMoreSelectors = [
      'button[aria-label*="more" i]',
      'button[aria-label*="More"]',
      '.section-expand-review button',
      '[data-expandable-section] button',
      'button:has-text("Show more")',
      'button:has-text("Load more")',
      '.load-more',
      '.show-more',
      '.expand-reviews',
      '[role="button"][aria-label*="more" i]'
    ];

    for (const selector of loadMoreSelectors) {
      try {
        const button = await page.$(selector);
        if (button) {
          const isVisible = await button.isIntersectingViewport();
          const isEnabled = await button.evaluate(el => !el.hasAttribute('disabled') && !el.classList.contains('disabled'));
          
          if (isVisible && isEnabled) {
            this.log(`Clicking load more button: ${selector}`);
            await button.click();
            return true;
          }
        }
      } catch (error) {
        // Continue to next selector
        continue;
      }
    }

    return false;
  }



  /**
   * Enhanced content loading wait with progress tracking
   */
  private async waitForContentLoadWithProgress(
    page: Page, 
    config: Required<PaginationConfig> & Required<Pick<PaginationConfig, 'batchSize' | 'stagnationThreshold' | 'progressiveTimeout' | 'memoryOptimization'>>, 
    currentReviewCount: number
  ): Promise<void> {
    // Adaptive wait time based on collection size
    const baseWaitTime = config.scrollDelayMs;
    const adaptiveWaitTime = currentReviewCount > 50 ? baseWaitTime * 1.2 : baseWaitTime;
    
    await new Promise(resolve => setTimeout(resolve, adaptiveWaitTime));

    // Enhanced network idle detection for large collections
    try {
      const timeout = currentReviewCount > 100 ? 8000 : 5000;
      // Use Puppeteer's waitForFunction to detect when content has loaded
      await page.waitForFunction(() => {
        return document.readyState === 'complete';
      }, { timeout });
    } catch (error) {
      // Fallback wait with adaptive timing
      const fallbackWait = currentReviewCount > 100 ? 2000 : 1000;
      await new Promise(resolve => setTimeout(resolve, fallbackWait));
    }
  }

  /**
   * Calculates dynamic timeout based on progress and configuration
   */
  private calculateDynamicTimeout(
    config: Required<PaginationConfig> & Required<Pick<PaginationConfig, 'batchSize' | 'stagnationThreshold' | 'progressiveTimeout' | 'memoryOptimization'>>, 
    currentReviewCount: number, 
    startTime: number
  ): number {
    if (!config.progressiveTimeout) {
      return config.timeoutMs;
    }

    // Calculate progress percentage
    const progressPercentage = currentReviewCount / config.targetCount;
    
    // Increase timeout as we get closer to target (more time for final reviews)
    if (progressPercentage > 0.8) {
      return config.timeoutMs * 1.5; // 50% more time for final 20%
    } else if (progressPercentage > 0.5) {
      return config.timeoutMs * 1.2; // 20% more time after 50%
    }
    
    return config.timeoutMs;
  }

  /**
   * Performs memory cleanup during long collections
   */
  private async performMemoryCleanup(page: Page): Promise<void> {
    try {
      this.log('Performing memory cleanup...');
      
      // Clear browser cache and unused resources
      await page.evaluate(() => {
        // Clear any cached DOM references
        if (window.gc) {
          window.gc();
        }
        
        // Remove any debug elements that might accumulate
        const debugElements = document.querySelectorAll('[data-debug], .debug-info');
        debugElements.forEach(el => el.remove());
        
        // Clear any large data structures in window object
        if ((window as any).reviewData) {
          delete (window as any).reviewData;
        }
      });
      
      // Small delay to allow cleanup to complete
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      this.log(`Memory cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Gets current memory usage if available
   */
  private async getMemoryUsage(page: Page): Promise<number | undefined> {
    try {
      const memoryInfo = await page.evaluate(() => {
        if ('memory' in performance) {
          const memory = (performance as any).memory;
          return memory.usedJSHeapSize ? Math.round(memory.usedJSHeapSize / 1024 / 1024) : undefined;
        }
        return undefined;
      });
      return memoryInfo;
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Enhanced scroll attempt with adaptive adjustments
   */
  private async performEnhancedScrollAttempt(
    page: Page, 
    config: Required<PaginationConfig> & Required<Pick<PaginationConfig, 'batchSize' | 'stagnationThreshold' | 'progressiveTimeout' | 'memoryOptimization'>>, 
    currentReviewCount: number,
    previousAttempts: PaginationAttempt[]
  ): Promise<{ adaptiveAdjustment: 'speed-up' | 'slow-down' | 'none' }> {
    try {
      let adaptiveAdjustment: 'speed-up' | 'slow-down' | 'none' = 'none';
      
      if (config.scrollStrategy === 'adaptive') {
        const result = await this.adaptiveScrollingEnhanced(page, config, currentReviewCount, previousAttempts);
        adaptiveAdjustment = result.adaptiveAdjustment;
      } else {
        await this.standardScrolling(page, config);
      }
      
      return { adaptiveAdjustment };
    } catch (error) {
      this.log(`Enhanced scroll attempt failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Enhanced adaptive scrolling with learning from previous attempts
   */
  private async adaptiveScrollingEnhanced(
    page: Page, 
    config: Required<PaginationConfig> & Required<Pick<PaginationConfig, 'batchSize' | 'stagnationThreshold' | 'progressiveTimeout' | 'memoryOptimization'>>,
    currentReviewCount: number,
    previousAttempts: PaginationAttempt[]
  ): Promise<{ adaptiveAdjustment: 'speed-up' | 'slow-down' | 'none' }> {
    this.log('Performing enhanced adaptive scrolling...');

    let adaptiveAdjustment: 'speed-up' | 'slow-down' | 'none' = 'none';
    
    // Analyze recent performance to adjust strategy
    const recentAttempts = previousAttempts.slice(-5); // Last 5 attempts
    const averageResponseTime = recentAttempts.length > 0 
      ? recentAttempts.reduce((sum, attempt) => sum + attempt.responseTimeMs, 0) / recentAttempts.length 
      : 1000;
    
    const successRate = recentAttempts.length > 0 
      ? recentAttempts.filter(attempt => attempt.success).length / recentAttempts.length 
      : 0.5;

    // Perform initial scroll with adaptive parameters
    let scrollAmount = 1000;
    let scrollDelay = config.scrollDelayMs;
    let scrollCount = 3;

    // Adjust based on current collection size and performance
    if (currentReviewCount > 100) {
      // For large collections, be more conservative
      scrollAmount = 800;
      scrollDelay = Math.max(scrollDelay, 2000);
      scrollCount = 2;
      adaptiveAdjustment = 'slow-down';
    } else if (averageResponseTime > config.adaptiveThresholds.slowResponseMs || successRate < 0.3) {
      // Page is slow or success rate is low, use conservative scrolling
      scrollAmount = 600;
      scrollDelay = Math.min(scrollDelay * 1.5, 4000);
      scrollCount = 2;
      adaptiveAdjustment = 'slow-down';
      this.log(`Slow performance detected (${Math.round(averageResponseTime)}ms avg, ${Math.round(successRate * 100)}% success), using conservative scrolling`);
    } else if (averageResponseTime < config.adaptiveThresholds.fastResponseMs && successRate > 0.7) {
      // Page is fast and success rate is high, use aggressive scrolling
      scrollAmount = 1500;
      scrollDelay = Math.max(scrollDelay * 0.8, 1000);
      scrollCount = 4;
      adaptiveAdjustment = 'speed-up';
      this.log(`Fast performance detected (${Math.round(averageResponseTime)}ms avg, ${Math.round(successRate * 100)}% success), using aggressive scrolling`);
    } else {
      this.log(`Normal performance (${Math.round(averageResponseTime)}ms avg, ${Math.round(successRate * 100)}% success), using standard scrolling`);
    }

    // Perform scrolling with adaptive parameters
    for (let i = 0; i < scrollCount; i++) {
      await this.scrollPage(page, scrollAmount);
      await new Promise(resolve => setTimeout(resolve, scrollDelay));
      
      // For large collections, add progressive delays
      if (currentReviewCount > 50 && i < scrollCount - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    return { adaptiveAdjustment };
  }
}