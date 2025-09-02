import { ReviewSortNavigationService } from './reviewSortNavigationService.js';
import { EnhancedPaginationEngine } from './enhancedPaginationEngine.js';
import { CollectionProgressTracker } from './collectionProgressTracker.js';
import { MemoryManager } from './memoryManager.js';
export class ComprehensiveCollectionOrchestrator {
    constructor(progressCallback, debugMode = false) {
        this.progressTracker = new CollectionProgressTracker(debugMode);
        this.progressCallback = progressCallback;
        this.debugMode = debugMode;
        this.reviewSortNavigationService = new ReviewSortNavigationService((message) => this.log(message), debugMode);
        this.enhancedPaginationEngine = new EnhancedPaginationEngine(debugMode, (message) => this.log(message));
        this.memoryManager = new MemoryManager(debugMode);
        this.memoryManager.registerCleanupCallback(async () => {
        });
    }
    async collectComprehensiveReviews(page, config) {
        const sessionId = this.generateSessionId();
        const session = this.progressTracker.createSession(sessionId, config);
        if (this.progressCallback) {
            this.progressTracker.onProgress(sessionId, this.progressCallback);
        }
        this.log(`Starting comprehensive collection session: ${sessionId}`);
        this.log(`Target counts - Recent: ${config.targetCounts.recent}, Worst: ${config.targetCounts.worst}, Best: ${config.targetCounts.best}`);
        const startTime = Date.now();
        if (config.performance?.enableMemoryManagement) {
            this.memoryManager.startMonitoring(config.performance.cleanupInterval || 30000);
        }
        if (config.performance?.enableStreamingCollection) {
        }
        if (config.performance?.enableDOMCaching) {
        }
        const result = {
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
        const phaseResults = [];
        let totalCollectionTimeout = false;
        try {
            const overallTimeoutPromise = new Promise((resolve) => {
                setTimeout(() => {
                    totalCollectionTimeout = true;
                    this.log(`Overall collection timeout reached (${config.timeouts.totalCollection}ms), preserving partial results`);
                    resolve();
                }, config.timeouts.totalCollection);
            });
            this.log('Phase 1: Collecting recent reviews');
            this.progressTracker.updateProgress(sessionId, 'recent', 0, config.targetCounts.recent);
            if (!totalCollectionTimeout) {
                const recentResult = await Promise.race([
                    this.collectPhaseReviews(page, 'recent', config.targetCounts.recent, config, sessionId),
                    overallTimeoutPromise.then(() => ({
                        reviews: [],
                        phaseResult: {
                            phase: 'recent',
                            reviewsCollected: 0,
                            targetCount: config.targetCounts.recent,
                            success: false,
                            timeElapsed: 0,
                            stoppedReason: 'timeout',
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
            if (!totalCollectionTimeout) {
                this.log('Phase 2: Collecting worst-rated reviews');
                this.progressTracker.updateProgress(sessionId, 'worst', 0, config.targetCounts.worst);
                const worstResult = await Promise.race([
                    this.collectPhaseReviews(page, 'worst', config.targetCounts.worst, config, sessionId),
                    overallTimeoutPromise.then(() => ({
                        reviews: [],
                        phaseResult: {
                            phase: 'worst',
                            reviewsCollected: 0,
                            targetCount: config.targetCounts.worst,
                            success: false,
                            timeElapsed: 0,
                            stoppedReason: 'timeout',
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
            if (!totalCollectionTimeout) {
                this.log('Phase 3: Collecting best-rated reviews');
                this.progressTracker.updateProgress(sessionId, 'best', 0, config.targetCounts.best);
                const bestResult = await Promise.race([
                    this.collectPhaseReviews(page, 'best', config.targetCounts.best, config, sessionId),
                    overallTimeoutPromise.then(() => ({
                        reviews: [],
                        phaseResult: {
                            phase: 'best',
                            reviewsCollected: 0,
                            targetCount: config.targetCounts.best,
                            success: false,
                            timeElapsed: 0,
                            stoppedReason: 'timeout',
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
            this.log('Phase 4: Deduplicating reviews');
            this.progressTracker.updateProgress(sessionId, 'deduplication', 0, 1);
            const reviewCollections = {
                recent: result.reviewsByCategory.recent,
                worst: result.reviewsByCategory.worst,
                best: result.reviewsByCategory.best
            };
            try {
                const seen = new Set();
                const allReviews = [...reviewCollections.recent, ...reviewCollections.worst, ...reviewCollections.best];
                result.uniqueReviews = allReviews.filter((review) => {
                    const key = `${review.author}_${review.text?.slice(0, 50)}`;
                    if (seen.has(key))
                        return false;
                    seen.add(key);
                    return true;
                });
                this.progressTracker.updateProgress(sessionId, 'deduplication', 1, 1);
                this.progressTracker.completePhase(sessionId, 'deduplication');
                result.metadata.duplicatesRemoved = allReviews.length - result.uniqueReviews.length;
            }
            catch (deduplicationError) {
                this.log(`Deduplication failed, using raw reviews: ${deduplicationError instanceof Error ? deduplicationError.message : 'Unknown error'}`);
                result.uniqueReviews = [...result.reviewsByCategory.recent, ...result.reviewsByCategory.worst, ...result.reviewsByCategory.best];
                result.metadata.duplicatesRemoved = 0;
            }
            const totalReviews = [...result.reviewsByCategory.recent, ...result.reviewsByCategory.worst, ...result.reviewsByCategory.best];
            result.metadata.totalCollected = totalReviews.length;
            result.metadata.totalUnique = result.uniqueReviews.length;
            result.metadata.collectionTime = Date.now() - startTime;
            this.progressTracker.completeCollection(sessionId, result);
            const successfulPhases = phaseResults.filter(p => p.success).length;
            const totalPhases = phaseResults.length;
            this.log(`Collection complete. Total: ${result.metadata.totalCollected}, Unique: ${result.metadata.totalUnique}`);
            this.log(`Successful phases: ${successfulPhases}/${totalPhases}${totalCollectionTimeout ? ' (timeout reached)' : ''}`);
            return result;
        }
        catch (error) {
            this.log(`Collection encountered error: ${error instanceof Error ? error.message : 'Unknown error'}`);
            await this.finalizePartialResults(result, startTime, sessionId);
            this.log(`Returning partial results: ${result.metadata.totalCollected} total, ${result.metadata.totalUnique} unique`);
            return result;
        }
        finally {
            if (config.performance?.enableMemoryManagement) {
                this.memoryManager.stopMonitoring();
                await this.memoryManager.cleanupPageResources(page);
            }
            if (config.performance?.enableStreamingCollection) {
            }
            this.progressTracker.cleanupSession(sessionId);
        }
    }
    async finalizePartialResults(result, startTime, sessionId) {
        try {
            const totalReviews = [...result.reviewsByCategory.recent, ...result.reviewsByCategory.worst, ...result.reviewsByCategory.best];
            result.metadata.totalCollected = totalReviews.length;
            result.metadata.collectionTime = Date.now() - startTime;
            if (totalReviews.length > 0) {
                try {
                    const reviewCollections = {
                        recent: result.reviewsByCategory.recent,
                        worst: result.reviewsByCategory.worst,
                        best: result.reviewsByCategory.best
                    };
                    const seen = new Set();
                    result.uniqueReviews = totalReviews.filter(review => {
                        const key = `${review.author}_${review.text?.slice(0, 50)}`;
                        if (seen.has(key))
                            return false;
                        seen.add(key);
                        return true;
                    });
                    result.metadata.totalUnique = result.uniqueReviews.length;
                    result.metadata.duplicatesRemoved = totalReviews.length - result.uniqueReviews.length;
                }
                catch (deduplicationError) {
                    result.uniqueReviews = totalReviews;
                    result.metadata.totalUnique = totalReviews.length;
                    result.metadata.duplicatesRemoved = 0;
                }
            }
            else {
                result.uniqueReviews = [];
                result.metadata.totalUnique = 0;
                result.metadata.duplicatesRemoved = 0;
            }
            this.progressTracker.completeCollection(sessionId, result);
        }
        catch (finalizationError) {
            this.log(`Failed to finalize partial results: ${finalizationError instanceof Error ? finalizationError.message : 'Unknown error'}`);
        }
    }
    async collectPhaseReviews(page, phase, targetCount, config, sessionId) {
        const phaseStartTime = Date.now();
        let reviews = [];
        const phaseResult = {
            phase,
            reviewsCollected: 0,
            targetCount,
            success: false,
            timeElapsed: 0,
            stoppedReason: 'error'
        };
        try {
            this.log(`Collecting ${targetCount} ${phase} reviews`);
            const sortResult = await this.attemptSortNavigationWithRetry(page, phase, config.retryLimits.sortingAttempts, config.timeouts.sortNavigation);
            if (!sortResult.success) {
                this.log(`Sort navigation failed, attempting fallback collection mode`);
                return await this.collectWithoutSorting(page, phase, targetCount, config, sessionId);
            }
            this.log(`Successfully navigated to ${phase} sort using ${sortResult.method}`);
            const paginationResult = await this.attemptPaginationWithGracefulDegradation(page, phase, targetCount, config, sessionId);
            reviews = paginationResult.reviews;
            phaseResult.reviewsCollected = reviews.length;
            phaseResult.success = paginationResult.success;
            phaseResult.stoppedReason = paginationResult.stoppedReason;
            if (reviews.length > 0) {
                this.log(`Phase ${phase} collected ${reviews.length}/${targetCount} reviews`);
            }
        }
        catch (error) {
            this.log(`Phase ${phase} encountered error: ${error instanceof Error ? error.message : 'Unknown error'}`);
            try {
                this.log(`Attempting emergency fallback collection for ${phase}`);
                const fallbackResult = await this.emergencyFallbackCollection(page, phase, targetCount, sessionId);
                reviews = fallbackResult.reviews;
                phaseResult.reviewsCollected = reviews.length;
                phaseResult.success = reviews.length > 0;
                phaseResult.stoppedReason = reviews.length > 0 ? 'no-more-content' : 'error';
                phaseResult.error = `Primary collection failed, fallback collected ${reviews.length} reviews`;
            }
            catch (fallbackError) {
                phaseResult.error = error instanceof Error ? error.message : 'Unknown error';
                phaseResult.stoppedReason = 'error';
            }
        }
        phaseResult.timeElapsed = Date.now() - phaseStartTime;
        return { reviews, phaseResult };
    }
    async attemptSortNavigationWithRetry(page, phase, maxAttempts, timeoutMs) {
        let lastError;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                this.log(`Sort navigation attempt ${attempt}/${maxAttempts} for ${phase}`);
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error(`Sort navigation timeout after ${timeoutMs}ms`)), timeoutMs);
                });
                const sortResult = await Promise.race([
                    this.reviewSortNavigationService.navigateToSortWithRetry(page, phase, { language: 'english', confidence: 0.9, detectedElements: [], isRTL: false }, maxAttempts, timeoutMs),
                    timeoutPromise
                ]);
                if (sortResult.success) {
                    this.log(`Sort navigation succeeded on attempt ${attempt} using ${sortResult.method}`);
                    return { success: true, method: sortResult.method };
                }
                else {
                    lastError = sortResult.error || 'Sort navigation failed';
                    this.log(`Sort navigation attempt ${attempt} failed: ${lastError}`);
                }
            }
            catch (error) {
                lastError = error instanceof Error ? error.message : 'Unknown error';
                this.log(`Sort navigation attempt ${attempt} threw error: ${lastError}`);
            }
            if (attempt < maxAttempts) {
                const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                this.log(`Waiting ${delayMs}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
        return { success: false, error: lastError || 'All sort navigation attempts failed' };
    }
    async attemptPaginationWithGracefulDegradation(page, phase, targetCount, config, sessionId) {
        let collectedReviews = [];
        let lastSuccessfulExtraction = [];
        try {
            const timeoutPromise = new Promise((resolve) => {
                setTimeout(() => {
                    this.log(`Pagination timeout reached, preserving ${lastSuccessfulExtraction.length} partial results`);
                    resolve({
                        reviews: lastSuccessfulExtraction,
                        success: lastSuccessfulExtraction.length > 0,
                        stoppedReason: 'timeout'
                    });
                }, config.timeouts.pagination);
            });
            const paginationPromise = this.enhancedPaginationEngine.paginateForTarget(page, {
                targetCount,
                timeoutMs: config.timeouts.pagination,
                maxAttempts: config.retryLimits.paginationAttempts,
                scrollStrategy: 'adaptive',
                batchSize: 20,
                stagnationThreshold: 3,
                progressiveTimeout: true,
                memoryOptimization: true,
                progressCallback: (current, target) => {
                    this.progressTracker.updateProgress(sessionId, phase, current, target);
                }
            }, async () => {
                try {
                    const extracted = await this.extractReviewsFromPage(page);
                    if (extracted.length > lastSuccessfulExtraction.length) {
                        lastSuccessfulExtraction = [...extracted];
                    }
                    return extracted;
                }
                catch (extractionError) {
                    this.log(`Review extraction failed, using last successful extraction: ${lastSuccessfulExtraction.length} reviews`);
                    return lastSuccessfulExtraction;
                }
            }).then(result => ({
                reviews: lastSuccessfulExtraction,
                success: result.stoppedReason !== 'error',
                stoppedReason: result.stoppedReason
            }));
            const result = await Promise.race([paginationPromise, timeoutPromise]);
            return result;
        }
        catch (error) {
            this.log(`Pagination failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return {
                reviews: lastSuccessfulExtraction,
                success: lastSuccessfulExtraction.length > 0,
                stoppedReason: 'error'
            };
        }
    }
    async collectWithoutSorting(page, phase, targetCount, config, sessionId) {
        this.log(`Entering fallback collection mode for ${phase} (no sorting)`);
        const phaseResult = {
            phase,
            reviewsCollected: 0,
            targetCount,
            success: false,
            timeElapsed: 0,
            stoppedReason: 'error'
        };
        const startTime = Date.now();
        try {
            const fallbackResult = await this.attemptPaginationWithGracefulDegradation(page, phase, Math.min(targetCount, 50), config, sessionId);
            phaseResult.reviewsCollected = fallbackResult.reviews.length;
            phaseResult.success = fallbackResult.reviews.length > 0;
            phaseResult.stoppedReason = fallbackResult.stoppedReason;
            phaseResult.error = `Fallback mode: collected ${fallbackResult.reviews.length} reviews without ${phase} sorting`;
            this.log(`Fallback collection completed: ${fallbackResult.reviews.length} reviews`);
            return { reviews: fallbackResult.reviews, phaseResult };
        }
        catch (error) {
            phaseResult.error = `Fallback collection failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
            phaseResult.timeElapsed = Date.now() - startTime;
            return { reviews: [], phaseResult };
        }
        finally {
            phaseResult.timeElapsed = Date.now() - startTime;
        }
    }
    async emergencyFallbackCollection(page, phase, targetCount, sessionId) {
        this.log(`Emergency fallback collection for ${phase}`);
        try {
            const visibleReviews = await this.extractReviewsFromPage(page);
            if (visibleReviews.length > 0) {
                this.log(`Emergency fallback found ${visibleReviews.length} visible reviews`);
                return { reviews: visibleReviews };
            }
            await page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight);
            });
            await new Promise(resolve => setTimeout(resolve, 2000));
            const scrolledReviews = await this.extractReviewsFromPage(page);
            this.log(`Emergency fallback with scroll found ${scrolledReviews.length} reviews`);
            return { reviews: scrolledReviews };
        }
        catch (error) {
            this.log(`Emergency fallback failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return { reviews: [] };
        }
    }
    async extractReviewsFromPage(page) {
        try {
            const reviewCount = await page.evaluate(() => {
                const reviewElements = document.querySelectorAll('[data-review-id], .review, [jsaction*="review"]');
                return reviewElements.length;
            });
            return [];
        }
        catch (error) {
            this.log(`Review extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return [];
        }
    }
    generateSessionId() {
        return `collection_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
    getDefaultConfig() {
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
    getSession(sessionId) {
        return this.progressTracker.getSession(sessionId);
    }
    getProgress(sessionId) {
        return this.progressTracker.getProgress(sessionId);
    }
    getPerformanceMetrics(sessionId) {
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
    log(message) {
        if (this.debugMode) {
            console.log(`[ComprehensiveCollectionOrchestrator] ${message}`);
        }
    }
}
//# sourceMappingURL=comprehensiveCollectionOrchestrator.js.map