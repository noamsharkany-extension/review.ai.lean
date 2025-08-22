export class EnhancedPaginationEngine {
    constructor(debugMode = false, progressCallback) {
        this.debugMode = debugMode;
        this.progressCallback = progressCallback;
    }
    log(message) {
        if (this.debugMode) {
            console.log(`[EnhancedPaginationEngine] ${message}`);
        }
        this.progressCallback?.(message);
    }
    async paginateForTarget(page, config, extractionCallback) {
        const startTime = Date.now();
        const attempts = [];
        let currentReviews = [];
        let paginationAttempts = 0;
        let scrollAttempts = 0;
        let clickAttempts = 0;
        let stoppedReason = 'error';
        let paginationMethod = 'scroll';
        let batchesProcessed = 0;
        let stagnationCount = 0;
        let memoryCleanupCount = 0;
        let adaptiveAdjustments = 0;
        let progressiveTimeoutUsed = false;
        const finalConfig = {
            targetCount: config.targetCount,
            maxAttempts: config.maxAttempts,
            scrollStrategy: config.scrollStrategy,
            progressCallback: config.progressCallback || (() => { }),
            timeoutMs: config.timeoutMs || (config.targetCount > 50 ? 600000 : 300000),
            scrollDelayMs: config.scrollDelayMs || 1500,
            adaptiveThresholds: config.adaptiveThresholds || {
                slowResponseMs: 3000,
                fastResponseMs: 1000
            },
            batchSize: config.batchSize || Math.max(10, Math.floor(config.targetCount / 10)),
            stagnationThreshold: config.stagnationThreshold || Math.max(3, Math.floor(config.maxAttempts / 4)),
            progressiveTimeout: config.progressiveTimeout ?? (config.targetCount > 50),
            memoryOptimization: config.memoryOptimization ?? (config.targetCount > 50)
        };
        this.log(`Starting enhanced pagination for target: ${finalConfig.targetCount} reviews`);
        this.log(`Strategy: ${finalConfig.scrollStrategy}, Max attempts: ${finalConfig.maxAttempts}`);
        try {
            currentReviews = await extractionCallback();
            this.log(`Initial extraction: ${currentReviews.length} reviews found`);
            finalConfig.progressCallback?.(currentReviews.length, finalConfig.targetCount);
            paginationMethod = await this.detectPaginationMethod(page);
            this.log(`Detected pagination method: ${paginationMethod}`);
            while (currentReviews.length < finalConfig.targetCount &&
                paginationAttempts < finalConfig.maxAttempts &&
                (Date.now() - startTime) < this.calculateDynamicTimeout(finalConfig, currentReviews.length, startTime) &&
                stagnationCount < finalConfig.stagnationThreshold) {
                const attemptStartTime = Date.now();
                const reviewsBeforeAttempt = currentReviews.length;
                let attemptSuccess = false;
                let attemptError;
                let adaptiveAdjustment = 'none';
                try {
                    if (finalConfig.memoryOptimization && paginationAttempts > 0 && paginationAttempts % 10 === 0) {
                        await this.performMemoryCleanup(page);
                        memoryCleanupCount++;
                    }
                    const currentBatch = Math.floor(currentReviews.length / finalConfig.batchSize);
                    if (currentBatch > batchesProcessed) {
                        batchesProcessed = currentBatch;
                        this.log(`Processing batch ${batchesProcessed + 1} (${currentReviews.length}/${finalConfig.targetCount} reviews)`);
                    }
                    if (paginationMethod === 'scroll' || paginationMethod === 'hybrid') {
                        const scrollResult = await this.performEnhancedScrollAttempt(page, finalConfig, currentReviews.length, attempts);
                        scrollAttempts++;
                        adaptiveAdjustment = scrollResult.adaptiveAdjustment;
                        if (scrollResult.adaptiveAdjustment !== 'none') {
                            adaptiveAdjustments++;
                        }
                    }
                    if (paginationMethod === 'click' || paginationMethod === 'hybrid') {
                        const clickSuccess = await this.performClickAttempt(page);
                        if (clickSuccess) {
                            clickAttempts++;
                        }
                    }
                    await this.waitForContentLoadWithProgress(page, finalConfig, currentReviews.length);
                    const newReviews = await extractionCallback();
                    const reviewsAfterAttempt = newReviews.length;
                    if (reviewsAfterAttempt > reviewsBeforeAttempt) {
                        currentReviews = newReviews;
                        attemptSuccess = true;
                        stagnationCount = 0;
                        const newReviewsCount = reviewsAfterAttempt - reviewsBeforeAttempt;
                        this.log(`Pagination attempt ${paginationAttempts + 1}: ${newReviewsCount} new reviews (total: ${reviewsAfterAttempt}/${finalConfig.targetCount})`);
                        const progressPercentage = Math.round((reviewsAfterAttempt / finalConfig.targetCount) * 100);
                        const timeElapsed = Date.now() - startTime;
                        const reviewsPerMinute = Math.round((reviewsAfterAttempt / timeElapsed) * 60000);
                        this.log(`Progress: ${progressPercentage}% complete, ${reviewsPerMinute} reviews/min`);
                        finalConfig.progressCallback?.(reviewsAfterAttempt, finalConfig.targetCount);
                    }
                    else {
                        this.log(`Pagination attempt ${paginationAttempts + 1}: No new reviews found`);
                        stagnationCount++;
                    }
                    const memoryUsage = await this.getMemoryUsage(page);
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
                    if (!attemptSuccess) {
                        if (paginationMethod === 'hybrid' && stagnationCount < 2) {
                            this.log('Trying alternative pagination method due to stagnation...');
                        }
                        else if (stagnationCount >= finalConfig.stagnationThreshold) {
                            this.log(`Stagnation detected: ${stagnationCount} attempts without progress`);
                            stoppedReason = 'stagnation';
                            break;
                        }
                    }
                }
                catch (error) {
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
            if (currentReviews.length >= finalConfig.targetCount) {
                stoppedReason = 'target-reached';
            }
            else if (stagnationCount >= finalConfig.stagnationThreshold) {
                stoppedReason = 'stagnation';
            }
            else if (paginationAttempts >= finalConfig.maxAttempts) {
                stoppedReason = 'no-more-content';
            }
            else if ((Date.now() - startTime) >= this.calculateDynamicTimeout(finalConfig, currentReviews.length, startTime)) {
                stoppedReason = 'timeout';
                if (finalConfig.progressiveTimeout) {
                    progressiveTimeoutUsed = true;
                }
            }
        }
        catch (error) {
            this.log(`Pagination failed with error: ${error instanceof Error ? error.message : String(error)}`);
            stoppedReason = 'error';
        }
        const timeElapsed = Date.now() - startTime;
        const averageResponseTime = attempts.length > 0
            ? attempts.reduce((sum, attempt) => sum + attempt.responseTimeMs, 0) / attempts.length
            : 0;
        const result = {
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
    async detectPaginationMethod(page) {
        try {
            this.log('Detecting pagination method...');
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
                }
                catch (error) {
                }
            }
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
            if (hasLoadMoreButton && hasScrollableContainer) {
                this.log('Detected hybrid pagination (both scroll and click available)');
                return 'hybrid';
            }
            else if (hasLoadMoreButton) {
                this.log('Detected click-based pagination (load more buttons)');
                return 'click';
            }
            else if (hasScrollableContainer) {
                this.log('Detected scroll-based pagination (infinite scroll)');
                return 'scroll';
            }
            else {
                this.log('No clear pagination method detected, defaulting to scroll');
                return 'scroll';
            }
        }
        catch (error) {
            this.log(`Error detecting pagination method: ${error instanceof Error ? error.message : String(error)}`);
            return 'scroll';
        }
    }
    async standardScrolling(page, config) {
        const scrollAmount = config.scrollStrategy === 'aggressive' ? 1500 : 1000;
        const scrollCount = config.scrollStrategy === 'aggressive' ? 5 : 3;
        this.log(`Performing ${config.scrollStrategy} scrolling (${scrollCount} scrolls of ${scrollAmount}px)`);
        for (let i = 0; i < scrollCount; i++) {
            await this.scrollPage(page, scrollAmount);
            await new Promise(resolve => setTimeout(resolve, config.scrollDelayMs));
        }
    }
    async scrollPage(page, scrollAmount) {
        await page.evaluate((amount) => {
            const reviewsContainers = [
                '.section-layout-root',
                '[role="main"]',
                '.section-listbox',
                '.reviews-container'
            ];
            let scrolled = false;
            for (const containerSelector of reviewsContainers) {
                const container = document.querySelector(containerSelector);
                if (container && container.scrollHeight > container.clientHeight) {
                    container.scrollTop += amount;
                    scrolled = true;
                    break;
                }
            }
            if (!scrolled) {
                window.scrollBy(0, amount);
            }
        }, scrollAmount);
    }
    async performClickAttempt(page) {
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
            }
            catch (error) {
                continue;
            }
        }
        return false;
    }
    async waitForContentLoadWithProgress(page, config, currentReviewCount) {
        const baseWaitTime = config.scrollDelayMs;
        const adaptiveWaitTime = currentReviewCount > 50 ? baseWaitTime * 1.2 : baseWaitTime;
        await new Promise(resolve => setTimeout(resolve, adaptiveWaitTime));
        try {
            const timeout = currentReviewCount > 100 ? 8000 : 5000;
            await page.waitForFunction(() => {
                return document.readyState === 'complete';
            }, { timeout });
        }
        catch (error) {
            const fallbackWait = currentReviewCount > 100 ? 2000 : 1000;
            await new Promise(resolve => setTimeout(resolve, fallbackWait));
        }
    }
    calculateDynamicTimeout(config, currentReviewCount, startTime) {
        if (!config.progressiveTimeout) {
            return config.timeoutMs;
        }
        const progressPercentage = currentReviewCount / config.targetCount;
        if (progressPercentage > 0.8) {
            return config.timeoutMs * 1.5;
        }
        else if (progressPercentage > 0.5) {
            return config.timeoutMs * 1.2;
        }
        return config.timeoutMs;
    }
    async performMemoryCleanup(page) {
        try {
            this.log('Performing memory cleanup...');
            await page.evaluate(() => {
                if (window.gc) {
                    window.gc();
                }
                const debugElements = document.querySelectorAll('[data-debug], .debug-info');
                debugElements.forEach(el => el.remove());
                if (window.reviewData) {
                    delete window.reviewData;
                }
            });
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        catch (error) {
            this.log(`Memory cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async getMemoryUsage(page) {
        try {
            const memoryInfo = await page.evaluate(() => {
                if ('memory' in performance) {
                    const memory = performance.memory;
                    return memory.usedJSHeapSize ? Math.round(memory.usedJSHeapSize / 1024 / 1024) : undefined;
                }
                return undefined;
            });
            return memoryInfo;
        }
        catch (error) {
            return undefined;
        }
    }
    async performEnhancedScrollAttempt(page, config, currentReviewCount, previousAttempts) {
        try {
            let adaptiveAdjustment = 'none';
            if (config.scrollStrategy === 'adaptive') {
                const result = await this.adaptiveScrollingEnhanced(page, config, currentReviewCount, previousAttempts);
                adaptiveAdjustment = result.adaptiveAdjustment;
            }
            else {
                await this.standardScrolling(page, config);
            }
            return { adaptiveAdjustment };
        }
        catch (error) {
            this.log(`Enhanced scroll attempt failed: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
    async adaptiveScrollingEnhanced(page, config, currentReviewCount, previousAttempts) {
        this.log('Performing enhanced adaptive scrolling...');
        let adaptiveAdjustment = 'none';
        const recentAttempts = previousAttempts.slice(-5);
        const averageResponseTime = recentAttempts.length > 0
            ? recentAttempts.reduce((sum, attempt) => sum + attempt.responseTimeMs, 0) / recentAttempts.length
            : 1000;
        const successRate = recentAttempts.length > 0
            ? recentAttempts.filter(attempt => attempt.success).length / recentAttempts.length
            : 0.5;
        let scrollAmount = 1000;
        let scrollDelay = config.scrollDelayMs;
        let scrollCount = 3;
        if (currentReviewCount > 100) {
            scrollAmount = 800;
            scrollDelay = Math.max(scrollDelay, 2000);
            scrollCount = 2;
            adaptiveAdjustment = 'slow-down';
        }
        else if (averageResponseTime > config.adaptiveThresholds.slowResponseMs || successRate < 0.3) {
            scrollAmount = 600;
            scrollDelay = Math.min(scrollDelay * 1.5, 4000);
            scrollCount = 2;
            adaptiveAdjustment = 'slow-down';
            this.log(`Slow performance detected (${Math.round(averageResponseTime)}ms avg, ${Math.round(successRate * 100)}% success), using conservative scrolling`);
        }
        else if (averageResponseTime < config.adaptiveThresholds.fastResponseMs && successRate > 0.7) {
            scrollAmount = 1500;
            scrollDelay = Math.max(scrollDelay * 0.8, 1000);
            scrollCount = 4;
            adaptiveAdjustment = 'speed-up';
            this.log(`Fast performance detected (${Math.round(averageResponseTime)}ms avg, ${Math.round(successRate * 100)}% success), using aggressive scrolling`);
        }
        else {
            this.log(`Normal performance (${Math.round(averageResponseTime)}ms avg, ${Math.round(successRate * 100)}% success), using standard scrolling`);
        }
        for (let i = 0; i < scrollCount; i++) {
            await this.scrollPage(page, scrollAmount);
            await new Promise(resolve => setTimeout(resolve, scrollDelay));
            if (currentReviewCount > 50 && i < scrollCount - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        return { adaptiveAdjustment };
    }
}
//# sourceMappingURL=enhancedPaginationEngine.js.map