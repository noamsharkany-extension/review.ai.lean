import { Page } from 'puppeteer';

// Language detection interfaces
export interface LanguageDetectionResult {
  language: string;
  confidence: number;
  isRTL: boolean;
  detectedElements: string[];
  suggestedSelectors?: SelectorSet;
}

// Enhanced debug information interface for multilingual scenarios
export interface MultilingualDebugInfo {
  originalUrl: string;
  detectedLanguage: string;
  languageConfidence: number;
  isRTL: boolean;
  detectedElements: string[];
  attemptedSelectors: string[];
  successfulSelectors: string[];
  extractionStrategy: string;
  fallbacksUsed: string[];
  finalExtractionCount: number;
  errorCategory?: 'language-specific' | 'general' | 'network' | 'timeout' | 'selector-failure';
  timestamp: string;
  pageInfo: {
    title: string;
    hasStarElements: number;
    hasRatingElements: number;
    hasReviewElements: number;
    totalDivs: number;
    totalSpans: number;
  };
}

// Error categorization for multilingual scenarios
export interface MultilingualError {
  category: 'language-specific' | 'general' | 'network' | 'timeout' | 'selector-failure';
  originalError: string;
  languageContext?: LanguageDetectionResult;
  debugInfo?: MultilingualDebugInfo;
  suggestedActions: string[];
}

export interface SelectorSet {
  reviewsTab: string[];
  reviewContainer: string[];
  authorName: string[];
  rating: string[];
  reviewText: string[];
  date: string[];
}

export interface MultilingualSelectors {
  english: SelectorSet;
  hebrew: SelectorSet;
  generic: SelectorSet;
}

// Performance monitoring interface
export interface LanguageDetectionPerformance {
  detectionTime: number;
  cacheHit: boolean;
  selectorGenerationTime: number;
  totalSelectors: number;
  memoryUsage?: number;
  timestamp: number;
  url: string;
  language: string;
  confidence: number;
  cacheSize?: number;
  selectorCacheSize?: number;
}

// Enhanced performance metrics interface
export interface PerformanceMetrics {
  averageDetectionTime: number;
  cacheHitRate: number;
  totalDetections: number;
  averageSelectorCount: number;
  memoryUsage: number;
  cacheSize: number;
  selectorCacheSize: number;
  detectionsByLanguage: Record<string, number>;
  averageConfidenceByLanguage: Record<string, number>;
  slowestDetections: Array<{
    url: string;
    language: string;
    detectionTime: number;
    timestamp: number;
  }>;
  cacheEfficiency: {
    hitRate: number;
    missRate: number;
    evictionRate: number;
  };
}

// Cache entry interface
interface LanguageDetectionCacheEntry {
  result: LanguageDetectionResult;
  timestamp: number;
  url: string;
  performance: LanguageDetectionPerformance;
}

// Language detection patterns and utilities
export class LanguageDetectionService {
  private debugMode: boolean = false;
  private progressCallback?: (message: string) => void;
  
  // Performance optimization: Enhanced caching with LRU-like behavior
  private detectionCache = new Map<string, LanguageDetectionCacheEntry>();
  private selectorCache = new Map<string, SelectorSet>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_CACHE_SIZE = 100;
  private readonly SELECTOR_CACHE_TTL = 10 * 60 * 1000; // 10 minutes for selectors
  
  // Performance monitoring with enhanced metrics
  private performanceMetrics: LanguageDetectionPerformance[] = [];
  private readonly MAX_PERFORMANCE_ENTRIES = 1000;
  private cacheEvictions = 0;
  private totalCacheRequests = 0;
  private cacheHits = 0;
  private selectorCacheHits = 0;
  private selectorCacheRequests = 0;
  
  // Performance optimization: Precomputed selector sets
  private precomputedSelectors = new Map<string, SelectorSet>();
  private selectorGenerationCache = new Map<string, { selectors: SelectorSet; timestamp: number }>();

  // Language detection patterns
  private readonly languagePatterns = {
    hebrew: {
      // Hebrew Unicode ranges and common words
      unicodeRanges: [
        /[\u0590-\u05FF]/g, // Hebrew block
        /[\uFB1D-\uFB4F]/g  // Hebrew presentation forms
      ],
      commonWords: [
        'ממליץ מקומי', 'ביקורות', 'תמונות', 'כוכבים', 'כוכב',
        'לפני', 'חודש', 'שבוע', 'יום', 'שנה', 'דקות', 'שעות'
      ],
      uiElements: [
        'ביקורות', 'תמונות', 'מידע', 'כיוונים', 'שמור'
      ]
    },
    english: {
      commonWords: [
        'Local Guide', 'reviews', 'photos', 'stars', 'star',
        'ago', 'month', 'week', 'day', 'year', 'minutes', 'hours'
      ],
      uiElements: [
        'Reviews', 'Photos', 'About', 'Directions', 'Save'
      ]
    }
  };

  // Comprehensive multilingual selector definitions
  private readonly multilingualSelectors: MultilingualSelectors = {
    english: {
      reviewsTab: [
        // Primary English review tab selectors
        '[role="tab"][aria-label*="review" i]',
        '[role="tab"][aria-label*="Review" i]',
        'button[aria-label*="review" i]',
        '[data-value="1"][role="tab"]', // Reviews tab index
        'div[role="tab"]:contains("Reviews")',
        // Fallback selectors for different Google Maps versions
        '[jsaction*="tab"][aria-label*="review" i]',
        '.section-tab[aria-label*="review" i]',
        'button[data-tab-index="1"]'
      ],
      reviewContainer: [
        // Primary review container selectors
        '[data-review-id]',
        '[jsaction*="review"]',
        'div[role="listitem"]',
        // Google Maps specific classes (discovered from DOM analysis)
        'div[class*="jftiEf"]',
        'div[class*="fontBodyMedium"]',
        // Broader container selectors
        'div[class*="review"]',
        '[data-value*="review"]',
        '[aria-label*="review" i]',
        // Structural selectors for review lists
        'div[role="list"] > div',
        '.section-review-content',
        '[jsaction*="pane.review"]'
      ],
      authorName: [
        // Author name extraction selectors
        '[data-value*="name" i]',
        '[aria-label*="name" i]',
        'span[class*="fontBodyMedium"]:first-child',
        'div[class*="fontBodyMedium"]:first-child',
        // Structural author selectors
        '[class*="author"]',
        '[class*="name"]',
        'span:first-child',
        'div:first-child span',
        // Google Maps specific author patterns
        'div[jsaction] span:first-child',
        '.section-review-author',
        '[data-value*="reviewer"]'
      ],
      rating: [
        // Star rating selectors
        '[aria-label*="star" i]',
        '[aria-label*="rating" i]',
        '[role="img"][aria-label*="star" i]',
        '[title*="star" i]',
        // Numeric rating selectors
        '[aria-label*="out of 5" i]',
        '[aria-label*="5 stars" i]',
        '[data-value*="rating"]',
        // Google Maps specific rating elements
        'span[aria-label*="stars"]',
        '.section-review-stars',
        '[jsaction*="rating"]'
      ],
      reviewText: [
        // Review text content selectors
        '[class*="review-text"]',
        '[data-value*="review-text"]',
        'span[class*="fontBodyMedium"]',
        // Broader text content selectors
        'div[class*="text"]',
        '[class*="content"]',
        'span[jsaction*="expand"]',
        // Google Maps specific text patterns
        '.section-review-text',
        'span[class*="fontBodySmall"]',
        'div[data-expandable-section]'
      ],
      date: [
        // Date/time selectors
        '[aria-label*="ago" i]',
        '[data-value*="date"]',
        'span:contains("ago")',
        // Time-related patterns
        'span:contains("month")',
        'span:contains("week")',
        'span:contains("day")',
        'span:contains("year")',
        // Google Maps specific date elements
        '.section-review-publish-date',
        'span[class*="fontBodySmall"]:last-child'
      ]
    },
    hebrew: {
      reviewsTab: [
        // Hebrew review tab selectors
        '[role="tab"][aria-label*="ביקורות"]',
        '[role="tab"]:contains("ביקורות")',
        'button[aria-label*="ביקורות"]',
        '[data-value="1"][role="tab"]', // Tab index remains same
        'div[role="tab"]:contains("ביקורות")',
        // Hebrew UI variations
        '[jsaction*="tab"][aria-label*="ביקורות"]',
        '.section-tab[aria-label*="ביקורות"]',
        'button:contains("ביקורות")'
      ],
      reviewContainer: [
        // Same structural selectors work across languages
        '[data-review-id]',
        '[jsaction*="review"]',
        'div[role="listitem"]',
        'div[class*="jftiEf"]',
        'div[class*="fontBodyMedium"]',
        // Hebrew-specific review containers
        'div[dir="rtl"]',
        'div[class*="review"]',
        '[data-value*="review"]',
        'div[role="list"] > div',
        '[jsaction*="pane.review"]'
      ],
      authorName: [
        // Author name selectors (structure remains similar)
        '[data-value*="name" i]',
        '[aria-label*="name" i]',
        'span[class*="fontBodyMedium"]:first-child',
        'div[class*="fontBodyMedium"]:first-child',
        // Hebrew-specific author patterns
        'span:first-child',
        'div:first-child span',
        '[class*="author"]',
        'div[jsaction] span:first-child',
        // RTL-aware selectors
        'div[dir="rtl"] span:first-child'
      ],
      rating: [
        // Hebrew star rating selectors
        '[aria-label*="כוכבים"]', // "stars" in Hebrew
        '[aria-label*="כוכב"]',   // "star" in Hebrew
        '[role="img"][aria-label*="כוכב"]',
        '[title*="כוכב"]',
        // Fallback to English patterns (Google Maps might mix languages)
        '[aria-label*="star" i]',
        '[aria-label*="rating" i]',
        '[data-value*="rating"]',
        // Hebrew numeric patterns
        '[aria-label*="מתוך 5"]', // "out of 5" in Hebrew
        'span[aria-label*="כוכבים"]'
      ],
      reviewText: [
        // Hebrew review text selectors
        '[class*="review-text"]',
        '[data-value*="review-text"]',
        'span[class*="fontBodyMedium"]',
        'div[class*="text"]',
        // RTL-specific text selectors
        'div[dir="rtl"] span',
        'span[jsaction*="expand"]',
        'div[data-expandable-section]',
        'span[class*="fontBodySmall"]'
      ],
      date: [
        // Hebrew date/time selectors
        '[aria-label*="לפני"]', // "ago" in Hebrew
        'span:contains("לפני")',
        'span:contains("חודש")', // "month" in Hebrew
        'span:contains("שבוע")', // "week" in Hebrew
        'span:contains("יום")',  // "day" in Hebrew
        'span:contains("שנה")',  // "year" in Hebrew
        // Fallback patterns
        '[data-value*="date"]',
        'span[class*="fontBodySmall"]:last-child',
        'div[dir="rtl"] span:last-child'
      ]
    },
    generic: {
      reviewsTab: [
        // Language-agnostic tab selectors
        '[role="tab"]',
        '[data-tab-index="1"]',
        'button[jsaction*="tab"]',
        '[data-value="1"][role="tab"]',
        // Structural tab patterns
        '.section-tab',
        'div[role="tablist"] > div:nth-child(2)',
        'button[aria-selected="true"]',
        '[jsaction*="pane.tab"]'
      ],
      reviewContainer: [
        // Universal review container selectors
        '[data-review-id]',
        '[jsaction*="review"]',
        'div[role="listitem"]',
        'div[class*="jftiEf"]',
        'div[class*="fontBodyMedium"]',
        // Broad structural selectors
        'div[class*="review"]',
        '[data-value*="review"]',
        'div[role="list"] > div',
        '[jsaction*="pane.review"]',
        // Fallback container patterns
        'div[jsaction] div[jsaction]',
        '.section-review-content'
      ],
      authorName: [
        // Universal author name selectors
        'span[class*="fontBodyMedium"]:first-child',
        'div[class*="fontBodyMedium"]:first-child',
        '[class*="author"]',
        '[class*="name"]',
        // Structural author patterns
        'span:first-child',
        'div:first-child span',
        'div[jsaction] span:first-child',
        // Fallback author selectors
        '[data-value*="name" i]',
        '[aria-label*="name" i]'
      ],
      rating: [
        // Universal rating selectors
        '[aria-label*="star" i]',
        '[aria-label*="rating" i]',
        '[role="img"]',
        '[data-value*="rating"]',
        // Broad rating patterns
        'span[aria-label]',
        'div[aria-label]',
        '[title*="star" i]',
        // Structural rating selectors
        '.section-review-stars',
        '[jsaction*="rating"]'
      ],
      reviewText: [
        // Universal text content selectors
        'span[class*="fontBodyMedium"]',
        '[class*="review-text"]',
        'div[class*="text"]',
        '[class*="content"]',
        // Broad text patterns
        'span[jsaction*="expand"]',
        'div[data-expandable-section]',
        'span[class*="fontBodySmall"]',
        // Fallback text selectors
        'div > span',
        '.section-review-text'
      ],
      date: [
        // Universal date/time selectors
        'span:last-child',
        '[data-value*="date"]',
        'span[class*="fontBodySmall"]',
        // Broad date patterns
        'span[class*="fontBodySmall"]:last-child',
        'div:last-child span',
        // Fallback date selectors
        '.section-review-publish-date',
        'span[aria-label*="ago" i]'
      ]
    }
  };

