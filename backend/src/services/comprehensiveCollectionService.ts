import { Page } from 'puppeteer';
import { RawReview } from '@shared/types';
import { ComprehensiveCollectionOrchestrator, ComprehensiveCollectionConfig, ComprehensiveCollectionResult } from './comprehensiveCollectionOrchestrator.js';
import { GoogleReviewScraperService } from './scraper.js';
import { CollectionProgress } from './collectionProgressTracker.js';

export interface ComprehensiveCollectionServiceConfig {
  orchestratorConfig: ComprehensiveCollectionConfig;
  scraperConfig: {
    enableReliabilityFramework: boolean;
    enableDegradedMode: boolean;
    enableProgressiveSelectors: boolean;
    enableResourceMonitoring: boolean;
  };
}

export class ComprehensiveCollectionService {
  private orchestrator: ComprehensiveCollectionOrchestrator;
  private scraperService: GoogleReviewScraperService;
  private progressCallback?: (sessionId: string, progress: CollectionProgress) => void;
  private debugMode: boolean;

  constructor(
    progressCallback?: (sessionId: string, progress: CollectionProgress) => void,
    debugMode: boolean = false
  ) {
    this.progressCallback = progressCallback;
    this.debugMode = debugMode;
    
    // Initialize orchestrator with progress callback
    this.orchestrator = new ComprehensiveCollectionOrchestrator(
      progressCallback,
      debugMode
    );
    
    // Initialize scraper service
    this.scraperService = new GoogleReviewScraperService(undefined, debugMode);
  }

  /**
   * Collect comprehensive reviews from a Google Maps business page using proven Hebrew-compatible method
   */
  async collectComprehensiveReviews(
    googleUrl: string,
    config?: ComprehensiveCollectionServiceConfig
  ): Promise<ComprehensiveCollectionResult> {
    const finalConfig = this.mergeWithDefaults(config);
    
    this.log(`Starting comprehensive collection with Hebrew rating support for: ${googleUrl}`);
    
    try {
      // Use the basic scraper method
      const reviews = await this.scraperService.scrapeReviews(googleUrl);
      const result: ComprehensiveCollectionResult = {
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
      
      // Convert to the expected result format
      const comprehensiveResult: ComprehensiveCollectionResult = {
        uniqueReviews: result.reviews,
        reviewsByCategory: {
          recent: result.reviews.filter((r: any) => r.sortType === 'newest'),
          worst: result.reviews.filter((r: any) => r.sortType === 'lowest'),
          best: result.reviews.filter((r: any) => r.sortType === 'highest')
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
      
    } catch (error) {
      this.log(`Comprehensive collection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Get session status and progress
   */
  getSessionStatus(sessionId: string) {
    return this.orchestrator.getSession(sessionId);
  }

  /**
   * Get session progress details
   */
  getSessionProgress(sessionId: string) {
    return this.orchestrator.getProgress(sessionId);
  }

  /**
   * Get performance metrics for a session
   */
  getPerformanceMetrics(sessionId: string) {
    return this.orchestrator.getPerformanceMetrics(sessionId);
  }

  /**
   * Get memory statistics
   */
  getMemoryStats() {
    return this.orchestrator.getMemoryStats();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.orchestrator.getCacheStats();
  }

  /**
   * Perform manual cleanup
   */
  async performManualCleanup() {
    return await this.orchestrator.performManualCleanup();
  }

  /**
   * Get default configuration
   */
  getDefaultConfig(): ComprehensiveCollectionServiceConfig {
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



  /**
   * Merge user config with service defaults
   */
  private mergeWithDefaults(config?: ComprehensiveCollectionServiceConfig): ComprehensiveCollectionServiceConfig {
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

  private log(message: string): void {
    if (this.debugMode) {
      console.log(`[ComprehensiveCollectionService] ${message}`);
    }
  }
}