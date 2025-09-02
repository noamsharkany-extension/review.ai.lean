import { ComprehensiveCollectionOrchestrator } from './comprehensiveCollectionOrchestrator.js';
import { GoogleReviewScraperService } from './scraper.js';
export class ComprehensiveCollectionService {
    constructor(progressCallback, debugMode = false) {
        this.progressCallback = progressCallback;
        this.debugMode = debugMode;
        this.orchestrator = new ComprehensiveCollectionOrchestrator(progressCallback, debugMode);
        this.scraperService = new GoogleReviewScraperService(undefined, debugMode);
    }
    async collectComprehensiveReviews(googleUrl, config) {
        const finalConfig = this.mergeWithDefaults(config);
        this.log(`Starting comprehensive collection with Hebrew rating support for: ${googleUrl}`);
        try {
            const reviews = await this.scraperService.scrapeReviews(googleUrl);
            const result = {
                uniqueReviews: reviews,
                reviewsByCategory: {
                    recent: reviews,
                    worst: [],
                    best: []
                },
                metadata: {
                    totalCollected: reviews.length,
                    totalUnique: reviews.length,
                    duplicatesRemoved: 0,
                    collectionTime: Date.now(),
                    success: true
                }
            };
            this.log(`Comprehensive collection completed: ${result.metadata.totalCollected} reviews`);
            const comprehensiveResult = {
                uniqueReviews: result.reviews,
                reviewsByCategory: {
                    recent: result.reviews.filter((r) => r.sortType === 'newest'),
                    worst: result.reviews.filter((r) => r.sortType === 'lowest'),
                    best: result.reviews.filter((r) => r.sortType === 'highest')
                },
                metadata: {
                    sessionId: result.metadata.sessionId,
                    totalCollected: result.metadata.totalCollected,
                    totalUnique: result.metadata.totalUnique,
                    duplicatesRemoved: result.metadata.duplicatesRemoved,
                    collectionTime: result.metadata.collectionTime,
                    sortingResults: result.metadata.sortingResults
                }
            };
            return comprehensiveResult;
        }
        catch (error) {
            this.log(`Comprehensive collection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw error;
        }
    }
    getSessionStatus(sessionId) {
        return this.orchestrator.getSession(sessionId);
    }
    getSessionProgress(sessionId) {
        return this.orchestrator.getProgress(sessionId);
    }
    getPerformanceMetrics(sessionId) {
        return this.orchestrator.getPerformanceMetrics(sessionId);
    }
    getMemoryStats() {
        return this.orchestrator.getMemoryStats();
    }
    getCacheStats() {
        return this.orchestrator.getCacheStats();
    }
    async performManualCleanup() {
        return await this.orchestrator.performManualCleanup();
    }
    getDefaultConfig() {
        return {
            orchestratorConfig: this.orchestrator.getDefaultConfig(),
            scraperConfig: {
                enableReliabilityFramework: true,
                enableDegradedMode: true,
                enableProgressiveSelectors: true,
                enableResourceMonitoring: true
            }
        };
    }
    mergeWithDefaults(config) {
        const defaults = this.getDefaultConfig();
        if (!config) {
            return defaults;
        }
        return {
            orchestratorConfig: {
                ...defaults.orchestratorConfig,
                ...config.orchestratorConfig,
                targetCounts: {
                    ...defaults.orchestratorConfig.targetCounts,
                    ...config.orchestratorConfig?.targetCounts
                },
                timeouts: {
                    ...defaults.orchestratorConfig.timeouts,
                    ...config.orchestratorConfig?.timeouts
                },
                retryLimits: {
                    ...defaults.orchestratorConfig.retryLimits,
                    ...config.orchestratorConfig?.retryLimits
                },
                performance: {
                    ...defaults.orchestratorConfig.performance,
                    ...config.orchestratorConfig?.performance
                }
            },
            scraperConfig: {
                ...defaults.scraperConfig,
                ...config.scraperConfig
            }
        };
    }
    log(message) {
        if (this.debugMode) {
            console.log(`[ComprehensiveCollectionService] ${message}`);
        }
    }
}
//# sourceMappingURL=comprehensiveCollectionService.js.map