  constructor(progressCallback?: (message: string) => void, debugMode: boolean = false) {
    this.progressCallback = progressCallback;
    this.debugMode = debugMode;
    
    // Initialize performance monitoring and optimization
    this.initializePerformanceMonitoring();
    this.precomputeCommonSelectors();
  }

  /**
   * Initialize performance monitoring and cleanup with enhanced optimization
   */
  private initializePerformanceMonitoring(): void {
    // Clean up old performance entries periodically
    setInterval(() => {
      if (this.performanceMetrics.length > this.MAX_PERFORMANCE_ENTRIES) {
        this.performanceMetrics = this.performanceMetrics.slice(-this.MAX_PERFORMANCE_ENTRIES / 2);
        this.debugLog(`Cleaned up performance metrics, keeping ${this.performanceMetrics.length} entries`);
      }
    }, 60000); // Every minute
    
    // Clean up expired cache entries more frequently for better memory management
    setInterval(() => {
      this.cleanupExpiredCache();
    }, 15000); // Every 15 seconds for more aggressive cleanup
    
    // Performance monitoring and optimization report
    setInterval(() => {
      this.logPerformanceReport();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Precompute common selector sets for better performance
   */
  private precomputeCommonSelectors(): void {
    this.debugLog('Precomputing common selector sets for performance optimization...');
    
    // Precompute selectors for common languages
    const commonLanguages = ['english', 'hebrew', 'generic'];
    
    commonLanguages.forEach(lang => {
      const selectors = this.generateOptimizedSelectors(lang);
      this.precomputedSelectors.set(lang, selectors);
      this.debugLog(`Precomputed ${Object.values(selectors).flat().length} selectors for ${lang}`);
    });
    
    this.debugLog(`Precomputed selectors for ${commonLanguages.length} languages`);
  }

  /**
   * Generate optimized selectors with performance considerations
   */
  private generateOptimizedSelectors(language: string): SelectorSet {
    const normalizedLang = language.toLowerCase();
    
    // Use precomputed selectors if available
    switch (normalizedLang) {
      case 'hebrew':
        return this.optimizeSelectors(this.multilingualSelectors.hebrew);
      case 'english':
        return this.optimizeSelectors(this.multilingualSelectors.english);
      default:
        return this.optimizeSelectors(this.multilingualSelectors.generic);
    }
  }

  /**
   * Optimize selector sets by removing duplicates and sorting by specificity
   */
  private optimizeSelectors(selectors: SelectorSet): SelectorSet {
    const optimized: SelectorSet = {
      reviewsTab: this.optimizeSelectorArray(selectors.reviewsTab),
      reviewContainer: this.optimizeSelectorArray(selectors.reviewContainer),
      authorName: this.optimizeSelectorArray(selectors.authorName),
      rating: this.optimizeSelectorArray(selectors.rating),
      reviewText: this.optimizeSelectorArray(selectors.reviewText),
      date: this.optimizeSelectorArray(selectors.date)
    };
    
    return optimized;
  }

  /**
   * Optimize individual selector arrays
   */
  private optimizeSelectorArray(selectors: string[]): string[] {
    // Remove duplicates and sort by specificity (more specific selectors first)
    const unique = [...new Set(selectors)];
    
    return unique.sort((a, b) => {
      // Sort by specificity: more specific selectors (with more attributes) first
      const aSpecificity = (a.match(/\[/g) || []).length + (a.match(/\./g) || []).length;
      const bSpecificity = (b.match(/\[/g) || []).length + (b.match(/\./g) || []).length;
      return bSpecificity - aSpecificity;
    });
  }

  /**
   * Log comprehensive performance report
   */
  private logPerformanceReport(): void {
    if (this.performanceMetrics.length === 0) return;
    
    const metrics = this.getPerformanceMetrics();
    
    this.log('=== Language Detection Performance Report ===');
    this.log(`Total detections: ${metrics.totalDetections}`);
    this.log(`Average detection time: ${metrics.averageDetectionTime.toFixed(2)}ms`);
    this.log(`Cache hit rate: ${(metrics.cacheHitRate * 100).toFixed(1)}%`);
    this.log(`Selector cache hit rate: ${((this.selectorCacheHits / Math.max(this.selectorCacheRequests, 1)) * 100).toFixed(1)}%`);
    this.log(`Memory usage: ${this.formatBytes(metrics.memoryUsage)}`);
    this.log(`Cache size: ${metrics.cacheSize} entries`);
    this.log(`Selector cache size: ${metrics.selectorCacheSize} entries`);
    
    // Language-specific metrics
    Object.entries(metrics.detectionsByLanguage).forEach(([lang, count]) => {
      const avgConfidence = metrics.averageConfidenceByLanguage[lang] || 0;
      this.log(`${lang}: ${count} detections, avg confidence: ${(avgConfidence * 100).toFixed(1)}%`);
    });
    
    // Performance warnings
    if (metrics.cacheHitRate < 0.5) {
      this.log('⚠️  Low cache hit rate - consider increasing cache TTL or size');
    }
    
    if (metrics.averageDetectionTime > 1000) {
      this.log('⚠️  High average detection time - consider optimizing detection logic');
    }
    
    if (metrics.memoryUsage > 50 * 1024 * 1024) { // 50MB
      this.log('⚠️  High memory usage - consider reducing cache sizes');
    }
    
    this.log('============================================');
  }

  /**
   * Generate cache key for language detection
   */
  private generateCacheKey(url: string, pageContent?: string): string {
    // Use URL as primary key, with optional content hash for more precision
    if (pageContent) {
      const contentHash = this.simpleHash(pageContent.substring(0, 1000)); // First 1KB for performance
      return `${url}:${contentHash}`;
    }
    return url;
  }

  /**
   * Simple hash function for content
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /**
   * Enhanced cache cleanup with better memory management
   */
  private cleanupExpiredCache(): void {
    const now = Date.now();
    let removedDetectionCount = 0;
    let removedSelectorCount = 0;
    
    // Clean up expired detection cache entries
    for (const [key, entry] of this.detectionCache.entries()) {
      if (now - entry.timestamp > this.CACHE_TTL) {
        this.detectionCache.delete(key);
        removedDetectionCount++;
        this.cacheEvictions++;
      }
    }
    
    // Clean up expired selector cache entries with separate TTL
    for (const [key, entry] of this.selectorGenerationCache.entries()) {
      if (now - entry.timestamp > this.SELECTOR_CACHE_TTL) {
        this.selectorGenerationCache.delete(key);
        removedSelectorCount++;
      }
    }
    
    // Clean up orphaned selector cache entries
    for (const [key, _] of this.selectorCache.entries()) {
      if (!this.detectionCache.has(key) && !key.startsWith('lang-selectors-')) {
        this.selectorCache.delete(key);
        removedSelectorCount++;
      }
    }
    
    if (removedDetectionCount > 0 || removedSelectorCount > 0) {
      this.debugLog(`Cleaned up ${removedDetectionCount} detection cache entries and ${removedSelectorCount} selector cache entries`);
    }
    
    // Enforce max cache size with LRU-like eviction
    this.enforceMaxCacheSize();
  }

  /**
   * Enforce maximum cache size with LRU-like eviction strategy
   */
  private enforceMaxCacheSize(): void {
    // Detection cache size enforcement
    if (this.detectionCache.size > this.MAX_CACHE_SIZE) {
      const entriesToRemove = this.detectionCache.size - this.MAX_CACHE_SIZE;
      const sortedEntries = Array.from(this.detectionCache.entries())
        .sort(([,a], [,b]) => {
          // Sort by last access time (timestamp) and confidence
          // Keep high-confidence, recently accessed entries
          const aScore = a.timestamp + (a.result.confidence * 60000); // Boost recent high-confidence entries
          const bScore = b.timestamp + (b.result.confidence * 60000);
          return aScore - bScore;
        });
      
      for (let i = 0; i < entriesToRemove; i++) {
        const [key] = sortedEntries[i];
        this.detectionCache.delete(key);
        this.selectorCache.delete(key);
        this.cacheEvictions++;
      }
      
      this.debugLog(`Evicted ${entriesToRemove} oldest/lowest-confidence cache entries to maintain size limit`);
    }
    
    // Selector cache size enforcement (separate limit)
    const maxSelectorCacheSize = this.MAX_CACHE_SIZE * 2; // Allow more selector cache entries
    if (this.selectorCache.size > maxSelectorCacheSize) {
      const entriesToRemove = this.selectorCache.size - maxSelectorCacheSize;
      const selectorEntries = Array.from(this.selectorCache.keys());
      
      // Remove oldest non-language-specific entries first
      const nonLanguageEntries = selectorEntries.filter(key => !key.startsWith('lang-selectors-'));
      const toRemove = nonLanguageEntries.slice(0, entriesToRemove);
      
      toRemove.forEach(key => this.selectorCache.delete(key));
      this.debugLog(`Evicted ${toRemove.length} selector cache entries to maintain size limit`);
    }
  }

  /**
   * Get cached language detection result
   */
  private getCachedDetection(cacheKey: string): LanguageDetectionCacheEntry | null {
    this.totalCacheRequests++;
    
    const entry = this.detectionCache.get(cacheKey);
    if (!entry) return null;
    
    const now = Date.now();
    if (now - entry.timestamp > this.CACHE_TTL) {
      this.detectionCache.delete(cacheKey);
      this.selectorCache.delete(cacheKey);
      this.cacheEvictions++;
      return null;
    }
    
    this.cacheHits++;
    return entry;
  }

  /**
   * Cache language detection result
   */
  private cacheDetectionResult(
    cacheKey: string, 
    result: LanguageDetectionResult, 
    url: string,
    performance: LanguageDetectionPerformance
  ): void {
    const entry: LanguageDetectionCacheEntry = {
      result,
      timestamp: Date.now(),
      url,
      performance
    };
    
    this.detectionCache.set(cacheKey, entry);
    
    // Also cache the selectors for quick retrieval
    if (result.suggestedSelectors) {
      this.selectorCache.set(cacheKey, result.suggestedSelectors);
    }
    
    // Enforce cache size limits immediately after adding new entries
    this.enforceMaxCacheSize();
    
    this.debugLog(`Cached language detection result for ${url} (${result.language}, confidence: ${result.confidence})`);
  }

  /**
   * Record enhanced performance metrics with caching statistics
   */
  private recordPerformance(metrics: LanguageDetectionPerformance): void {
    const enhancedMetrics: LanguageDetectionPerformance = {
      ...metrics,
      memoryUsage: this.getMemoryUsage(),
      timestamp: Date.now(),
      cacheSize: this.detectionCache.size,
      selectorCacheSize: this.selectorCache.size
    };
    
    this.performanceMetrics.push(enhancedMetrics);
    
    // Keep only recent metrics to prevent memory bloat
    if (this.performanceMetrics.length > this.MAX_PERFORMANCE_ENTRIES) {
      this.performanceMetrics = this.performanceMetrics.slice(-this.MAX_PERFORMANCE_ENTRIES / 2);
    }
    
    // Enhanced performance logging
    const cacheHitRate = this.totalCacheRequests > 0 ? (this.cacheHits / this.totalCacheRequests * 100).toFixed(1) : '0.0';
    const selectorCacheHitRate = this.selectorCacheRequests > 0 ? (this.selectorCacheHits / this.selectorCacheRequests * 100).toFixed(1) : '0.0';
    
    this.debugLog(`Performance: detection=${metrics.detectionTime}ms, cache=${metrics.cacheHit ? 'HIT' : 'MISS'} (${cacheHitRate}%), selector_cache=${selectorCacheHitRate}%, selectors=${metrics.totalSelectors}, memory=${this.formatBytes(enhancedMetrics.memoryUsage || 0)}, cache_size=${enhancedMetrics.cacheSize}/${enhancedMetrics.selectorCacheSize}`);
  }

  /**
   * Get current memory usage (approximate)
   */
  private getMemoryUsage(): number {
    try {
      if (typeof process !== 'undefined' && process.memoryUsage) {
        return process.memoryUsage().heapUsed;
      }
    } catch (error) {
      // Fallback for browser environments
    }
    
    // Estimate cache memory usage more accurately
    let estimatedMemory = 0;
    
    // Detection cache estimation
    for (const [key, entry] of this.detectionCache.entries()) {
      estimatedMemory += key.length * 2; // String key
      estimatedMemory += JSON.stringify(entry).length * 2; // Entry data
    }
    
    // Selector cache estimation
    for (const [key, selectors] of this.selectorCache.entries()) {
      estimatedMemory += key.length * 2; // String key
      estimatedMemory += JSON.stringify(selectors).length * 2; // Selector data
    }
    
    // Performance metrics estimation
    estimatedMemory += this.performanceMetrics.length * 200; // Rough estimate per metric
    
    return estimatedMemory;
  }

  /**
   * Format bytes to human readable format
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Get comprehensive performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    if (this.performanceMetrics.length === 0) {
      return {
        averageDetectionTime: 0,
        cacheHitRate: 0,
        totalDetections: 0,
        averageSelectorCount: 0,
        memoryUsage: this.getMemoryUsage(),
        cacheSize: this.detectionCache.size,
        selectorCacheSize: this.selectorCache.size,
        detectionsByLanguage: {},
        averageConfidenceByLanguage: {},
        slowestDetections: [],
        cacheEfficiency: {
          hitRate: 0,
          missRate: 0,
          evictionRate: 0
        }
      };
    }

    const totalDetections = this.performanceMetrics.length;
    const averageDetectionTime = this.performanceMetrics.reduce((sum, m) => sum + m.detectionTime, 0) / totalDetections;
    const cacheHitRate = this.totalCacheRequests > 0 ? this.cacheHits / this.totalCacheRequests : 0;
    const averageSelectorCount = this.performanceMetrics.reduce((sum, m) => sum + m.totalSelectors, 0) / totalDetections;

    // Language-specific metrics
    const detectionsByLanguage: Record<string, number> = {};
    const confidenceByLanguage: Record<string, number[]> = {};

    this.performanceMetrics.forEach(metric => {
      detectionsByLanguage[metric.language] = (detectionsByLanguage[metric.language] || 0) + 1;
      if (!confidenceByLanguage[metric.language]) {
        confidenceByLanguage[metric.language] = [];
      }
      confidenceByLanguage[metric.language].push(metric.confidence);
    });

    const averageConfidenceByLanguage: Record<string, number> = {};
    Object.entries(confidenceByLanguage).forEach(([lang, confidences]) => {
      averageConfidenceByLanguage[lang] = confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
    });

    // Slowest detections (top 5)
    const slowestDetections = [...this.performanceMetrics]
      .sort((a, b) => b.detectionTime - a.detectionTime)
      .slice(0, 5)
      .map(m => ({
        url: m.url,
        language: m.language,
        detectionTime: m.detectionTime,
        timestamp: m.timestamp
      }));

    // Cache efficiency metrics
    const missRate = this.totalCacheRequests > 0 ? (this.totalCacheRequests - this.cacheHits) / this.totalCacheRequests : 0;
    const evictionRate = this.totalCacheRequests > 0 ? this.cacheEvictions / this.totalCacheRequests : 0;

    return {
      averageDetectionTime,
      cacheHitRate,
      totalDetections,
      averageSelectorCount,
      memoryUsage: this.getMemoryUsage(),
      cacheSize: this.detectionCache.size,
      selectorCacheSize: this.selectorCache.size,
      detectionsByLanguage,
      averageConfidenceByLanguage,
      slowestDetections,
      cacheEfficiency: {
        hitRate: cacheHitRate,
        missRate,
        evictionRate
      }
    };
  }

  /**
   * Clear all caches and reset performance metrics (useful for testing)
   */
  clearCaches(): void {
    this.detectionCache.clear();
    this.selectorCache.clear();
    this.selectorGenerationCache.clear();
    this.performanceMetrics = [];
    this.cacheEvictions = 0;
    this.totalCacheRequests = 0;
    this.cacheHits = 0;
    this.selectorCacheHits = 0;
    this.selectorCacheRequests = 0;
    
    this.debugLog('All caches cleared and performance metrics reset');
  }

  /**
   * Warm up caches with common selectors for better initial performance
   */
  warmUpCaches(): void {
    this.debugLog('Warming up caches with common selectors...');
    
    const commonLanguages = ['english', 'hebrew', 'generic'];
    commonLanguages.forEach(lang => {
      this.getLanguageSpecificSelectors(lang);
    });
    
    this.debugLog(`Cache warm-up complete for ${commonLanguages.length} languages`);
  }

  private log(message: string): void {
    console.log(`[LanguageDetection] ${message}`);
    this.progressCallback?.(message);
  }

  private debugLog(message: string): void {
    if (this.debugMode) {
      console.log(`[LanguageDetection Debug] ${message}`);
    }
  }

  /**
   * Detect the language of a Google Maps page with enhanced logging and caching
   */
  async detectPageLanguage(page: Page): Promise<LanguageDetectionResult> {
    this.log('Starting comprehensive language detection...');
    const startTime = Date.now();
    
    try {
      // Get current URL for caching
      const url = await page.url();
      const cacheKey = this.generateCacheKey(url);
      
      // Check cache first
      const cachedEntry = this.getCachedDetection(cacheKey);
      if (cachedEntry) {
        const cacheTime = Date.now() - startTime;
        this.log(`Language detection cache HIT for ${url} (${cachedEntry.result.language}, confidence: ${(cachedEntry.result.confidence * 100).toFixed(1)}%) in ${cacheTime}ms`);
        
        // Record cache hit performance
        this.recordPerformance({
          detectionTime: cacheTime,
          cacheHit: true,
          selectorGenerationTime: 0,
          totalSelectors: cachedEntry.result.suggestedSelectors ? Object.values(cachedEntry.result.suggestedSelectors).flat().length : 0,
          timestamp: Date.now(),
          url,
          language: cachedEntry.result.language,
          confidence: cachedEntry.result.confidence
        });
        
        return cachedEntry.result;
      }
      
      this.log(`Language detection cache MISS for ${url}, performing detection...`);
      // Enhanced logging for detection process
      this.debugLog('Analyzing page DOM for language indicators...');
      
      const detectionResult = await page.evaluate(() => {
        const results = {
          hebrew: { score: 0, elements: [] as string[] },
          english: { score: 0, elements: [] as string[] }
        };

        // Get page text content
        const bodyText = document.body.textContent || '';
        const htmlLang = document.documentElement.lang || '';
        
        // Check HTML lang attribute
        if (htmlLang.includes('he') || htmlLang.includes('iw')) {
          results.hebrew.score += 30;
          results.hebrew.elements.push(`html[lang="${htmlLang}"]`);
        } else if (htmlLang.includes('en')) {
          results.english.score += 30;
          results.english.elements.push(`html[lang="${htmlLang}"]`);
        }

        // Check for Hebrew characters and patterns
        const hebrewUnicodeMatches = (bodyText.match(/[\u0590-\u05FF]/g) || []).length;
        if (hebrewUnicodeMatches > 0) {
          results.hebrew.score += Math.min(hebrewUnicodeMatches * 2, 40);
          results.hebrew.elements.push(`${hebrewUnicodeMatches} Hebrew characters`);
        }



        // Check for Hebrew common words
        const hebrewWords = ['ממליץ מקומי', 'ביקורות', 'תמונות', 'כוכבים', 'כוכב', 'לפני'];
        hebrewWords.forEach(word => {
          if (bodyText.includes(word)) {
            results.hebrew.score += 15;
            results.hebrew.elements.push(`Hebrew word: "${word}"`);
          }
        });



        // Check for English common words
        const englishWords = ['Local Guide', 'reviews', 'photos', 'stars', 'star', 'ago'];
        englishWords.forEach(word => {
          if (bodyText.toLowerCase().includes(word.toLowerCase())) {
            results.english.score += 10;
            results.english.elements.push(`English word: "${word}"`);
          }
        });

        // Check for RTL direction indicators
        const rtlElements = document.querySelectorAll('[dir="rtl"], [style*="direction: rtl"]');
        if (rtlElements.length > 0) {
          results.hebrew.score += 20;
          results.hebrew.elements.push(`${rtlElements.length} RTL elements`);
        }

        // Check for language-specific UI elements
        const hebrewUIElements = document.querySelectorAll('[aria-label*="ביקורות"], [aria-label*="תמונות"]');
        if (hebrewUIElements.length > 0) {
          results.hebrew.score += 25;
          results.hebrew.elements.push(`${hebrewUIElements.length} Hebrew UI elements`);
        }



        const englishUIElements = document.querySelectorAll('[aria-label*="Reviews"], [aria-label*="Photos"]');
        if (englishUIElements.length > 0) {
          results.english.score += 20;
          results.english.elements.push(`${englishUIElements.length} English UI elements`);
        }

        return results;
      });

      // Determine the detected language based on scores
      const languages = Object.entries(detectionResult);
      const sortedLanguages = languages.sort(([,a], [,b]) => b.score - a.score);
      const [detectedLang, langData] = sortedLanguages[0];
      
      // Calculate confidence (0-1 scale)
      const maxScore = Math.max(...languages.map(([,data]) => data.score));
      const confidence = maxScore > 0 ? Math.min(maxScore / 100, 1) : 0;
      
      // Determine if it's an RTL language
      const isRTL = detectedLang === 'hebrew';
      
      // Get suggested selectors for the detected language
      const suggestedSelectors = this.getLanguageSpecificSelectors(detectedLang);

      const result: LanguageDetectionResult = {
        language: detectedLang,
        confidence,
        isRTL,
        detectedElements: langData.elements,
        suggestedSelectors
      };

      const detectionTime = Date.now() - startTime;
      const selectorGenerationStart = Date.now();
      
      // Enhanced logging for language detection results
      this.log(`Language detected: ${detectedLang} (confidence: ${(confidence * 100).toFixed(1)}%, RTL: ${isRTL}) in ${detectionTime}ms`);
      this.log(`Detection elements found: ${langData.elements.length} indicators`);
      
      // Detailed confidence score logging
      if (confidence >= 0.8) {
        this.log(`High confidence detection - using language-specific selectors`);
      } else if (confidence >= 0.5) {
        this.log(`Medium confidence detection - using adaptive selectors with fallbacks`);
      } else {
        this.log(`Low confidence detection - using generic selectors with broad fallbacks`);
      }
      
      // Log detected elements for debugging
      this.debugLog(`Detected elements: ${JSON.stringify(langData.elements, null, 2)}`);
      this.debugLog(`Language scores: ${JSON.stringify(detectionResult, null, 2)}`);
      this.debugLog(`Suggested selectors count: ${Object.values(suggestedSelectors).flat().length}`);

      const selectorGenerationTime = Date.now() - selectorGenerationStart;
      const totalSelectors = Object.values(suggestedSelectors).flat().length;
      
      // Cache the result
      const performance: LanguageDetectionPerformance = {
        detectionTime,
        cacheHit: false,
        selectorGenerationTime,
        totalSelectors,
        timestamp: Date.now(),
        url,
        language: result.language,
        confidence: result.confidence
      };
      
      this.cacheDetectionResult(cacheKey, result, url, performance);
      this.recordPerformance(performance);

      return result;

    } catch (error) {
      const detectionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      this.log(`Language detection failed after ${detectionTime}ms: ${errorMessage}`);
      this.debugLog(`Language detection error details: ${JSON.stringify(error, null, 2)}`);
      
      // Enhanced fallback logging
      this.log('Falling back to default English detection with generic selectors');
      
      // Create fallback result
      const fallbackResult: LanguageDetectionResult = {
        language: 'english',
        confidence: 0.3, // Lower confidence to indicate fallback
        isRTL: false,
        detectedElements: ['fallback-default', `error: ${errorMessage}`],
        suggestedSelectors: this.multilingualSelectors.generic // Use generic instead of English-specific
      };
      
      // Cache the fallback result (with shorter TTL)
      try {
        const url = await page.url();
        const cacheKey = this.generateCacheKey(url);
        const performance: LanguageDetectionPerformance = {
          detectionTime,
          cacheHit: false,
          selectorGenerationTime: 0,
          totalSelectors: Object.values(this.multilingualSelectors.generic).flat().length,
          timestamp: Date.now(),
          url,
          language: fallbackResult.language,
          confidence: fallbackResult.confidence
        };
        
        // Cache with shorter TTL for error cases (1 minute)
        const shortTTLEntry: LanguageDetectionCacheEntry = {
          result: fallbackResult,
          timestamp: Date.now() - (this.CACHE_TTL - 60000), // Expire in 1 minute
          url,
          performance
        };
        this.detectionCache.set(cacheKey, shortTTLEntry);
        this.recordPerformance(performance);
      } catch (cacheError) {
        this.debugLog(`Failed to cache fallback result: ${cacheError}`);
      }
      
      return fallbackResult;
    }
  }

  /**
   * Check if a language is supported by the detection service
   */
  isLanguageSupported(language: string): boolean {
    return ['english', 'hebrew'].includes(language.toLowerCase());
  }

  /**
   * Get language-specific selectors with enhanced caching and optimization
   */
  getLanguageSpecificSelectors(language: string): SelectorSet {
    const normalizedLang = language.toLowerCase();
    const cacheKey = `lang-selectors-${normalizedLang}`;
    
    this.selectorCacheRequests++;
    
    // Check precomputed selectors first (fastest)
    const precomputed = this.precomputedSelectors.get(normalizedLang);
    if (precomputed) {
      this.selectorCacheHits++;
      this.debugLog(`Precomputed selector HIT for language: ${normalizedLang}`);
      return precomputed;
    }
    
    // Check regular cache
    const cached = this.selectorCache.get(cacheKey);
    if (cached) {
      this.selectorCacheHits++;
      this.debugLog(`Selector cache HIT for language: ${normalizedLang}`);
      return cached;
    }
    
    // Check generation cache with TTL
    const generationCached = this.selectorGenerationCache.get(cacheKey);
    if (generationCached && (Date.now() - generationCached.timestamp) < this.SELECTOR_CACHE_TTL) {
      this.selectorCacheHits++;
      this.debugLog(`Selector generation cache HIT for language: ${normalizedLang}`);
      return generationCached.selectors;
    }
    
    // Generate optimized selectors
    const startTime = Date.now();
    const selectors = this.generateOptimizedSelectors(normalizedLang);
    const generationTime = Date.now() - startTime;
    
    // Cache in multiple layers for different access patterns
    this.selectorCache.set(cacheKey, selectors);
    this.selectorGenerationCache.set(cacheKey, {
      selectors,
      timestamp: Date.now()
    });
    
    this.debugLog(`Generated and cached selectors for language: ${normalizedLang} (${Object.values(selectors).flat().length} total) in ${generationTime}ms`);
    
    return selectors;
  }

  /**
   * Get all available multilingual selectors
   */
  getAllSelectors(): MultilingualSelectors {
    return this.multilingualSelectors;
  }

  /**
   * Generate dynamic selectors based on detected language patterns with caching
   */
  generateDynamicSelectors(detectionResult: LanguageDetectionResult): SelectorSet {
    const startTime = Date.now();
    
    // Create cache key based on detection result
    const cacheKey = `dynamic-${detectionResult.language}-${detectionResult.confidence.toFixed(2)}-${detectionResult.detectedElements.join(',').substring(0, 50)}`;
    
    // Check cache first
    const cached = this.selectorCache.get(cacheKey);
    if (cached) {
      const cacheTime = Date.now() - startTime;
      this.debugLog(`Dynamic selector cache HIT in ${cacheTime}ms for ${detectionResult.language}`);
      return cached;
    }
    
    const baseSelectors = this.getLanguageSpecificSelectors(detectionResult.language);
    const dynamicSelectors: SelectorSet = {
      reviewsTab: [...baseSelectors.reviewsTab],
      reviewContainer: [...baseSelectors.reviewContainer],
      authorName: [...baseSelectors.authorName],
      rating: [...baseSelectors.rating],
      reviewText: [...baseSelectors.reviewText],
      date: [...baseSelectors.date]
    };

    // Add dynamic selectors based on detected elements
    detectionResult.detectedElements.forEach(element => {
      if (element.includes('Hebrew')) {
        // Add Hebrew-specific dynamic selectors
        dynamicSelectors.rating.unshift('[aria-label*="כוכבים"]');
        dynamicSelectors.date.unshift('span:contains("לפני")');
      } else if (element.includes('RTL')) {
        // Add RTL-specific selectors (Hebrew is RTL)
        dynamicSelectors.reviewContainer.unshift('div[dir="rtl"]');
        dynamicSelectors.authorName.unshift('div[dir="rtl"] span:first-child');
      }
    });

    // Add confidence-based selector prioritization
    if (detectionResult.confidence > 0.8) {
      // High confidence - prioritize language-specific selectors
      this.prioritizeLanguageSpecificSelectors(dynamicSelectors, detectionResult.language);
    } else if (detectionResult.confidence < 0.5) {
      // Low confidence - add more generic fallback selectors
      this.addGenericFallbackSelectors(dynamicSelectors);
    }

    // Cache the generated selectors
    this.selectorCache.set(cacheKey, dynamicSelectors);
    
    const generationTime = Date.now() - startTime;
    const totalSelectors = Object.values(dynamicSelectors).flat().length;
    
    this.debugLog(`Generated and cached ${totalSelectors} dynamic selectors for ${detectionResult.language} in ${generationTime}ms`);
    return dynamicSelectors;
  }

  /**
   * Prioritize language-specific selectors based on detection confidence
   */
  private prioritizeLanguageSpecificSelectors(selectors: SelectorSet, language: string): void {
    const languageSpecific = this.getLanguageSpecificSelectors(language);
    
    // Move language-specific selectors to the front of each array
    Object.keys(selectors).forEach(key => {
      const selectorKey = key as keyof SelectorSet;
      const specificSelectors = languageSpecific[selectorKey];
      const currentSelectors = selectors[selectorKey];
      
      // Remove duplicates and prioritize specific selectors
      const uniqueSelectors = [...new Set([...specificSelectors, ...currentSelectors])];
      selectors[selectorKey] = uniqueSelectors;
    });
  }

  /**
   * Add generic fallback selectors for low-confidence detection
   */
  private addGenericFallbackSelectors(selectors: SelectorSet): void {
    const genericSelectors = this.multilingualSelectors.generic;
    
    // Add generic selectors as fallbacks
    Object.keys(selectors).forEach(key => {
      const selectorKey = key as keyof SelectorSet;
      const currentSelectors = selectors[selectorKey];
      const fallbackSelectors = genericSelectors[selectorKey];
      
      // Append generic selectors as fallbacks
      selectors[selectorKey] = [...currentSelectors, ...fallbackSelectors];
    });
  }

  /**
   * Generate selectors for specific Google Maps versions
   */
  generateVersionSpecificSelectors(version: 'modern' | 'legacy' | 'mobile'): SelectorSet {
    const baseSelectors = this.multilingualSelectors.generic;
    
    switch (version) {
      case 'modern':
        return {
          reviewsTab: [
            '[role="tab"][data-value="1"]',
            'button[jsaction*="pane.tab"]',
            ...baseSelectors.reviewsTab
          ],
          reviewContainer: [
            'div[class*="jftiEf"]',
            '[data-review-id]',
            ...baseSelectors.reviewContainer
          ],
          authorName: [
            'span[class*="fontBodyMedium"]:first-child',
            'div[class*="fontBodyMedium"]:first-child',
            ...baseSelectors.authorName
          ],
          rating: [
            '[role="img"][aria-label*="star" i]',
            'span[aria-label*="stars"]',
            ...baseSelectors.rating
          ],
          reviewText: [
            'span[class*="fontBodyMedium"]',
            'div[data-expandable-section]',
            ...baseSelectors.reviewText
          ],
          date: [
            'span[class*="fontBodySmall"]:last-child',
            ...baseSelectors.date
          ]
        };
        
      case 'legacy':
        return {
          reviewsTab: [
            '.section-tab[aria-label*="review" i]',
            '[data-tab-index="1"]',
            ...baseSelectors.reviewsTab
          ],
          reviewContainer: [
            '.section-review-content',
            '[data-review-id]',
            ...baseSelectors.reviewContainer
          ],
          authorName: [
            '.section-review-author',
            '[class*="author"]',
            ...baseSelectors.authorName
          ],
          rating: [
            '.section-review-stars',
            '[aria-label*="star" i]',
            ...baseSelectors.rating
          ],
          reviewText: [
            '.section-review-text',
            '[class*="review-text"]',
            ...baseSelectors.reviewText
          ],
          date: [
            '.section-review-publish-date',
            ...baseSelectors.date
          ]
        };
        
      case 'mobile':
        return {
          reviewsTab: [
            'button[role="tab"]',
            '[data-tab-index="1"]',
            ...baseSelectors.reviewsTab
          ],
          reviewContainer: [
            'div[role="listitem"]',
            '[data-review-id]',
            ...baseSelectors.reviewContainer
          ],
          authorName: [
            'span:first-child',
            'div:first-child span',
            ...baseSelectors.authorName
          ],
          rating: [
            '[aria-label*="star" i]',
            '[role="img"]',
            ...baseSelectors.rating
          ],
          reviewText: [
            'span[jsaction*="expand"]',
            'div[class*="text"]',
            ...baseSelectors.reviewText
          ],
          date: [
            'span:last-child',
            ...baseSelectors.date
          ]
        };
        
      default:
        return baseSelectors;
    }
  }

  /**
   * Combine multiple selector sets with priority ordering
   */
  combineSelectors(...selectorSets: SelectorSet[]): SelectorSet {
    const combined: SelectorSet = {
      reviewsTab: [],
      reviewContainer: [],
      authorName: [],
      rating: [],
      reviewText: [],
      date: []
    };

    // Combine all selector sets, maintaining order priority
    selectorSets.forEach(selectorSet => {
      Object.keys(combined).forEach(key => {
        const selectorKey = key as keyof SelectorSet;
        combined[selectorKey].push(...selectorSet[selectorKey]);
      });
    });

    // Remove duplicates while preserving order
    Object.keys(combined).forEach(key => {
      const selectorKey = key as keyof SelectorSet;
      combined[selectorKey] = [...new Set(combined[selectorKey])];
    });

    return combined;
  }

  /**
   * Create language-agnostic selectors that work across different Google Maps versions with caching
   */
  createUniversalSelectors(): SelectorSet {
    const cacheKey = 'universal-selectors';
    
    // Check cache first
    const cached = this.selectorCache.get(cacheKey);
    if (cached) {
      this.debugLog('Universal selector cache HIT');
      return cached;
    }
    
    const selectors: SelectorSet = {
      reviewsTab: [
        // Universal tab selectors that work regardless of language
        '[role="tab"][data-value="1"]',
        '[role="tab"]:nth-child(2)',
        'button[jsaction*="tab"]',
        '[data-tab-index="1"]',
        // Structural patterns
        'div[role="tablist"] > div:nth-child(2)',
        'div[role="tablist"] > button:nth-child(2)',
        // Fallback patterns
        '[role="tab"]',
        'button[aria-selected="true"]'
      ],
      reviewContainer: [
        // Universal container selectors
        '[data-review-id]',
        'div[role="listitem"]',
        '[jsaction*="review"]',
        // Google Maps specific classes
        'div[class*="jftiEf"]',
        'div[class*="fontBodyMedium"]',
        // Structural patterns
        'div[role="list"] > div',
        'div[jsaction] div[jsaction]',
        // Broad fallback patterns
        'div[class*="review"]',
        '[data-value*="review"]'
      ],
      authorName: [
        // Universal author selectors
        'span[class*="fontBodyMedium"]:first-child',
        'div[class*="fontBodyMedium"]:first-child',
        // Structural patterns
        'span:first-child',
        'div:first-child span',
        'div[jsaction] span:first-child',
        // Semantic patterns
        '[class*="author"]',
        '[class*="name"]',
        // Fallback patterns
        '[data-value*="name" i]',
        '[aria-label*="name" i]'
      ],
      rating: [
        // Universal rating selectors
        '[role="img"][aria-label]',
        'span[aria-label]',
        'div[aria-label]',
        // Pattern-based selectors
        '[aria-label*="star" i]',
        '[aria-label*="rating" i]',
        '[title*="star" i]',
        // Data-based selectors
        '[data-value*="rating"]',
        // Fallback patterns
        '[jsaction*="rating"]'
      ],
      reviewText: [
        // Universal text selectors
        'span[class*="fontBodyMedium"]',
        'div[class*="text"]',
        // Interactive text patterns
        'span[jsaction*="expand"]',
        'div[data-expandable-section]',
        // Structural patterns
        'div > span',
        'span[class*="fontBodySmall"]',
        // Semantic patterns
        '[class*="content"]',
        '[class*="review-text"]'
      ],
      date: [
        // Universal date selectors
        'span[class*="fontBodySmall"]:last-child',
        'span:last-child',
        'div:last-child span',
        // Data-based selectors
        '[data-value*="date"]',
        '[data-value*="time"]',
        // Fallback patterns
        'span[class*="fontBodySmall"]'
      ]
    };
    
    // Cache the universal selectors
    this.selectorCache.set(cacheKey, selectors);
    this.debugLog(`Cached universal selectors (${Object.values(selectors).flat().length} total)`);
    
    return selectors;
  }





  /**
   * Preload commonly used selectors into cache
   */
  preloadSelectors(): void {
    const startTime = Date.now();
    let preloadedCount = 0;
    
    // Preload selectors for all supported languages
    const supportedLanguages = ['english', 'hebrew'];
    
    supportedLanguages.forEach(language => {
      const cacheKey = `lang-selectors-${language}`;
      if (!this.selectorCache.has(cacheKey)) {
        const selectors = this.getLanguageSpecificSelectors(language);
        this.selectorCache.set(cacheKey, selectors);
        preloadedCount++;
      }
    });
    
    // Preload universal selectors
    const universalKey = 'universal-selectors';
    if (!this.selectorCache.has(universalKey)) {
      const universalSelectors = this.createUniversalSelectors();
      this.selectorCache.set(universalKey, universalSelectors);
      preloadedCount++;
    }
    
    const preloadTime = Date.now() - startTime;
    this.log(`Preloaded ${preloadedCount} selector sets in ${preloadTime}ms`);
  }

  /**
   * Warm up cache with common URL patterns
   */
  warmupCache(commonUrls: string[] = []): void {
    const startTime = Date.now();
    
    // Default common URL patterns for Google Maps
    const defaultPatterns = [
      'https://www.google.com/maps/place/',
      'https://maps.google.com/maps/place/',
      'https://www.google.co.il/maps/place/',
      'https://maps.google.co.il/maps/place/'
    ];
    
    const urlsToWarmup = commonUrls.length > 0 ? commonUrls : defaultPatterns;
    
    urlsToWarmup.forEach(url => {
      const cacheKey = this.generateCacheKey(url);
      
      // Create a basic cache entry for common patterns
      const warmupResult: LanguageDetectionResult = {
        language: url.includes('.co.il') ? 'hebrew' : 'english',
        confidence: 0.6, // Medium confidence for warmup
        isRTL: url.includes('.co.il'),
        detectedElements: ['warmup-entry'],
        suggestedSelectors: this.getLanguageSpecificSelectors(
          url.includes('.co.il') ? 'hebrew' : 'english'
        )
      };
      
      const warmupEntry: LanguageDetectionCacheEntry = {
        result: warmupResult,
        timestamp: Date.now(),
        url,
        performance: {
          detectionTime: 0,
          cacheHit: false,
          selectorGenerationTime: 0,
          totalSelectors: Object.values(warmupResult.suggestedSelectors || {}).flat().length,
          timestamp: Date.now(),
          url,
          language: warmupResult.language,
          confidence: warmupResult.confidence
        }
      };
      
      this.detectionCache.set(cacheKey, warmupEntry);
    });
    
    const warmupTime = Date.now() - startTime;
    this.log(`Cache warmup completed in ${warmupTime}ms for ${urlsToWarmup.length} URL patterns`);
  }

  /**
   * Get performance insights and optimization recommendations
   */
  getPerformanceInsights(): {
    insights: string[];
    recommendations: string[];
    metrics: PerformanceMetrics;
    healthScore: number;
  } {
    const metrics = this.getPerformanceMetrics();
    const insights: string[] = [];
    const recommendations: string[] = [];
    
    // Analyze cache performance
    if (metrics.cacheHitRate < 30) {
      insights.push(`Low cache hit rate: ${metrics.cacheHitRate}%`);
      recommendations.push('Consider preloading common selectors or increasing cache TTL');
    } else if (metrics.cacheHitRate > 80) {
      insights.push(`Excellent cache hit rate: ${metrics.cacheHitRate}%`);
    }
    
    // Analyze detection time
    if (metrics.averageDetectionTime > 1000) {
      insights.push(`Slow average detection time: ${metrics.averageDetectionTime}ms`);
      recommendations.push('Consider optimizing language detection patterns or using more specific selectors');
    } else if (metrics.averageDetectionTime < 100) {
      insights.push(`Fast average detection time: ${metrics.averageDetectionTime}ms`);
    }
    
    // Analyze memory usage
    const memoryMB = metrics.memoryUsage / (1024 * 1024);
    if (memoryMB > 50) {
      insights.push(`High memory usage: ${this.formatBytes(metrics.memoryUsage)}`);
      recommendations.push('Consider running cache optimization or reducing cache size limits');
    }
    
    // Analyze cache size
    if (metrics.cacheSize > this.MAX_CACHE_SIZE * 0.9) {
      insights.push(`Cache near capacity: ${metrics.cacheSize}/${this.MAX_CACHE_SIZE}`);
      recommendations.push('Run cache optimization to free up space');
    }
    
    // Analyze language distribution
    const totalLanguageDetections = Object.values(metrics.detectionsByLanguage).reduce((sum, count) => sum + count, 0);
    if (totalLanguageDetections > 0) {
      const languageDistribution = Object.entries(metrics.detectionsByLanguage)
        .map(([lang, count]) => `${lang}: ${((count / totalLanguageDetections) * 100).toFixed(1)}%`)
        .join(', ');
      insights.push(`Language distribution: ${languageDistribution}`);
    }
    
    // Analyze confidence levels
    Object.entries(metrics.averageConfidenceByLanguage).forEach(([lang, confidence]) => {
      if (confidence < 0.5) {
        insights.push(`Low confidence for ${lang}: ${(confidence * 100).toFixed(1)}%`);
        recommendations.push(`Review ${lang} language detection patterns for better accuracy`);
      }
    });
    
    // Calculate health score (0-100)
    let healthScore = 100;
    healthScore -= Math.max(0, (1000 - metrics.averageDetectionTime) / 10); // Penalty for slow detection
    healthScore -= Math.max(0, (80 - metrics.cacheHitRate)); // Penalty for low cache hit rate
    healthScore -= Math.max(0, (memoryMB - 10) * 2); // Penalty for high memory usage
    healthScore = Math.max(0, Math.min(100, healthScore));
    
    if (insights.length === 0) {
      insights.push('Performance metrics look healthy');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('No immediate optimizations needed');
    }
    
    return {
      insights,
      recommendations,
      metrics,
      healthScore: Math.round(healthScore)
    };
  }

  /**
   * Auto-optimize performance based on current metrics
   */
  autoOptimize(): {
    actionsPerformed: string[];
    performanceImprovement: {
      before: PerformanceMetrics;
      after: PerformanceMetrics;
    };
  } {
    const beforeMetrics = this.getPerformanceMetrics();
    const actionsPerformed: string[] = [];
    
    // Auto-optimize cache if needed
    if (beforeMetrics.cacheSize > this.MAX_CACHE_SIZE * 0.8) {
      this.optimizeCaches();
      actionsPerformed.push('Optimized caches');
    }
    
    // Preload selectors if cache hit rate is low
    if (beforeMetrics.cacheHitRate < 50) {
      this.preloadSelectors();
      actionsPerformed.push('Preloaded common selectors');
    }
    
    // Warmup cache if it's mostly empty
    if (beforeMetrics.cacheSize < 5) {
      this.warmupCache();
      actionsPerformed.push('Warmed up cache with common patterns');
    }
    
    const afterMetrics = this.getPerformanceMetrics();
    
    if (actionsPerformed.length === 0) {
      actionsPerformed.push('No optimization needed');
    }
    
    return {
      actionsPerformed,
      performanceImprovement: {
        before: beforeMetrics,
        after: afterMetrics
      }
    };
  }

  /**
   * Get cache statistics
   */
  getCacheStatistics(): {
    detectionCacheSize: number;
    selectorCacheSize: number;
    oldestEntry: string | null;
    newestEntry: string | null;
    memoryEstimate: number;
  } {
    const detectionEntries = Array.from(this.detectionCache.entries());
    const oldestEntry = detectionEntries.length > 0 
      ? detectionEntries.reduce((oldest, [key, entry]) => 
          entry.timestamp < oldest.timestamp ? { key, timestamp: entry.timestamp } : oldest,
          { key: detectionEntries[0][0], timestamp: detectionEntries[0][1].timestamp }
        ).key
      : null;
    
    const newestEntry = detectionEntries.length > 0
      ? detectionEntries.reduce((newest, [key, entry]) => 
          entry.timestamp > newest.timestamp ? { key, timestamp: entry.timestamp } : newest,
          { key: detectionEntries[0][0], timestamp: detectionEntries[0][1].timestamp }
        ).key
      : null;
    
    return {
      detectionCacheSize: this.detectionCache.size,
      selectorCacheSize: this.selectorCache.size,
      oldestEntry,
      newestEntry,
      memoryEstimate: this.getMemoryUsage()
    };
  }

  /**
   * Optimize caches by removing least recently used entries and compacting data
   */
  optimizeCaches(): {
    optimizationTime: number;
    removedDetectionEntries: number;
    removedSelectorEntries: number;
    memoryFreed: number;
    cacheEfficiency: number;
  } {
    const startTime = Date.now();
    const initialDetectionSize = this.detectionCache.size;
    const initialSelectorSize = this.selectorCache.size;
    const initialMemory = this.getMemoryUsage();
    
    // Remove expired entries first
    this.cleanupExpiredCache();
    
    // If still over limit, remove least recently used entries
    if (this.detectionCache.size > this.MAX_CACHE_SIZE * 0.8) {
      const targetSize = Math.floor(this.MAX_CACHE_SIZE * 0.6);
      const entriesToRemove = this.detectionCache.size - targetSize;
      
      // Sort by timestamp (LRU) and performance score
      const sortedEntries = Array.from(this.detectionCache.entries())
        .sort(([,a], [,b]) => {
          // Prioritize keeping high-confidence, recent entries
          const scoreA = a.timestamp + (a.result.confidence * 10000);
          const scoreB = b.timestamp + (b.result.confidence * 10000);
          return scoreA - scoreB;
        });
      
      for (let i = 0; i < entriesToRemove; i++) {
        const [key] = sortedEntries[i];
        this.detectionCache.delete(key);
        this.selectorCache.delete(key);
        this.cacheEvictions++;
      }
    }
    
    // Compact performance metrics by removing duplicates and old entries
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    this.performanceMetrics = this.performanceMetrics.filter(metric => 
      (metric.timestamp || Date.now()) > oneHourAgo
    );
    
    const optimizationTime = Date.now() - startTime;
    const removedDetection = initialDetectionSize - this.detectionCache.size;
    const removedSelector = initialSelectorSize - this.selectorCache.size;
    const finalMemory = this.getMemoryUsage();
    const memoryFreed = initialMemory - finalMemory;
    
    // Calculate cache efficiency
    const cacheEfficiency = this.totalCacheRequests > 0 ? 
      (this.cacheHits / this.totalCacheRequests) * 100 : 0;
    
    this.log(`Cache optimization completed in ${optimizationTime}ms:`);
    this.log(`  Removed: ${removedDetection} detection entries, ${removedSelector} selector entries`);
    this.log(`  Memory freed: ${this.formatBytes(memoryFreed)}`);
    this.log(`  Cache efficiency: ${cacheEfficiency.toFixed(1)}%`);
    
    return {
      optimizationTime,
      removedDetectionEntries: removedDetection,
      removedSelectorEntries: removedSelector,
      memoryFreed,
      cacheEfficiency
    };
  }

  /**
   * Generate adaptive selectors based on page analysis with caching
   */
  async generateAdaptiveSelectors(page: Page): Promise<SelectorSet> {
    const startTime = Date.now();
    
    try {
      // Get URL for caching
      const url = await page.url();
      const cacheKey = `adaptive-selectors-${this.simpleHash(url)}`;
      
      // Check cache first
      const cached = this.selectorCache.get(cacheKey);
      if (cached) {
        const cacheTime = Date.now() - startTime;
        this.debugLog(`Adaptive selector cache HIT in ${cacheTime}ms for ${url}`);
        return cached;
      }
      const pageAnalysis = await page.evaluate(() => {
        const analysis = {
          hasDataReviewId: document.querySelectorAll('[data-review-id]').length > 0,
          hasJsActionReview: document.querySelectorAll('[jsaction*="review"]').length > 0,
          hasRoleListitem: document.querySelectorAll('div[role="listitem"]').length > 0,
          hasFontBodyMedium: document.querySelectorAll('[class*="fontBodyMedium"]').length > 0,
          hasJftiEfClass: document.querySelectorAll('div[class*="jftiEf"]').length > 0,
          hasAriaLabelStar: document.querySelectorAll('[aria-label*="star" i]').length > 0,
          hasRoleImg: document.querySelectorAll('[role="img"]').length > 0,
          hasExpandableSection: document.querySelectorAll('[data-expandable-section]').length > 0,
          totalDivs: document.querySelectorAll('div').length,
          totalSpans: document.querySelectorAll('span').length
        };
        
        return analysis;
      });

      // Generate selectors based on what's actually present on the page
      const adaptiveSelectors: SelectorSet = {
        reviewsTab: ['[role="tab"]', 'button[jsaction*="tab"]'],
        reviewContainer: [],
        authorName: [],
        rating: [],
        reviewText: [],
        date: []
      };

      // Prioritize selectors based on page analysis
      if (pageAnalysis.hasDataReviewId) {
        adaptiveSelectors.reviewContainer.unshift('[data-review-id]');
      }
      if (pageAnalysis.hasJsActionReview) {
        adaptiveSelectors.reviewContainer.unshift('[jsaction*="review"]');
      }
      if (pageAnalysis.hasRoleListitem) {
        adaptiveSelectors.reviewContainer.unshift('div[role="listitem"]');
      }
      if (pageAnalysis.hasJftiEfClass) {
        adaptiveSelectors.reviewContainer.unshift('div[class*="jftiEf"]');
      }

      // Add author selectors based on page structure
      if (pageAnalysis.hasFontBodyMedium) {
        adaptiveSelectors.authorName.unshift('span[class*="fontBodyMedium"]:first-child');
        adaptiveSelectors.reviewText.unshift('span[class*="fontBodyMedium"]');
      }

      // Add rating selectors based on available elements
      if (pageAnalysis.hasAriaLabelStar) {
        adaptiveSelectors.rating.unshift('[aria-label*="star" i]');
      }
      if (pageAnalysis.hasRoleImg) {
        adaptiveSelectors.rating.unshift('[role="img"][aria-label]');
      }

      // Add text selectors based on page structure
      if (pageAnalysis.hasExpandableSection) {
        adaptiveSelectors.reviewText.unshift('div[data-expandable-section]');
      }

      // Add fallback selectors
      adaptiveSelectors.reviewContainer.push(...this.multilingualSelectors.generic.reviewContainer);
      adaptiveSelectors.authorName.push(...this.multilingualSelectors.generic.authorName);
      adaptiveSelectors.rating.push(...this.multilingualSelectors.generic.rating);
      adaptiveSelectors.reviewText.push(...this.multilingualSelectors.generic.reviewText);
      adaptiveSelectors.date.push(...this.multilingualSelectors.generic.date);

      // Remove duplicates
      Object.keys(adaptiveSelectors).forEach(key => {
        const selectorKey = key as keyof SelectorSet;
        adaptiveSelectors[selectorKey] = [...new Set(adaptiveSelectors[selectorKey])];
      });

      // Cache the adaptive selectors
      this.selectorCache.set(cacheKey, adaptiveSelectors);
      
      const generationTime = Date.now() - startTime;
      const totalSelectors = Object.values(adaptiveSelectors).flat().length;
      
      this.debugLog(`Generated and cached ${totalSelectors} adaptive selectors in ${generationTime}ms based on page analysis`);
      this.debugLog(`Page analysis: ${JSON.stringify(pageAnalysis, null, 2)}`);
      
      return adaptiveSelectors;

    } catch (error) {
      this.debugLog(`Adaptive selector generation failed: ${error}`);
      return this.createUniversalSelectors();
    }
  }

  /**
   * Create comprehensive multilingual debug information
   */
  async createMultilingualDebugInfo(
    page: Page, 
    languageDetection: LanguageDetectionResult,
    attemptedSelectors: string[] = [],
    successfulSelectors: string[] = [],
    extractionStrategy: string = 'unknown',
    fallbacksUsed: string[] = [],
    finalExtractionCount: number = 0,
    errorCategory?: 'language-specific' | 'general' | 'network' | 'timeout' | 'selector-failure'
  ): Promise<MultilingualDebugInfo> {
    try {
      const url = page.url();
      const pageInfo = await page.evaluate(() => ({
        title: document.title,
        hasStarElements: document.querySelectorAll('[aria-label*="star" i]').length,
        hasRatingElements: document.querySelectorAll('[aria-label*="rating" i]').length,
        hasReviewElements: document.querySelectorAll('[class*="review"]').length,
        totalDivs: document.querySelectorAll('div').length,
        totalSpans: document.querySelectorAll('span').length
      }));

      const debugInfo: MultilingualDebugInfo = {
        originalUrl: url,
        detectedLanguage: languageDetection.language,
        languageConfidence: languageDetection.confidence,
        isRTL: languageDetection.isRTL,
        detectedElements: languageDetection.detectedElements,
        attemptedSelectors,
        successfulSelectors,
        extractionStrategy,
        fallbacksUsed,
        finalExtractionCount,
        errorCategory,
        timestamp: new Date().toISOString(),
        pageInfo
      };

      // Log comprehensive debug information
      this.debugLog(`Multilingual debug info created: ${JSON.stringify(debugInfo, null, 2)}`);
      
      return debugInfo;
    } catch (error) {
      this.debugLog(`Error creating multilingual debug info: ${error}`);
      
      // Return minimal debug info on error
      return {
        originalUrl: page.url(),
        detectedLanguage: languageDetection.language,
        languageConfidence: languageDetection.confidence,
        isRTL: languageDetection.isRTL,
        detectedElements: languageDetection.detectedElements,
        attemptedSelectors,
        successfulSelectors,
        extractionStrategy,
        fallbacksUsed,
        finalExtractionCount,
        errorCategory,
        timestamp: new Date().toISOString(),
        pageInfo: {
          title: 'unknown',
          hasStarElements: 0,
          hasRatingElements: 0,
          hasReviewElements: 0,
          totalDivs: 0,
          totalSpans: 0
        }
      };
    }
  }

  /**
   * Categorize errors for multilingual scenarios with enhanced analysis
   */
  categorizeMultilingualError(
    error: Error, 
    languageDetection?: LanguageDetectionResult,
    debugInfo?: MultilingualDebugInfo
  ): MultilingualError {
    let category: 'language-specific' | 'general' | 'network' | 'timeout' | 'selector-failure';
    let suggestedActions: string[] = [];

    const errorMessage = error.message.toLowerCase();

    // Enhanced error categorization with multilingual context
    if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
      category = 'timeout';
      suggestedActions = [
        'Retry the request with longer timeout (60+ seconds)',
        'Check internet connection stability',
        'Try again during off-peak hours'
      ];
      
      // Add language-specific timeout suggestions
      if (languageDetection && languageDetection.language !== 'english') {
        suggestedActions.push('Non-English pages may load slower - increase timeout');
        suggestedActions.push('Try forcing English language parameters to reduce load time');
      }
      
    } else if (errorMessage.includes('network') || errorMessage.includes('net::') || errorMessage.includes('connection')) {
      category = 'network';
      suggestedActions = [
        'Check internet connection',
        'Verify URL accessibility',
        'Try again after a few minutes',
        'Check if the URL is blocked by firewall or proxy'
      ];
      
    } else if (errorMessage.includes('selector') || errorMessage.includes('element not found') || errorMessage.includes('no reviews')) {
      category = 'selector-failure';
      
      // Enhanced selector failure analysis
      const hasLanguageContext = languageDetection && languageDetection.confidence > 0.3;
      const hasDebugInfo = debugInfo && debugInfo.attemptedSelectors.length > 0;
      
      if (hasLanguageContext && languageDetection!.language !== 'english') {
        // Language-specific selector failure
        suggestedActions = [
          `Language-specific selectors failed for ${languageDetection!.language}`,
          'Try forcing English language parameters (&hl=en)',
          'Use language-agnostic selectors as fallback',
          'Apply progressive fallback strategy'
        ];
        
        if (languageDetection!.confidence < 0.5) {
          suggestedActions.push('Low language confidence - consider generic extraction');
        }
        
      } else {
        // General selector failure
        suggestedActions = [
          'Try with different extraction strategy',
          'Use generic selectors as fallback',
          'Check if page structure has changed',
          'Apply broader selector patterns'
        ];
      }
      
      // Add debug-informed suggestions
      if (hasDebugInfo) {
        const successRate = debugInfo!.successfulSelectors.length / debugInfo!.attemptedSelectors.length;
        if (successRate < 0.1) {
          suggestedActions.push('Very low selector success rate - page structure may have changed significantly');
        } else if (successRate < 0.3) {
          suggestedActions.push('Low selector success rate - try alternative selector strategies');
        }
      }
      
    } else if (languageDetection && languageDetection.confidence < 0.5) {
      category = 'language-specific';
      
      suggestedActions = [
        `Low language detection confidence (${(languageDetection.confidence * 100).toFixed(1)}%)`,
        'Use generic selectors for low confidence detection',
        'Try multiple language-specific strategies',
        'Consider manual language specification'
      ];
      
      // Add specific suggestions based on detected language
      if (languageDetection.language === 'hebrew') {
        suggestedActions.push('Hebrew detection uncertain - try RTL-aware selectors');
        suggestedActions.push('Consider forcing English interface with URL parameters');
      }
      
    } else {
      category = 'general';
      suggestedActions = [
        'Check page accessibility and loading',
        'Verify URL format and validity',
        'Try again with different parameters',
        'Check if page requires authentication'
      ];
      
      // Add context-specific suggestions
      if (languageDetection) {
        suggestedActions.push(`Page language: ${languageDetection.language} (${(languageDetection.confidence * 100).toFixed(1)}% confidence)`);
      }
    }

    // Add debug information to suggestions if available
    if (debugInfo) {
      if (debugInfo.pageInfo.hasStarElements === 0 && debugInfo.pageInfo.hasRatingElements === 0) {
        suggestedActions.push('No rating elements found - page may not contain reviews');
      }
      
      if (debugInfo.pageInfo.hasReviewElements === 0) {
        suggestedActions.push('No review elements detected - verify this is a reviews page');
      }
      
      if (debugInfo.fallbacksUsed.length > 0) {
        suggestedActions.push(`Fallbacks attempted: ${debugInfo.fallbacksUsed.join(', ')}`);
      }
    }

    // Log the error categorization for debugging
    this.log(`Error categorized as: ${category}`);
    this.log(`Error context: ${languageDetection ? `${languageDetection.language} (${(languageDetection.confidence * 100).toFixed(1)}%)` : 'No language detection'}`);
    this.debugLog(`Suggested actions: ${suggestedActions.join('; ')}`);

    return {
      category,
      originalError: error.message,
      languageContext: languageDetection,
      debugInfo,
      suggestedActions
    };
  }

  /**
   * Log detailed language detection results and confidence scores
   */
  logLanguageDetectionDetails(result: LanguageDetectionResult): void {
    this.log(`=== Language Detection Results ===`);
    this.log(`Language: ${result.language}`);
    this.log(`Confidence: ${(result.confidence * 100).toFixed(1)}%`);
    this.log(`RTL: ${result.isRTL}`);
    this.log(`Elements detected: ${result.detectedElements.length}`);
    
    // Enhanced confidence interpretation with detailed scoring
    if (result.confidence >= 0.8) {
      this.log(`Confidence Level: HIGH - Using language-specific selectors`);
      this.log(`Strategy: Language-specific extraction with optimized selectors`);
    } else if (result.confidence >= 0.5) {
      this.log(`Confidence Level: MEDIUM - Using adaptive selectors with fallbacks`);
      this.log(`Strategy: Adaptive extraction with progressive fallbacks`);
    } else {
      this.log(`Confidence Level: LOW - Using generic selectors with broad fallbacks`);
      this.log(`Strategy: Generic extraction with comprehensive fallback chain`);
    }
    
    // Enhanced detected elements logging with categorization
    if (result.detectedElements.length > 0) {
      this.log(`Detection indicators found:`);
      result.detectedElements.forEach((element, index) => {
        this.log(`  ${index + 1}. ${element}`);
      });
    } else {
      this.log(`No specific language indicators found - using fallback detection`);
    }
    
    // Enhanced selector logging with detailed counts and priorities
    if (result.suggestedSelectors) {
      this.log(`Suggested selectors by category:`);
      Object.entries(result.suggestedSelectors).forEach(([category, selectors]) => {
        this.log(`  ${category}: ${selectors.length} selectors`);
        if (this.debugMode && selectors.length > 0) {
          this.debugLog(`    Top 3 ${category} selectors: ${selectors.slice(0, 3).join(', ')}`);
        }
      });
      
      const totalSelectors = Object.values(result.suggestedSelectors).reduce((sum, arr) => sum + arr.length, 0);
      this.log(`Total suggested selectors: ${totalSelectors}`);
    }
    
    // Log extraction strategy recommendations
    this.log(`Recommended extraction approach:`);
    if (result.confidence >= 0.8) {
      this.log(`  1. Use language-specific selectors first`);
      this.log(`  2. Apply language-specific text patterns`);
      this.log(`  3. Use generic fallbacks only if needed`);
    } else if (result.confidence >= 0.5) {
      this.log(`  1. Try language-specific selectors with fallbacks`);
      this.log(`  2. Use adaptive selector generation`);
      this.log(`  3. Apply progressive fallback strategies`);
    } else {
      this.log(`  1. Start with generic selectors`);
      this.log(`  2. Use broad fallback strategies`);
      this.log(`  3. Consider URL parameter forcing if available`);
    }
    
    this.log(`=== End Language Detection Results ===`);
  }

  /**
   * Log comprehensive multilingual debug information
   */
  logMultilingualDebugInfo(debugInfo: MultilingualDebugInfo): void {
    this.log(`=== Multilingual Debug Information ===`);
    this.log(`URL: ${debugInfo.originalUrl}`);
    this.log(`Timestamp: ${debugInfo.timestamp}`);
    this.log(`Language: ${debugInfo.detectedLanguage} (${(debugInfo.languageConfidence * 100).toFixed(1)}% confidence)`);
    this.log(`RTL: ${debugInfo.isRTL}`);
    this.log(`Extraction Strategy: ${debugInfo.extractionStrategy}`);
    
    // Log page analysis results
    this.log(`Page Analysis:`);
    this.log(`  Title: ${debugInfo.pageInfo.title}`);
    this.log(`  Star elements: ${debugInfo.pageInfo.hasStarElements}`);
    this.log(`  Rating elements: ${debugInfo.pageInfo.hasRatingElements}`);
    this.log(`  Review elements: ${debugInfo.pageInfo.hasReviewElements}`);
    this.log(`  Total divs: ${debugInfo.pageInfo.totalDivs}`);
    this.log(`  Total spans: ${debugInfo.pageInfo.totalSpans}`);
    
    // Log selector usage statistics
    this.log(`Selector Usage:`);
    this.log(`  Attempted: ${debugInfo.attemptedSelectors.length} selectors`);
    this.log(`  Successful: ${debugInfo.successfulSelectors.length} selectors`);
    this.log(`  Success rate: ${debugInfo.attemptedSelectors.length > 0 ? 
      ((debugInfo.successfulSelectors.length / debugInfo.attemptedSelectors.length) * 100).toFixed(1) : 0}%`);
    
    // Log fallback usage
    if (debugInfo.fallbacksUsed.length > 0) {
      this.log(`Fallbacks used: ${debugInfo.fallbacksUsed.join(', ')}`);
    } else {
      this.log(`No fallbacks required`);
    }
    
    // Log extraction results
    this.log(`Final extraction count: ${debugInfo.finalExtractionCount} reviews`);
    
    // Log error category if present
    if (debugInfo.errorCategory) {
      this.log(`Error category: ${debugInfo.errorCategory}`);
    }
    
    // Debug-level detailed information
    if (this.debugMode) {
      this.debugLog(`Detected elements: ${debugInfo.detectedElements.join(', ')}`);
      if (debugInfo.attemptedSelectors.length > 0) {
        this.debugLog(`Attempted selectors: ${debugInfo.attemptedSelectors.slice(0, 10).join(', ')}${debugInfo.attemptedSelectors.length > 10 ? '...' : ''}`);
      }
      if (debugInfo.successfulSelectors.length > 0) {
        this.debugLog(`Successful selectors: ${debugInfo.successfulSelectors.join(', ')}`);
      }
    }
    
    this.log(`=== End Multilingual Debug Information ===`);
  }

  /**
   * Calculate confidence score based on DOM element analysis
   */
  async calculateConfidenceScore(page: Page, detectedLanguage: string): Promise<number> {
    try {
      const selectors = this.getLanguageSpecificSelectors(detectedLanguage);
      
      const selectorTestResults = await page.evaluate((selectors) => {
        let totalSelectors = 0;
        let foundSelectors = 0;
        
        // Test each selector category
        Object.values(selectors).forEach(selectorArray => {
          selectorArray.forEach((selector: string) => {
            totalSelectors++;
            try {
              const elements = document.querySelectorAll(selector);
              if (elements.length > 0) {
                foundSelectors++;
              }
            } catch (error) {
              // Selector might be invalid, skip it
            }
          });
        });
        
        return { totalSelectors, foundSelectors };
      }, selectors);

      // Calculate confidence based on selector success rate
      const selectorConfidence = selectorTestResults.totalSelectors > 0 
        ? selectorTestResults.foundSelectors / selectorTestResults.totalSelectors 
        : 0;

      this.debugLog(`Selector confidence: ${selectorTestResults.foundSelectors}/${selectorTestResults.totalSelectors} = ${(selectorConfidence * 100).toFixed(1)}%`);
      
      return selectorConfidence;

    } catch (error) {
      this.debugLog(`Confidence calculation failed: ${error}`);
      return 0.5; // Default confidence
    }
  }

  /**
   * Detect RTL (Right-to-Left) language characteristics
   */
  async detectRTLCharacteristics(page: Page): Promise<{ isRTL: boolean; confidence: number; indicators: string[] }> {
    try {
      const rtlAnalysis = await page.evaluate(() => {
        const indicators: string[] = [];
        let rtlScore = 0;

        // Check for RTL direction attributes
        const rtlElements = document.querySelectorAll('[dir="rtl"]');
        if (rtlElements.length > 0) {
          rtlScore += 30;
          indicators.push(`${rtlElements.length} elements with dir="rtl"`);
        }

        // Check for RTL CSS styles
        const elementsWithRTLStyle = document.querySelectorAll('[style*="direction: rtl"]');
        if (elementsWithRTLStyle.length > 0) {
          rtlScore += 20;
          indicators.push(`${elementsWithRTLStyle.length} elements with RTL CSS`);
        }

        // Check for Hebrew Unicode characters
        const bodyText = document.body.textContent || '';
        const hebrewChars = (bodyText.match(/[\u0590-\u05FF]/g) || []).length;
        
        if (hebrewChars > 0) {
          rtlScore += Math.min(hebrewChars, 30);
          indicators.push(`${hebrewChars} Hebrew characters`);
        }

        // Check document direction
        const docDir = document.documentElement.dir;
        if (docDir === 'rtl') {
          rtlScore += 25;
          indicators.push('Document direction is RTL');
        }

        return { rtlScore, indicators };
      });

      const isRTL = rtlAnalysis.rtlScore > 20;
      const confidence = Math.min(rtlAnalysis.rtlScore / 100, 1);

      this.debugLog(`RTL detection: ${isRTL} (score: ${rtlAnalysis.rtlScore}, confidence: ${(confidence * 100).toFixed(1)}%)`);

      return {
        isRTL,
        confidence,
        indicators: rtlAnalysis.indicators
      };

    } catch (error) {
      this.debugLog(`RTL detection failed: ${error}`);
      return {
        isRTL: false,
        confidence: 0,
        indicators: ['detection-failed']
      };
    }
  }
}