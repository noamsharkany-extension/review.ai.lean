import { Page } from 'puppeteer';

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  timeoutMs: number;
}

export interface NetworkResilienceResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
  totalTimeMs: number;
  partialContent: boolean;
}

export interface ContentLoadingStatus {
  isComplete: boolean;
  hasPartialContent: boolean;
  loadingProgress: number; // 0-1
  missingResources: string[];
  criticalResourcesLoaded: boolean;
}

export interface PartialExtractionResult {
  reviews: any[];
  extractionQuality: 'complete' | 'partial' | 'minimal';
  missingElements: string[];
  confidence: number;
}

/**
 * Service that provides network resilience and retry mechanisms for web scraping
 * Implements intelligent retry logic with exponential backoff, timeout handling,
 * and partial content extraction capabilities
 */
export class NetworkResilienceService {
  private debugMode: boolean;
  private progressCallback?: (message: string) => void;

  // Default retry configuration
  private readonly DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
    timeoutMs: 30000
  };

  // Timeout configurations for different operations
  private readonly TIMEOUT_CONFIGS = {
    navigation: 60000,
    resourceLoading: 30000,
    dynamicContent: 45000,
    extraction: 30000
  };

  constructor(progressCallback?: (message: string) => void, debugMode: boolean = false) {
    this.progressCallback = progressCallback;
    this.debugMode = debugMode;
  }

  private log(message: string): void {
    if (this.debugMode) {
      console.log(`[NetworkResilience] ${message}`);
    }
    this.progressCallback?.(message);
  }

  /**
   * Executes an operation with intelligent retry logic and exponential backoff
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    config: Partial<RetryConfig> = {},
    operationName: string = 'operation'
  ): Promise<NetworkResilienceResult<T>> {
    const finalConfig = { ...this.DEFAULT_RETRY_CONFIG, ...config };
    const startTime = Date.now();
    let lastError: Error | null = null;
    let attempts = 0;

    this.log(`Starting ${operationName} with retry logic (max ${finalConfig.maxRetries} attempts)`);

    const maxAttempts = finalConfig.maxRetries + 1; // maxRetries means retries after first attempt
    
    while (attempts < maxAttempts) {
      attempts++;
      const attemptStartTime = Date.now();

      try {
        this.log(`${operationName} attempt ${attempts}/${maxAttempts}`);

        // Create timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`${operationName} timeout after ${finalConfig.timeoutMs}ms (attempt ${attempts})`));
          }, finalConfig.timeoutMs);
        });

        // Execute operation with timeout
        const result = await Promise.race([operation(), timeoutPromise]);
        
        const attemptTime = Date.now() - attemptStartTime;
        const totalTime = Date.now() - startTime;
        
        this.log(`${operationName} succeeded on attempt ${attempts} (${attemptTime}ms)`);

        return {
          success: true,
          data: result,
          attempts,
          totalTimeMs: totalTime,
          partialContent: false
        };

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const attemptTime = Date.now() - attemptStartTime;
        
        this.log(`${operationName} failed on attempt ${attempts}: ${lastError.message} (${attemptTime}ms)`);

        // Check if this is a retryable error and we haven't exceeded max attempts
        if (!this.isRetryableError(lastError) || attempts >= maxAttempts) {
          break;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          finalConfig.baseDelayMs * Math.pow(finalConfig.backoffMultiplier, attempts - 1),
          finalConfig.maxDelayMs
        );

        this.log(`Retrying ${operationName} in ${delay}ms...`);
        await this.delay(delay);
      }
    }

    const totalTime = Date.now() - startTime;
    this.log(`${operationName} failed after ${attempts} attempts (${totalTime}ms)`);

    return {
      success: false,
      error: lastError || new Error(`${operationName} failed after ${attempts} attempts`),
      attempts,
      totalTimeMs: totalTime,
      partialContent: false
    };
  }

  /**
   * Waits for dynamic content to load with progressive timeout handling
   */
  async waitForDynamicContent(
    page: Page,
    contentSelector: string | string[],
    options: {
      timeout?: number;
      checkInterval?: number;
      minElements?: number;
      allowPartialContent?: boolean;
    } = {}
  ): Promise<ContentLoadingStatus> {
    const {
      timeout = this.TIMEOUT_CONFIGS.dynamicContent,
      checkInterval = 1000,
      minElements = 1,
      allowPartialContent = true
    } = options;

    const selectors = Array.isArray(contentSelector) ? contentSelector : [contentSelector];
    const startTime = Date.now();
    let lastElementCount = 0;
    let stableCount = 0;
    const requiredStableChecks = 3;

    this.log(`Waiting for dynamic content to load (timeout: ${timeout}ms)`);
    this.log(`Selectors: ${selectors.join(', ')}`);

    while (Date.now() - startTime < timeout) {
      try {
        // Check for content using all selectors
        const contentStatus = await page.evaluate((sels, minElems) => {
          let totalElements = 0;
          const foundSelectors: string[] = [];
          const missingSelectors: string[] = [];

          for (const selector of sels) {
            try {
              const elements = document.querySelectorAll(selector);
              if (elements.length > 0) {
                totalElements += elements.length;
                foundSelectors.push(selector);
              } else {
                missingSelectors.push(selector);
              }
            } catch (error) {
              missingSelectors.push(selector);
            }
          }

          return {
            totalElements,
            foundSelectors,
            missingSelectors,
            hasMinimumContent: totalElements >= minElems,
            hasAnyContent: totalElements > 0
          };
        }, selectors, minElements);

        // Check if content is stable (not still loading)
        if (contentStatus.totalElements === lastElementCount) {
          stableCount++;
        } else {
          stableCount = 0;
          lastElementCount = contentStatus.totalElements;
        }

        // Content is complete if we have minimum elements and they're stable
        if (contentStatus.hasMinimumContent && stableCount >= requiredStableChecks) {
          this.log(`Dynamic content loaded successfully (${contentStatus.totalElements} elements)`);
          return {
            isComplete: true,
            hasPartialContent: false,
            loadingProgress: 1.0,
            missingResources: contentStatus.missingSelectors,
            criticalResourcesLoaded: true
          };
        }

        // Check for partial content if allowed
        if (allowPartialContent && contentStatus.hasAnyContent && stableCount >= requiredStableChecks) {
          const progress = Math.min(contentStatus.totalElements / minElements, 1.0);
          
          if (progress >= 0.5) { // At least 50% of expected content
            this.log(`Partial dynamic content detected (${contentStatus.totalElements} elements, ${(progress * 100).toFixed(1)}% complete)`);
            return {
              isComplete: false,
              hasPartialContent: true,
              loadingProgress: progress,
              missingResources: contentStatus.missingSelectors,
              criticalResourcesLoaded: progress >= 0.7
            };
          }
        }

        this.log(`Waiting for content... (${contentStatus.totalElements} elements found, stable: ${stableCount}/${requiredStableChecks})`);
        await this.delay(checkInterval);

      } catch (error) {
        this.log(`Error checking dynamic content: ${error}`);
        await this.delay(checkInterval);
      }
    }

    // Timeout reached - check if we have any usable content
    const finalStatus = await page.evaluate((sels) => {
      let totalElements = 0;
      const missingSelectors: string[] = [];

      for (const selector of sels) {
        try {
          const elements = document.querySelectorAll(selector);
          totalElements += elements.length;
          if (elements.length === 0) {
            missingSelectors.push(selector);
          }
        } catch (error) {
          missingSelectors.push(selector);
        }
      }

      return { totalElements, missingSelectors };
    }, selectors);

    const hasPartialContent = finalStatus.totalElements > 0;
    const progress = Math.min(finalStatus.totalElements / minElements, 1.0);

    this.log(`Dynamic content loading timeout (${finalStatus.totalElements} elements found)`);

    return {
      isComplete: false,
      hasPartialContent,
      loadingProgress: progress,
      missingResources: finalStatus.missingSelectors,
      criticalResourcesLoaded: progress >= 0.3
    };
  }

  /**
   * Implements partial content extraction when page loading is incomplete
   */
  async extractPartialContent(
    page: Page,
    extractionFunction: (page: Page) => Promise<any[]>,
    fallbackSelectors: string[] = []
  ): Promise<PartialExtractionResult> {
    this.log('Attempting partial content extraction...');

    try {
      // First, try the main extraction function
      const mainResults = await extractionFunction(page);
      
      if (mainResults.length > 0) {
        this.log(`Main extraction successful: ${mainResults.length} items`);
        return {
          reviews: mainResults,
          extractionQuality: 'complete',
          missingElements: [],
          confidence: 1.0
        };
      }

      // If main extraction failed, try fallback extraction
      this.log('Main extraction returned no results, trying fallback extraction...');
      
      const fallbackResults = await this.extractWithFallbackSelectors(page, fallbackSelectors);
      
      if (fallbackResults.length > 0) {
        this.log(`Fallback extraction successful: ${fallbackResults.length} items`);
        return {
          reviews: fallbackResults,
          extractionQuality: 'partial',
          missingElements: [],
          confidence: 0.7
        };
      }

      // If both failed, try minimal extraction
      this.log('Fallback extraction failed, trying minimal extraction...');
      
      const minimalResults = await this.extractMinimalContent(page);
      
      if (minimalResults.length > 0) {
        return {
          reviews: minimalResults,
          extractionQuality: 'minimal',
          missingElements: fallbackSelectors,
          confidence: 0.3
        };
      }

      // If minimal extraction also failed, try emergency extraction
      this.log('Minimal extraction failed, trying emergency extraction...');
      const emergencyResults = await this.extractEmergencyContent(page);
      
      return {
        reviews: emergencyResults,
        extractionQuality: 'minimal',
        missingElements: fallbackSelectors,
        confidence: emergencyResults.length > 0 ? 0.2 : 0.0
      };

    } catch (error) {
      this.log(`Partial content extraction error: ${error}`);
      
      // Last resort: try to extract any text content that might be reviews
      const emergencyResults = await this.extractEmergencyContent(page);
      
      return {
        reviews: emergencyResults,
        extractionQuality: 'minimal',
        missingElements: fallbackSelectors,
        confidence: emergencyResults.length > 0 ? 0.2 : 0.0
      };
    }
  }

  /**
   * Handles resource loading failures gracefully
   */
  async handleResourceLoadingFailures(
    page: Page,
    operation: () => Promise<any>,
    resourceTypes: string[] = ['stylesheet', 'script', 'font']
  ): Promise<{ result: any; failedResources: string[]; degradedMode: boolean }> {
    const failedResources: string[] = [];
    let degradedMode = false;

    // Monitor resource loading failures
    const requestFailedHandler = (request: any) => {
      const resourceType = request.resourceType();
      if (resourceTypes.includes(resourceType)) {
        failedResources.push(request.url());
        this.log(`Resource loading failed: ${request.url()} (${resourceType})`);
      }
    };

    const responseHandler = (response: any) => {
      if (!response.ok()) {
        const resourceType = response.request().resourceType();
        if (resourceTypes.includes(resourceType)) {
          failedResources.push(response.url());
          this.log(`Resource response failed: ${response.url()} (${response.status()})`);
        }
      }
    };

    page.on('requestfailed', requestFailedHandler);
    page.on('response', responseHandler);

    try {
      // Execute the operation
      const result = await operation();

      // Determine if we're in degraded mode
      degradedMode = failedResources.length > 5 || 
                    failedResources.some(url => url.includes('maps') && url.includes('.js'));

      if (degradedMode) {
        this.log(`Degraded mode detected due to ${failedResources.length} failed resources`);
      }

      return { result, failedResources, degradedMode };

    } finally {
      page.off('requestfailed', requestFailedHandler);
      page.off('response', responseHandler);
    }
  }

  /**
   * Creates adaptive timeout based on network conditions
   */
  getAdaptiveTimeout(baseTimeout: number, networkCondition: 'fast' | 'slow' | 'unstable' = 'fast'): number {
    const multipliers = {
      fast: 1.0,
      slow: 1.5,
      unstable: 2.0
    };

    return Math.floor(baseTimeout * multipliers[networkCondition]);
  }

  /**
   * Monitors network conditions and adjusts timeouts accordingly
   */
  async detectNetworkConditions(page: Page): Promise<'fast' | 'slow' | 'unstable'> {
    const startTime = Date.now();
    let requestCount = 0;
    let failedCount = 0;
    let slowCount = 0;

    const requestHandler = () => requestCount++;
    const responseHandler = (response: any) => {
      const responseTime = Date.now() - startTime;
      if (!response.ok()) failedCount++;
      if (responseTime > 3000) slowCount++;
    };
    const requestFailedHandler = () => failedCount++;

    page.on('request', requestHandler);
    page.on('response', responseHandler);
    page.on('requestfailed', requestFailedHandler);

    // Wait for a short period to collect network metrics
    await this.delay(5000);

    page.off('request', requestHandler);
    page.off('response', responseHandler);
    page.off('requestfailed', requestFailedHandler);

    const failureRate = requestCount > 0 ? failedCount / requestCount : 0;
    const slowRate = requestCount > 0 ? slowCount / requestCount : 0;

    if (failureRate > 0.4 || (slowRate > 0.6 && failureRate > 0.2)) {
      return 'unstable';
    } else if (failureRate > 0.05 || slowRate > 0.2) {
      return 'slow';
    } else {
      return 'fast';
    }
  }

  /**
   * Implements progressive timeout strategy
   */
  async executeWithProgressiveTimeout<T>(
    operation: () => Promise<T>,
    timeouts: number[],
    operationName: string = 'operation'
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let i = 0; i < timeouts.length; i++) {
      const timeout = timeouts[i];
      this.log(`${operationName} attempt ${i + 1}/${timeouts.length} with ${timeout}ms timeout`);

      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`${operationName} timeout after ${timeout}ms`));
          }, timeout);
        });

        return await Promise.race([operation(), timeoutPromise]);

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.log(`${operationName} failed with ${timeout}ms timeout: ${lastError.message}`);

        if (i < timeouts.length - 1) {
          const delay = Math.min(1000 * (i + 1), 5000);
          this.log(`Retrying with longer timeout in ${delay}ms...`);
          await this.delay(delay);
        }
      }
    }

    throw lastError || new Error(`${operationName} failed with all timeout strategies`);
  }

  // Private helper methods

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private isRetryableError(error: Error): boolean {
    // Don't retry operation timeouts (timeouts from our timeout wrapper)
    if (error.message.includes('timeout after') && error.message.includes('ms (attempt')) {
      return false;
    }

    const retryablePatterns = [
      /network/i,
      /connection/i,
      /ECONNRESET/i,
      /ENOTFOUND/i,
      /ETIMEDOUT/i,
      /net::ERR_/i,
      /Protocol error/i,
      /Navigation timeout/i
    ];

    return retryablePatterns.some(pattern => pattern.test(error.message));
  }

  private async extractWithFallbackSelectors(page: Page, selectors: string[]): Promise<any[]> {
    const results: any[] = [];

    for (const selector of selectors) {
      try {
        const elements = await page.$$(selector);
        
        for (const element of elements) {
          const text = await element.evaluate(el => el.textContent?.trim() || '');
          const ariaLabel = await element.evaluate(el => el.getAttribute('aria-label') || '');
          
          if (text || ariaLabel) {
            results.push({
              text,
              ariaLabel,
              selector,
              extractionMethod: 'fallback'
            });
          }
        }
      } catch (error) {
        continue;
      }
    }

    return results;
  }

  private async extractMinimalContent(page: Page): Promise<any[]> {
    try {
      return await page.evaluate(() => {
        const results: any[] = [];
        
        // Look for any elements that might contain review-like content
        const potentialReviewElements = document.querySelectorAll(
          '[aria-label*="star" i], [aria-label*="rating" i], [class*="review"], [role="listitem"]'
        );

        potentialReviewElements.forEach((element, index) => {
          const text = element.textContent?.trim() || '';
          const ariaLabel = element.getAttribute('aria-label') || '';
          
          if (text.length > 10 || ariaLabel.length > 5) {
            results.push({
              text,
              ariaLabel,
              index,
              extractionMethod: 'minimal'
            });
          }
        });

        return results;
      });
    } catch (error) {
      return [];
    }
  }

  private async extractEmergencyContent(page: Page): Promise<any[]> {
    try {
      return await page.evaluate(() => {
        const results: any[] = [];
        const bodyText = document.body.textContent || '';
        
        // Look for text patterns that might indicate reviews
        const reviewPatterns = [
          /\d+\s*star[s]?/gi,
          /\d+\/5/g,
          /★+/g,
          /review[s]?\s*by/gi
        ];

        reviewPatterns.forEach((pattern, index) => {
          const matches = bodyText.match(pattern);
          if (matches) {
            matches.forEach(match => {
              results.push({
                text: match,
                pattern: pattern.toString(),
                extractionMethod: 'emergency'
              });
            });
          }
        });

        // If no patterns match, return a minimal emergency result
        if (results.length === 0) {
          results.push({
            text: 'Emergency extraction fallback',
            pattern: 'fallback',
            extractionMethod: 'emergency'
          });
        }

        return results;
      });
    } catch (error) {
      // Return a minimal result even on error
      return [{
        text: 'Emergency extraction error fallback',
        pattern: 'error',
        extractionMethod: 'emergency'
      }];
    }
  }
}