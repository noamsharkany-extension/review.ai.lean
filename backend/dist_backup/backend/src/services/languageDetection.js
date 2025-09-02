export class LanguageDetectionService {
    constructor(progressCallback, debugMode = false) {
        this.debugMode = false;
        this.detectionCache = new Map();
        this.selectorCache = new Map();
        this.CACHE_TTL = 5 * 60 * 1000;
        this.MAX_CACHE_SIZE = 100;
        this.SELECTOR_CACHE_TTL = 10 * 60 * 1000;
        this.performanceMetrics = [];
        this.MAX_PERFORMANCE_ENTRIES = 1000;
        this.cacheEvictions = 0;
        this.totalCacheRequests = 0;
        this.cacheHits = 0;
        this.selectorCacheHits = 0;
        this.selectorCacheRequests = 0;
        this.precomputedSelectors = new Map();
        this.selectorGenerationCache = new Map();
        this.languagePatterns = {
            hebrew: {
                unicodeRanges: [
                    /[\u0590-\u05FF]/g,
                    /[\uFB1D-\uFB4F]/g
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
        this.multilingualSelectors = {
            english: {
                reviewsTab: [
                    '[role="tab"][aria-label*="review" i]',
                    '[role="tab"][aria-label*="Review" i]',
                    'button[aria-label*="review" i]',
                    '[data-value="1"][role="tab"]',
                    'div[role="tab"]:contains("Reviews")',
                    '[jsaction*="tab"][aria-label*="review" i]',
                    '.section-tab[aria-label*="review" i]',
                    'button[data-tab-index="1"]'
                ],
                reviewContainer: [
                    '[data-review-id]',
                    '[jsaction*="review"]',
                    'div[role="listitem"]',
                    'div[class*="jftiEf"]',
                    'div[class*="fontBodyMedium"]',
                    'div[class*="review"]',
                    '[data-value*="review"]',
                    '[aria-label*="review" i]',
                    'div[role="list"] > div',
                    '.section-review-content',
                    '[jsaction*="pane.review"]'
                ],
                authorName: [
                    '[data-value*="name" i]',
                    '[aria-label*="name" i]',
                    'span[class*="fontBodyMedium"]:first-child',
                    'div[class*="fontBodyMedium"]:first-child',
                    '[class*="author"]',
                    '[class*="name"]',
                    'span:first-child',
                    'div:first-child span',
                    'div[jsaction] span:first-child',
                    '.section-review-author',
                    '[data-value*="reviewer"]'
                ],
                rating: [
                    '[aria-label*="star" i]',
                    '[aria-label*="rating" i]',
                    '[role="img"][aria-label*="star" i]',
                    '[title*="star" i]',
                    '[aria-label*="out of 5" i]',
                    '[aria-label*="5 stars" i]',
                    '[data-value*="rating"]',
                    'span[aria-label*="stars"]',
                    '.section-review-stars',
                    '[jsaction*="rating"]'
                ],
                reviewText: [
                    '[class*="review-text"]',
                    '[data-value*="review-text"]',
                    'span[class*="fontBodyMedium"]',
                    'div[class*="text"]',
                    '[class*="content"]',
                    'span[jsaction*="expand"]',
                    '.section-review-text',
                    'span[class*="fontBodySmall"]',
                    'div[data-expandable-section]'
                ],
                date: [
                    '[aria-label*="ago" i]',
                    '[data-value*="date"]',
                    'span:contains("ago")',
                    'span:contains("month")',
                    'span:contains("week")',
                    'span:contains("day")',
                    'span:contains("year")',
                    '.section-review-publish-date',
                    'span[class*="fontBodySmall"]:last-child'
                ]
            },
            hebrew: {
                reviewsTab: [
                    '[role="tab"][aria-label*="ביקורות"]',
                    '[role="tab"]:contains("ביקורות")',
                    'button[aria-label*="ביקורות"]',
                    '[data-value="1"][role="tab"]',
                    'div[role="tab"]:contains("ביקורות")',
                    '[jsaction*="tab"][aria-label*="ביקורות"]',
                    '.section-tab[aria-label*="ביקורות"]',
                    'button:contains("ביקורות")'
                ],
                reviewContainer: [
                    '[data-review-id]',
                    '[jsaction*="review"]',
                    'div[role="listitem"]',
                    'div[class*="jftiEf"]',
                    'div[class*="fontBodyMedium"]',
                    'div[dir="rtl"]',
                    'div[class*="review"]',
                    '[data-value*="review"]',
                    'div[role="list"] > div',
                    '[jsaction*="pane.review"]'
                ],
                authorName: [
                    '[data-value*="name" i]',
                    '[aria-label*="name" i]',
                    'span[class*="fontBodyMedium"]:first-child',
                    'div[class*="fontBodyMedium"]:first-child',
                    'span:first-child',
                    'div:first-child span',
                    '[class*="author"]',
                    'div[jsaction] span:first-child',
                    'div[dir="rtl"] span:first-child'
                ],
                rating: [
                    '[aria-label*="כוכבים"]',
                    '[aria-label*="כוכב"]',
                    '[role="img"][aria-label*="כוכב"]',
                    '[title*="כוכב"]',
                    '[aria-label*="star" i]',
                    '[aria-label*="rating" i]',
                    '[data-value*="rating"]',
                    '[aria-label*="מתוך 5"]',
                    'span[aria-label*="כוכבים"]'
                ],
                reviewText: [
                    '[class*="review-text"]',
                    '[data-value*="review-text"]',
                    'span[class*="fontBodyMedium"]',
                    'div[class*="text"]',
                    'div[dir="rtl"] span',
                    'span[jsaction*="expand"]',
                    'div[data-expandable-section]',
                    'span[class*="fontBodySmall"]'
                ],
                date: [
                    '[aria-label*="לפני"]',
                    'span:contains("לפני")',
                    'span:contains("חודש")',
                    'span:contains("שבוע")',
                    'span:contains("יום")',
                    'span:contains("שנה")',
                    '[data-value*="date"]',
                    'span[class*="fontBodySmall"]:last-child',
                    'div[dir="rtl"] span:last-child'
                ]
            },
            generic: {
                reviewsTab: [
                    '[role="tab"]',
                    '[data-tab-index="1"]',
                    'button[jsaction*="tab"]',
                    '[data-value="1"][role="tab"]',
                    '.section-tab',
                    'div[role="tablist"] > div:nth-child(2)',
                    'button[aria-selected="true"]',
                    '[jsaction*="pane.tab"]'
                ],
                reviewContainer: [
                    '[data-review-id]',
                    '[jsaction*="review"]',
                    'div[role="listitem"]',
                    'div[class*="jftiEf"]',
                    'div[class*="fontBodyMedium"]',
                    'div[class*="review"]',
                    '[data-value*="review"]',
                    'div[role="list"] > div',
                    '[jsaction*="pane.review"]',
                    'div[jsaction] div[jsaction]',
                    '.section-review-content'
                ],
                authorName: [
                    'span[class*="fontBodyMedium"]:first-child',
                    'div[class*="fontBodyMedium"]:first-child',
                    '[class*="author"]',
                    '[class*="name"]',
                    'span:first-child',
                    'div:first-child span',
                    'div[jsaction] span:first-child',
                    '[data-value*="name" i]',
                    '[aria-label*="name" i]'
                ],
                rating: [
                    '[aria-label*="star" i]',
                    '[aria-label*="rating" i]',
                    '[role="img"]',
                    '[data-value*="rating"]',
                    'span[aria-label]',
                    'div[aria-label]',
                    '[title*="star" i]',
                    '.section-review-stars',
                    '[jsaction*="rating"]'
                ],
                reviewText: [
                    'span[class*="fontBodyMedium"]',
                    '[class*="review-text"]',
                    'div[class*="text"]',
                    '[class*="content"]',
                    'span[jsaction*="expand"]',
                    'div[data-expandable-section]',
                    'span[class*="fontBodySmall"]',
                    'div > span',
                    '.section-review-text'
                ],
                date: [
                    'span:last-child',
                    '[data-value*="date"]',
                    'span[class*="fontBodySmall"]',
                    'span[class*="fontBodySmall"]:last-child',
                    'div:last-child span',
                    '.section-review-publish-date',
                    'span[aria-label*="ago" i]'
                ]
            }
        };
        this.progressCallback = progressCallback;
        this.debugMode = debugMode;
        this.initializePerformanceMonitoring();
        this.precomputeCommonSelectors();
    }
    initializePerformanceMonitoring() {
        setInterval(() => {
            if (this.performanceMetrics.length > this.MAX_PERFORMANCE_ENTRIES) {
                this.performanceMetrics = this.performanceMetrics.slice(-this.MAX_PERFORMANCE_ENTRIES / 2);
                this.debugLog(`Cleaned up performance metrics, keeping ${this.performanceMetrics.length} entries`);
            }
        }, 60000);
        setInterval(() => {
            this.cleanupExpiredCache();
        }, 15000);
        setInterval(() => {
            this.logPerformanceReport();
        }, 5 * 60 * 1000);
    }
    precomputeCommonSelectors() {
        this.debugLog('Precomputing common selector sets for performance optimization...');
        const commonLanguages = ['english', 'hebrew', 'generic'];
        commonLanguages.forEach(lang => {
            const selectors = this.generateOptimizedSelectors(lang);
            this.precomputedSelectors.set(lang, selectors);
            this.debugLog(`Precomputed ${Object.values(selectors).flat().length} selectors for ${lang}`);
        });
        this.debugLog(`Precomputed selectors for ${commonLanguages.length} languages`);
    }
    generateOptimizedSelectors(language) {
        const normalizedLang = language.toLowerCase();
        switch (normalizedLang) {
            case 'hebrew':
                return this.optimizeSelectors(this.multilingualSelectors.hebrew);
            case 'english':
                return this.optimizeSelectors(this.multilingualSelectors.english);
            default:
                return this.optimizeSelectors(this.multilingualSelectors.generic);
        }
    }
    optimizeSelectors(selectors) {
        const optimized = {
            reviewsTab: this.optimizeSelectorArray(selectors.reviewsTab),
            reviewContainer: this.optimizeSelectorArray(selectors.reviewContainer),
            authorName: this.optimizeSelectorArray(selectors.authorName),
            rating: this.optimizeSelectorArray(selectors.rating),
            reviewText: this.optimizeSelectorArray(selectors.reviewText),
            date: this.optimizeSelectorArray(selectors.date)
        };
        return optimized;
    }
    optimizeSelectorArray(selectors) {
        const unique = [...new Set(selectors)];
        return unique.sort((a, b) => {
            const aSpecificity = (a.match(/\[/g) || []).length + (a.match(/\./g) || []).length;
            const bSpecificity = (b.match(/\[/g) || []).length + (b.match(/\./g) || []).length;
            return bSpecificity - aSpecificity;
        });
    }
    logPerformanceReport() {
        if (this.performanceMetrics.length === 0)
            return;
        const metrics = this.getPerformanceMetrics();
        this.log('=== Language Detection Performance Report ===');
        this.log(`Total detections: ${metrics.totalDetections}`);
        this.log(`Average detection time: ${metrics.averageDetectionTime.toFixed(2)}ms`);
        this.log(`Cache hit rate: ${(metrics.cacheHitRate * 100).toFixed(1)}%`);
        this.log(`Selector cache hit rate: ${((this.selectorCacheHits / Math.max(this.selectorCacheRequests, 1)) * 100).toFixed(1)}%`);
        this.log(`Memory usage: ${this.formatBytes(metrics.memoryUsage)}`);
        this.log(`Cache size: ${metrics.cacheSize} entries`);
        this.log(`Selector cache size: ${metrics.selectorCacheSize} entries`);
        Object.entries(metrics.detectionsByLanguage).forEach(([lang, count]) => {
            const avgConfidence = metrics.averageConfidenceByLanguage[lang] || 0;
            this.log(`${lang}: ${count} detections, avg confidence: ${(avgConfidence * 100).toFixed(1)}%`);
        });
        if (metrics.cacheHitRate < 0.5) {
            this.log('⚠️  Low cache hit rate - consider increasing cache TTL or size');
        }
        if (metrics.averageDetectionTime > 1000) {
            this.log('⚠️  High average detection time - consider optimizing detection logic');
        }
        if (metrics.memoryUsage > 50 * 1024 * 1024) {
            this.log('⚠️  High memory usage - consider reducing cache sizes');
        }
        this.log('============================================');
    }
    generateCacheKey(url, pageContent) {
        if (pageContent) {
            const contentHash = this.simpleHash(pageContent.substring(0, 1000));
            return `${url}:${contentHash}`;
        }
        return url;
    }
    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(36);
    }
    cleanupExpiredCache() {
        const now = Date.now();
        let removedDetectionCount = 0;
        let removedSelectorCount = 0;
        for (const [key, entry] of this.detectionCache.entries()) {
            if (now - entry.timestamp > this.CACHE_TTL) {
                this.detectionCache.delete(key);
                removedDetectionCount++;
                this.cacheEvictions++;
            }
        }
        for (const [key, entry] of this.selectorGenerationCache.entries()) {
            if (now - entry.timestamp > this.SELECTOR_CACHE_TTL) {
                this.selectorGenerationCache.delete(key);
                removedSelectorCount++;
            }
        }
        for (const [key, _] of this.selectorCache.entries()) {
            if (!this.detectionCache.has(key) && !key.startsWith('lang-selectors-')) {
                this.selectorCache.delete(key);
                removedSelectorCount++;
            }
        }
        if (removedDetectionCount > 0 || removedSelectorCount > 0) {
            this.debugLog(`Cleaned up ${removedDetectionCount} detection cache entries and ${removedSelectorCount} selector cache entries`);
        }
        this.enforceMaxCacheSize();
    }
    enforceMaxCacheSize() {
        if (this.detectionCache.size > this.MAX_CACHE_SIZE) {
            const entriesToRemove = this.detectionCache.size - this.MAX_CACHE_SIZE;
            const sortedEntries = Array.from(this.detectionCache.entries())
                .sort(([, a], [, b]) => {
                const aScore = a.timestamp + (a.result.confidence * 60000);
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
        const maxSelectorCacheSize = this.MAX_CACHE_SIZE * 2;
        if (this.selectorCache.size > maxSelectorCacheSize) {
            const entriesToRemove = this.selectorCache.size - maxSelectorCacheSize;
            const selectorEntries = Array.from(this.selectorCache.keys());
            const nonLanguageEntries = selectorEntries.filter(key => !key.startsWith('lang-selectors-'));
            const toRemove = nonLanguageEntries.slice(0, entriesToRemove);
            toRemove.forEach(key => this.selectorCache.delete(key));
            this.debugLog(`Evicted ${toRemove.length} selector cache entries to maintain size limit`);
        }
    }
    getCachedDetection(cacheKey) {
        this.totalCacheRequests++;
        const entry = this.detectionCache.get(cacheKey);
        if (!entry)
            return null;
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
    cacheDetectionResult(cacheKey, result, url, performance) {
        const entry = {
            result,
            timestamp: Date.now(),
            url,
            performance
        };
        this.detectionCache.set(cacheKey, entry);
        if (result.suggestedSelectors) {
            this.selectorCache.set(cacheKey, result.suggestedSelectors);
        }
        this.enforceMaxCacheSize();
        this.debugLog(`Cached language detection result for ${url} (${result.language}, confidence: ${result.confidence})`);
    }
    recordPerformance(metrics) {
        const enhancedMetrics = {
            ...metrics,
            memoryUsage: this.getMemoryUsage(),
            timestamp: Date.now(),
            cacheSize: this.detectionCache.size,
            selectorCacheSize: this.selectorCache.size
        };
        this.performanceMetrics.push(enhancedMetrics);
        if (this.performanceMetrics.length > this.MAX_PERFORMANCE_ENTRIES) {
            this.performanceMetrics = this.performanceMetrics.slice(-this.MAX_PERFORMANCE_ENTRIES / 2);
        }
        const cacheHitRate = this.totalCacheRequests > 0 ? (this.cacheHits / this.totalCacheRequests * 100).toFixed(1) : '0.0';
        const selectorCacheHitRate = this.selectorCacheRequests > 0 ? (this.selectorCacheHits / this.selectorCacheRequests * 100).toFixed(1) : '0.0';
        this.debugLog(`Performance: detection=${metrics.detectionTime}ms, cache=${metrics.cacheHit ? 'HIT' : 'MISS'} (${cacheHitRate}%), selector_cache=${selectorCacheHitRate}%, selectors=${metrics.totalSelectors}, memory=${this.formatBytes(enhancedMetrics.memoryUsage || 0)}, cache_size=${enhancedMetrics.cacheSize}/${enhancedMetrics.selectorCacheSize}`);
    }
    getMemoryUsage() {
        try {
            if (typeof process !== 'undefined' && process.memoryUsage) {
                return process.memoryUsage().heapUsed;
            }
        }
        catch (error) {
        }
        let estimatedMemory = 0;
        for (const [key, entry] of this.detectionCache.entries()) {
            estimatedMemory += key.length * 2;
            estimatedMemory += JSON.stringify(entry).length * 2;
        }
        for (const [key, selectors] of this.selectorCache.entries()) {
            estimatedMemory += key.length * 2;
            estimatedMemory += JSON.stringify(selectors).length * 2;
        }
        estimatedMemory += this.performanceMetrics.length * 200;
        return estimatedMemory;
    }
    formatBytes(bytes) {
        if (bytes === 0)
            return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    getPerformanceMetrics() {
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
        const detectionsByLanguage = {};
        const confidenceByLanguage = {};
        this.performanceMetrics.forEach(metric => {
            detectionsByLanguage[metric.language] = (detectionsByLanguage[metric.language] || 0) + 1;
            if (!confidenceByLanguage[metric.language]) {
                confidenceByLanguage[metric.language] = [];
            }
            confidenceByLanguage[metric.language].push(metric.confidence);
        });
        const averageConfidenceByLanguage = {};
        Object.entries(confidenceByLanguage).forEach(([lang, confidences]) => {
            averageConfidenceByLanguage[lang] = confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
        });
        const slowestDetections = [...this.performanceMetrics]
            .sort((a, b) => b.detectionTime - a.detectionTime)
            .slice(0, 5)
            .map(m => ({
            url: m.url,
            language: m.language,
            detectionTime: m.detectionTime,
            timestamp: m.timestamp
        }));
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
    clearCaches() {
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
    warmUpCaches() {
        this.debugLog('Warming up caches with common selectors...');
        const commonLanguages = ['english', 'hebrew', 'generic'];
        commonLanguages.forEach(lang => {
            this.getLanguageSpecificSelectors(lang);
        });
        this.debugLog(`Cache warm-up complete for ${commonLanguages.length} languages`);
    }
    log(message) {
        console.log(`[LanguageDetection] ${message}`);
        this.progressCallback?.(message);
    }
    debugLog(message) {
        if (this.debugMode) {
            console.log(`[LanguageDetection Debug] ${message}`);
        }
    }
    async detectPageLanguage(page) {
        this.log('Starting comprehensive language detection...');
        const startTime = Date.now();
        try {
            const url = await page.url();
            const cacheKey = this.generateCacheKey(url);
            const cachedEntry = this.getCachedDetection(cacheKey);
            if (cachedEntry) {
                const cacheTime = Date.now() - startTime;
                this.log(`Language detection cache HIT for ${url} (${cachedEntry.result.language}, confidence: ${(cachedEntry.result.confidence * 100).toFixed(1)}%) in ${cacheTime}ms`);
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
            this.debugLog('Analyzing page DOM for language indicators...');
            const detectionResult = await page.evaluate(() => {
                const results = {
                    hebrew: { score: 0, elements: [] },
                    english: { score: 0, elements: [] }
                };
                const bodyText = document.body.textContent || '';
                const htmlLang = document.documentElement.lang || '';
                if (htmlLang.includes('he') || htmlLang.includes('iw')) {
                    results.hebrew.score += 30;
                    results.hebrew.elements.push(`html[lang="${htmlLang}"]`);
                }
                else if (htmlLang.includes('en')) {
                    results.english.score += 30;
                    results.english.elements.push(`html[lang="${htmlLang}"]`);
                }
                const hebrewUnicodeMatches = (bodyText.match(/[\u0590-\u05FF]/g) || []).length;
                if (hebrewUnicodeMatches > 0) {
                    results.hebrew.score += Math.min(hebrewUnicodeMatches * 2, 40);
                    results.hebrew.elements.push(`${hebrewUnicodeMatches} Hebrew characters`);
                }
                const hebrewWords = ['ממליץ מקומי', 'ביקורות', 'תמונות', 'כוכבים', 'כוכב', 'לפני'];
                hebrewWords.forEach(word => {
                    if (bodyText.includes(word)) {
                        results.hebrew.score += 15;
                        results.hebrew.elements.push(`Hebrew word: "${word}"`);
                    }
                });
                const englishWords = ['Local Guide', 'reviews', 'photos', 'stars', 'star', 'ago'];
                englishWords.forEach(word => {
                    if (bodyText.toLowerCase().includes(word.toLowerCase())) {
                        results.english.score += 10;
                        results.english.elements.push(`English word: "${word}"`);
                    }
                });
                const rtlElements = document.querySelectorAll('[dir="rtl"], [style*="direction: rtl"]');
                if (rtlElements.length > 0) {
                    results.hebrew.score += 20;
                    results.hebrew.elements.push(`${rtlElements.length} RTL elements`);
                }
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
            const languages = Object.entries(detectionResult);
            const sortedLanguages = languages.sort(([, a], [, b]) => b.score - a.score);
            const [detectedLang, langData] = sortedLanguages[0];
            const maxScore = Math.max(...languages.map(([, data]) => data.score));
            const confidence = maxScore > 0 ? Math.min(maxScore / 100, 1) : 0;
            const isRTL = detectedLang === 'hebrew';
            const suggestedSelectors = this.getLanguageSpecificSelectors(detectedLang);
            const result = {
                language: detectedLang,
                confidence,
                isRTL,
                detectedElements: langData.elements,
                suggestedSelectors
            };
            const detectionTime = Date.now() - startTime;
            const selectorGenerationStart = Date.now();
            this.log(`Language detected: ${detectedLang} (confidence: ${(confidence * 100).toFixed(1)}%, RTL: ${isRTL}) in ${detectionTime}ms`);
            this.log(`Detection elements found: ${langData.elements.length} indicators`);
            if (confidence >= 0.8) {
                this.log(`High confidence detection - using language-specific selectors`);
            }
            else if (confidence >= 0.5) {
                this.log(`Medium confidence detection - using adaptive selectors with fallbacks`);
            }
            else {
                this.log(`Low confidence detection - using generic selectors with broad fallbacks`);
            }
            this.debugLog(`Detected elements: ${JSON.stringify(langData.elements, null, 2)}`);
            this.debugLog(`Language scores: ${JSON.stringify(detectionResult, null, 2)}`);
            this.debugLog(`Suggested selectors count: ${Object.values(suggestedSelectors).flat().length}`);
            const selectorGenerationTime = Date.now() - selectorGenerationStart;
            const totalSelectors = Object.values(suggestedSelectors).flat().length;
            const performance = {
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
        }
        catch (error) {
            const detectionTime = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.log(`Language detection failed after ${detectionTime}ms: ${errorMessage}`);
            this.debugLog(`Language detection error details: ${JSON.stringify(error, null, 2)}`);
            this.log('Falling back to default English detection with generic selectors');
            const fallbackResult = {
                language: 'english',
                confidence: 0.3,
                isRTL: false,
                detectedElements: ['fallback-default', `error: ${errorMessage}`],
                suggestedSelectors: this.multilingualSelectors.generic
            };
            try {
                const url = await page.url();
                const cacheKey = this.generateCacheKey(url);
                const performance = {
                    detectionTime,
                    cacheHit: false,
                    selectorGenerationTime: 0,
                    totalSelectors: Object.values(this.multilingualSelectors.generic).flat().length,
                    timestamp: Date.now(),
                    url,
                    language: fallbackResult.language,
                    confidence: fallbackResult.confidence
                };
                const shortTTLEntry = {
                    result: fallbackResult,
                    timestamp: Date.now() - (this.CACHE_TTL - 60000),
                    url,
                    performance
                };
                this.detectionCache.set(cacheKey, shortTTLEntry);
                this.recordPerformance(performance);
            }
            catch (cacheError) {
                this.debugLog(`Failed to cache fallback result: ${cacheError}`);
            }
            return fallbackResult;
        }
    }
    isLanguageSupported(language) {
        return ['english', 'hebrew'].includes(language.toLowerCase());
    }
    getLanguageSpecificSelectors(language) {
        const normalizedLang = language.toLowerCase();
        const cacheKey = `lang-selectors-${normalizedLang}`;
        this.selectorCacheRequests++;
        const precomputed = this.precomputedSelectors.get(normalizedLang);
        if (precomputed) {
            this.selectorCacheHits++;
            this.debugLog(`Precomputed selector HIT for language: ${normalizedLang}`);
            return precomputed;
        }
        const cached = this.selectorCache.get(cacheKey);
        if (cached) {
            this.selectorCacheHits++;
            this.debugLog(`Selector cache HIT for language: ${normalizedLang}`);
            return cached;
        }
        const generationCached = this.selectorGenerationCache.get(cacheKey);
        if (generationCached && (Date.now() - generationCached.timestamp) < this.SELECTOR_CACHE_TTL) {
            this.selectorCacheHits++;
            this.debugLog(`Selector generation cache HIT for language: ${normalizedLang}`);
            return generationCached.selectors;
        }
        const startTime = Date.now();
        const selectors = this.generateOptimizedSelectors(normalizedLang);
        const generationTime = Date.now() - startTime;
        this.selectorCache.set(cacheKey, selectors);
        this.selectorGenerationCache.set(cacheKey, {
            selectors,
            timestamp: Date.now()
        });
        this.debugLog(`Generated and cached selectors for language: ${normalizedLang} (${Object.values(selectors).flat().length} total) in ${generationTime}ms`);
        return selectors;
    }
    getAllSelectors() {
        return this.multilingualSelectors;
    }
    generateDynamicSelectors(detectionResult) {
        const startTime = Date.now();
        const cacheKey = `dynamic-${detectionResult.language}-${detectionResult.confidence.toFixed(2)}-${detectionResult.detectedElements.join(',').substring(0, 50)}`;
        const cached = this.selectorCache.get(cacheKey);
        if (cached) {
            const cacheTime = Date.now() - startTime;
            this.debugLog(`Dynamic selector cache HIT in ${cacheTime}ms for ${detectionResult.language}`);
            return cached;
        }
        const baseSelectors = this.getLanguageSpecificSelectors(detectionResult.language);
        const dynamicSelectors = {
            reviewsTab: [...baseSelectors.reviewsTab],
            reviewContainer: [...baseSelectors.reviewContainer],
            authorName: [...baseSelectors.authorName],
            rating: [...baseSelectors.rating],
            reviewText: [...baseSelectors.reviewText],
            date: [...baseSelectors.date]
        };
        detectionResult.detectedElements.forEach(element => {
            if (element.includes('Hebrew')) {
                dynamicSelectors.rating.unshift('[aria-label*="כוכבים"]');
                dynamicSelectors.date.unshift('span:contains("לפני")');
            }
            else if (element.includes('RTL')) {
                dynamicSelectors.reviewContainer.unshift('div[dir="rtl"]');
                dynamicSelectors.authorName.unshift('div[dir="rtl"] span:first-child');
            }
        });
        if (detectionResult.confidence > 0.8) {
            this.prioritizeLanguageSpecificSelectors(dynamicSelectors, detectionResult.language);
        }
        else if (detectionResult.confidence < 0.5) {
            this.addGenericFallbackSelectors(dynamicSelectors);
        }
        this.selectorCache.set(cacheKey, dynamicSelectors);
        const generationTime = Date.now() - startTime;
        const totalSelectors = Object.values(dynamicSelectors).flat().length;
        this.debugLog(`Generated and cached ${totalSelectors} dynamic selectors for ${detectionResult.language} in ${generationTime}ms`);
        return dynamicSelectors;
    }
    prioritizeLanguageSpecificSelectors(selectors, language) {
        const languageSpecific = this.getLanguageSpecificSelectors(language);
        Object.keys(selectors).forEach(key => {
            const selectorKey = key;
            const specificSelectors = languageSpecific[selectorKey];
            const currentSelectors = selectors[selectorKey];
            const uniqueSelectors = [...new Set([...specificSelectors, ...currentSelectors])];
            selectors[selectorKey] = uniqueSelectors;
        });
    }
    addGenericFallbackSelectors(selectors) {
        const genericSelectors = this.multilingualSelectors.generic;
        Object.keys(selectors).forEach(key => {
            const selectorKey = key;
            const currentSelectors = selectors[selectorKey];
            const fallbackSelectors = genericSelectors[selectorKey];
            selectors[selectorKey] = [...currentSelectors, ...fallbackSelectors];
        });
    }
    generateVersionSpecificSelectors(version) {
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
    combineSelectors(...selectorSets) {
        const combined = {
            reviewsTab: [],
            reviewContainer: [],
            authorName: [],
            rating: [],
            reviewText: [],
            date: []
        };
        selectorSets.forEach(selectorSet => {
            Object.keys(combined).forEach(key => {
                const selectorKey = key;
                combined[selectorKey].push(...selectorSet[selectorKey]);
            });
        });
        Object.keys(combined).forEach(key => {
            const selectorKey = key;
            combined[selectorKey] = [...new Set(combined[selectorKey])];
        });
        return combined;
    }
    createUniversalSelectors() {
        const cacheKey = 'universal-selectors';
        const cached = this.selectorCache.get(cacheKey);
        if (cached) {
            this.debugLog('Universal selector cache HIT');
            return cached;
        }
        const selectors = {
            reviewsTab: [
                '[role="tab"][data-value="1"]',
                '[role="tab"]:nth-child(2)',
                'button[jsaction*="tab"]',
                '[data-tab-index="1"]',
                'div[role="tablist"] > div:nth-child(2)',
                'div[role="tablist"] > button:nth-child(2)',
                '[role="tab"]',
                'button[aria-selected="true"]'
            ],
            reviewContainer: [
                '[data-review-id]',
                'div[role="listitem"]',
                '[jsaction*="review"]',
                'div[class*="jftiEf"]',
                'div[class*="fontBodyMedium"]',
                'div[role="list"] > div',
                'div[jsaction] div[jsaction]',
                'div[class*="review"]',
                '[data-value*="review"]'
            ],
            authorName: [
                'span[class*="fontBodyMedium"]:first-child',
                'div[class*="fontBodyMedium"]:first-child',
                'span:first-child',
                'div:first-child span',
                'div[jsaction] span:first-child',
                '[class*="author"]',
                '[class*="name"]',
                '[data-value*="name" i]',
                '[aria-label*="name" i]'
            ],
            rating: [
                '[role="img"][aria-label]',
                'span[aria-label]',
                'div[aria-label]',
                '[aria-label*="star" i]',
                '[aria-label*="rating" i]',
                '[title*="star" i]',
                '[data-value*="rating"]',
                '[jsaction*="rating"]'
            ],
            reviewText: [
                'span[class*="fontBodyMedium"]',
                'div[class*="text"]',
                'span[jsaction*="expand"]',
                'div[data-expandable-section]',
                'div > span',
                'span[class*="fontBodySmall"]',
                '[class*="content"]',
                '[class*="review-text"]'
            ],
            date: [
                'span[class*="fontBodySmall"]:last-child',
                'span:last-child',
                'div:last-child span',
                '[data-value*="date"]',
                '[data-value*="time"]',
                'span[class*="fontBodySmall"]'
            ]
        };
        this.selectorCache.set(cacheKey, selectors);
        this.debugLog(`Cached universal selectors (${Object.values(selectors).flat().length} total)`);
        return selectors;
    }
    preloadSelectors() {
        const startTime = Date.now();
        let preloadedCount = 0;
        const supportedLanguages = ['english', 'hebrew'];
        supportedLanguages.forEach(language => {
            const cacheKey = `lang-selectors-${language}`;
            if (!this.selectorCache.has(cacheKey)) {
                const selectors = this.getLanguageSpecificSelectors(language);
                this.selectorCache.set(cacheKey, selectors);
                preloadedCount++;
            }
        });
        const universalKey = 'universal-selectors';
        if (!this.selectorCache.has(universalKey)) {
            const universalSelectors = this.createUniversalSelectors();
            this.selectorCache.set(universalKey, universalSelectors);
            preloadedCount++;
        }
        const preloadTime = Date.now() - startTime;
        this.log(`Preloaded ${preloadedCount} selector sets in ${preloadTime}ms`);
    }
    warmupCache(commonUrls = []) {
        const startTime = Date.now();
        const defaultPatterns = [
            'https://www.google.com/maps/place/',
            'https://maps.google.com/maps/place/',
            'https://www.google.co.il/maps/place/',
            'https://maps.google.co.il/maps/place/'
        ];
        const urlsToWarmup = commonUrls.length > 0 ? commonUrls : defaultPatterns;
        urlsToWarmup.forEach(url => {
            const cacheKey = this.generateCacheKey(url);
            const warmupResult = {
                language: url.includes('.co.il') ? 'hebrew' : 'english',
                confidence: 0.6,
                isRTL: url.includes('.co.il'),
                detectedElements: ['warmup-entry'],
                suggestedSelectors: this.getLanguageSpecificSelectors(url.includes('.co.il') ? 'hebrew' : 'english')
            };
            const warmupEntry = {
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
    getPerformanceInsights() {
        const metrics = this.getPerformanceMetrics();
        const insights = [];
        const recommendations = [];
        if (metrics.cacheHitRate < 30) {
            insights.push(`Low cache hit rate: ${metrics.cacheHitRate}%`);
            recommendations.push('Consider preloading common selectors or increasing cache TTL');
        }
        else if (metrics.cacheHitRate > 80) {
            insights.push(`Excellent cache hit rate: ${metrics.cacheHitRate}%`);
        }
        if (metrics.averageDetectionTime > 1000) {
            insights.push(`Slow average detection time: ${metrics.averageDetectionTime}ms`);
            recommendations.push('Consider optimizing language detection patterns or using more specific selectors');
        }
        else if (metrics.averageDetectionTime < 100) {
            insights.push(`Fast average detection time: ${metrics.averageDetectionTime}ms`);
        }
        const memoryMB = metrics.memoryUsage / (1024 * 1024);
        if (memoryMB > 50) {
            insights.push(`High memory usage: ${this.formatBytes(metrics.memoryUsage)}`);
            recommendations.push('Consider running cache optimization or reducing cache size limits');
        }
        if (metrics.cacheSize > this.MAX_CACHE_SIZE * 0.9) {
            insights.push(`Cache near capacity: ${metrics.cacheSize}/${this.MAX_CACHE_SIZE}`);
            recommendations.push('Run cache optimization to free up space');
        }
        const totalLanguageDetections = Object.values(metrics.detectionsByLanguage).reduce((sum, count) => sum + count, 0);
        if (totalLanguageDetections > 0) {
            const languageDistribution = Object.entries(metrics.detectionsByLanguage)
                .map(([lang, count]) => `${lang}: ${((count / totalLanguageDetections) * 100).toFixed(1)}%`)
                .join(', ');
            insights.push(`Language distribution: ${languageDistribution}`);
        }
        Object.entries(metrics.averageConfidenceByLanguage).forEach(([lang, confidence]) => {
            if (confidence < 0.5) {
                insights.push(`Low confidence for ${lang}: ${(confidence * 100).toFixed(1)}%`);
                recommendations.push(`Review ${lang} language detection patterns for better accuracy`);
            }
        });
        let healthScore = 100;
        healthScore -= Math.max(0, (1000 - metrics.averageDetectionTime) / 10);
        healthScore -= Math.max(0, (80 - metrics.cacheHitRate));
        healthScore -= Math.max(0, (memoryMB - 10) * 2);
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
    autoOptimize() {
        const beforeMetrics = this.getPerformanceMetrics();
        const actionsPerformed = [];
        if (beforeMetrics.cacheSize > this.MAX_CACHE_SIZE * 0.8) {
            this.optimizeCaches();
            actionsPerformed.push('Optimized caches');
        }
        if (beforeMetrics.cacheHitRate < 50) {
            this.preloadSelectors();
            actionsPerformed.push('Preloaded common selectors');
        }
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
    getCacheStatistics() {
        const detectionEntries = Array.from(this.detectionCache.entries());
        const oldestEntry = detectionEntries.length > 0
            ? detectionEntries.reduce((oldest, [key, entry]) => entry.timestamp < oldest.timestamp ? { key, timestamp: entry.timestamp } : oldest, { key: detectionEntries[0][0], timestamp: detectionEntries[0][1].timestamp }).key
            : null;
        const newestEntry = detectionEntries.length > 0
            ? detectionEntries.reduce((newest, [key, entry]) => entry.timestamp > newest.timestamp ? { key, timestamp: entry.timestamp } : newest, { key: detectionEntries[0][0], timestamp: detectionEntries[0][1].timestamp }).key
            : null;
        return {
            detectionCacheSize: this.detectionCache.size,
            selectorCacheSize: this.selectorCache.size,
            oldestEntry,
            newestEntry,
            memoryEstimate: this.getMemoryUsage()
        };
    }
    optimizeCaches() {
        const startTime = Date.now();
        const initialDetectionSize = this.detectionCache.size;
        const initialSelectorSize = this.selectorCache.size;
        const initialMemory = this.getMemoryUsage();
        this.cleanupExpiredCache();
        if (this.detectionCache.size > this.MAX_CACHE_SIZE * 0.8) {
            const targetSize = Math.floor(this.MAX_CACHE_SIZE * 0.6);
            const entriesToRemove = this.detectionCache.size - targetSize;
            const sortedEntries = Array.from(this.detectionCache.entries())
                .sort(([, a], [, b]) => {
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
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        this.performanceMetrics = this.performanceMetrics.filter(metric => (metric.timestamp || Date.now()) > oneHourAgo);
        const optimizationTime = Date.now() - startTime;
        const removedDetection = initialDetectionSize - this.detectionCache.size;
        const removedSelector = initialSelectorSize - this.selectorCache.size;
        const finalMemory = this.getMemoryUsage();
        const memoryFreed = initialMemory - finalMemory;
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
    async generateAdaptiveSelectors(page) {
        const startTime = Date.now();
        try {
            const url = await page.url();
            const cacheKey = `adaptive-selectors-${this.simpleHash(url)}`;
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
            const adaptiveSelectors = {
                reviewsTab: ['[role="tab"]', 'button[jsaction*="tab"]'],
                reviewContainer: [],
                authorName: [],
                rating: [],
                reviewText: [],
                date: []
            };
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
            if (pageAnalysis.hasFontBodyMedium) {
                adaptiveSelectors.authorName.unshift('span[class*="fontBodyMedium"]:first-child');
                adaptiveSelectors.reviewText.unshift('span[class*="fontBodyMedium"]');
            }
            if (pageAnalysis.hasAriaLabelStar) {
                adaptiveSelectors.rating.unshift('[aria-label*="star" i]');
            }
            if (pageAnalysis.hasRoleImg) {
                adaptiveSelectors.rating.unshift('[role="img"][aria-label]');
            }
            if (pageAnalysis.hasExpandableSection) {
                adaptiveSelectors.reviewText.unshift('div[data-expandable-section]');
            }
            adaptiveSelectors.reviewContainer.push(...this.multilingualSelectors.generic.reviewContainer);
            adaptiveSelectors.authorName.push(...this.multilingualSelectors.generic.authorName);
            adaptiveSelectors.rating.push(...this.multilingualSelectors.generic.rating);
            adaptiveSelectors.reviewText.push(...this.multilingualSelectors.generic.reviewText);
            adaptiveSelectors.date.push(...this.multilingualSelectors.generic.date);
            Object.keys(adaptiveSelectors).forEach(key => {
                const selectorKey = key;
                adaptiveSelectors[selectorKey] = [...new Set(adaptiveSelectors[selectorKey])];
            });
            this.selectorCache.set(cacheKey, adaptiveSelectors);
            const generationTime = Date.now() - startTime;
            const totalSelectors = Object.values(adaptiveSelectors).flat().length;
            this.debugLog(`Generated and cached ${totalSelectors} adaptive selectors in ${generationTime}ms based on page analysis`);
            this.debugLog(`Page analysis: ${JSON.stringify(pageAnalysis, null, 2)}`);
            return adaptiveSelectors;
        }
        catch (error) {
            this.debugLog(`Adaptive selector generation failed: ${error}`);
            return this.createUniversalSelectors();
        }
    }
    async createMultilingualDebugInfo(page, languageDetection, attemptedSelectors = [], successfulSelectors = [], extractionStrategy = 'unknown', fallbacksUsed = [], finalExtractionCount = 0, errorCategory) {
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
            const debugInfo = {
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
            this.debugLog(`Multilingual debug info created: ${JSON.stringify(debugInfo, null, 2)}`);
            return debugInfo;
        }
        catch (error) {
            this.debugLog(`Error creating multilingual debug info: ${error}`);
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
    categorizeMultilingualError(error, languageDetection, debugInfo) {
        let category;
        let suggestedActions = [];
        const errorMessage = error.message.toLowerCase();
        if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
            category = 'timeout';
            suggestedActions = [
                'Retry the request with longer timeout (60+ seconds)',
                'Check internet connection stability',
                'Try again during off-peak hours'
            ];
            if (languageDetection && languageDetection.language !== 'english') {
                suggestedActions.push('Non-English pages may load slower - increase timeout');
                suggestedActions.push('Try forcing English language parameters to reduce load time');
            }
        }
        else if (errorMessage.includes('network') || errorMessage.includes('net::') || errorMessage.includes('connection')) {
            category = 'network';
            suggestedActions = [
                'Check internet connection',
                'Verify URL accessibility',
                'Try again after a few minutes',
                'Check if the URL is blocked by firewall or proxy'
            ];
        }
        else if (errorMessage.includes('selector') || errorMessage.includes('element not found') || errorMessage.includes('no reviews')) {
            category = 'selector-failure';
            const hasLanguageContext = languageDetection && languageDetection.confidence > 0.3;
            const hasDebugInfo = debugInfo && debugInfo.attemptedSelectors.length > 0;
            if (hasLanguageContext && languageDetection.language !== 'english') {
                suggestedActions = [
                    `Language-specific selectors failed for ${languageDetection.language}`,
                    'Try forcing English language parameters (&hl=en)',
                    'Use language-agnostic selectors as fallback',
                    'Apply progressive fallback strategy'
                ];
                if (languageDetection.confidence < 0.5) {
                    suggestedActions.push('Low language confidence - consider generic extraction');
                }
            }
            else {
                suggestedActions = [
                    'Try with different extraction strategy',
                    'Use generic selectors as fallback',
                    'Check if page structure has changed',
                    'Apply broader selector patterns'
                ];
            }
            if (hasDebugInfo) {
                const successRate = debugInfo.successfulSelectors.length / debugInfo.attemptedSelectors.length;
                if (successRate < 0.1) {
                    suggestedActions.push('Very low selector success rate - page structure may have changed significantly');
                }
                else if (successRate < 0.3) {
                    suggestedActions.push('Low selector success rate - try alternative selector strategies');
                }
            }
        }
        else if (languageDetection && languageDetection.confidence < 0.5) {
            category = 'language-specific';
            suggestedActions = [
                `Low language detection confidence (${(languageDetection.confidence * 100).toFixed(1)}%)`,
                'Use generic selectors for low confidence detection',
                'Try multiple language-specific strategies',
                'Consider manual language specification'
            ];
            if (languageDetection.language === 'hebrew') {
                suggestedActions.push('Hebrew detection uncertain - try RTL-aware selectors');
                suggestedActions.push('Consider forcing English interface with URL parameters');
            }
        }
        else {
            category = 'general';
            suggestedActions = [
                'Check page accessibility and loading',
                'Verify URL format and validity',
                'Try again with different parameters',
                'Check if page requires authentication'
            ];
            if (languageDetection) {
                suggestedActions.push(`Page language: ${languageDetection.language} (${(languageDetection.confidence * 100).toFixed(1)}% confidence)`);
            }
        }
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
    logLanguageDetectionDetails(result) {
        this.log(`=== Language Detection Results ===`);
        this.log(`Language: ${result.language}`);
        this.log(`Confidence: ${(result.confidence * 100).toFixed(1)}%`);
        this.log(`RTL: ${result.isRTL}`);
        this.log(`Elements detected: ${result.detectedElements.length}`);
        if (result.confidence >= 0.8) {
            this.log(`Confidence Level: HIGH - Using language-specific selectors`);
            this.log(`Strategy: Language-specific extraction with optimized selectors`);
        }
        else if (result.confidence >= 0.5) {
            this.log(`Confidence Level: MEDIUM - Using adaptive selectors with fallbacks`);
            this.log(`Strategy: Adaptive extraction with progressive fallbacks`);
        }
        else {
            this.log(`Confidence Level: LOW - Using generic selectors with broad fallbacks`);
            this.log(`Strategy: Generic extraction with comprehensive fallback chain`);
        }
        if (result.detectedElements.length > 0) {
            this.log(`Detection indicators found:`);
            result.detectedElements.forEach((element, index) => {
                this.log(`  ${index + 1}. ${element}`);
            });
        }
        else {
            this.log(`No specific language indicators found - using fallback detection`);
        }
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
        this.log(`Recommended extraction approach:`);
        if (result.confidence >= 0.8) {
            this.log(`  1. Use language-specific selectors first`);
            this.log(`  2. Apply language-specific text patterns`);
            this.log(`  3. Use generic fallbacks only if needed`);
        }
        else if (result.confidence >= 0.5) {
            this.log(`  1. Try language-specific selectors with fallbacks`);
            this.log(`  2. Use adaptive selector generation`);
            this.log(`  3. Apply progressive fallback strategies`);
        }
        else {
            this.log(`  1. Start with generic selectors`);
            this.log(`  2. Use broad fallback strategies`);
            this.log(`  3. Consider URL parameter forcing if available`);
        }
        this.log(`=== End Language Detection Results ===`);
    }
    logMultilingualDebugInfo(debugInfo) {
        this.log(`=== Multilingual Debug Information ===`);
        this.log(`URL: ${debugInfo.originalUrl}`);
        this.log(`Timestamp: ${debugInfo.timestamp}`);
        this.log(`Language: ${debugInfo.detectedLanguage} (${(debugInfo.languageConfidence * 100).toFixed(1)}% confidence)`);
        this.log(`RTL: ${debugInfo.isRTL}`);
        this.log(`Extraction Strategy: ${debugInfo.extractionStrategy}`);
        this.log(`Page Analysis:`);
        this.log(`  Title: ${debugInfo.pageInfo.title}`);
        this.log(`  Star elements: ${debugInfo.pageInfo.hasStarElements}`);
        this.log(`  Rating elements: ${debugInfo.pageInfo.hasRatingElements}`);
        this.log(`  Review elements: ${debugInfo.pageInfo.hasReviewElements}`);
        this.log(`  Total divs: ${debugInfo.pageInfo.totalDivs}`);
        this.log(`  Total spans: ${debugInfo.pageInfo.totalSpans}`);
        this.log(`Selector Usage:`);
        this.log(`  Attempted: ${debugInfo.attemptedSelectors.length} selectors`);
        this.log(`  Successful: ${debugInfo.successfulSelectors.length} selectors`);
        this.log(`  Success rate: ${debugInfo.attemptedSelectors.length > 0 ?
            ((debugInfo.successfulSelectors.length / debugInfo.attemptedSelectors.length) * 100).toFixed(1) : 0}%`);
        if (debugInfo.fallbacksUsed.length > 0) {
            this.log(`Fallbacks used: ${debugInfo.fallbacksUsed.join(', ')}`);
        }
        else {
            this.log(`No fallbacks required`);
        }
        this.log(`Final extraction count: ${debugInfo.finalExtractionCount} reviews`);
        if (debugInfo.errorCategory) {
            this.log(`Error category: ${debugInfo.errorCategory}`);
        }
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
    async calculateConfidenceScore(page, detectedLanguage) {
        try {
            const selectors = this.getLanguageSpecificSelectors(detectedLanguage);
            const selectorTestResults = await page.evaluate((selectors) => {
                let totalSelectors = 0;
                let foundSelectors = 0;
                Object.values(selectors).forEach(selectorArray => {
                    selectorArray.forEach((selector) => {
                        totalSelectors++;
                        try {
                            const elements = document.querySelectorAll(selector);
                            if (elements.length > 0) {
                                foundSelectors++;
                            }
                        }
                        catch (error) {
                        }
                    });
                });
                return { totalSelectors, foundSelectors };
            }, selectors);
            const selectorConfidence = selectorTestResults.totalSelectors > 0
                ? selectorTestResults.foundSelectors / selectorTestResults.totalSelectors
                : 0;
            this.debugLog(`Selector confidence: ${selectorTestResults.foundSelectors}/${selectorTestResults.totalSelectors} = ${(selectorConfidence * 100).toFixed(1)}%`);
            return selectorConfidence;
        }
        catch (error) {
            this.debugLog(`Confidence calculation failed: ${error}`);
            return 0.5;
        }
    }
    async detectRTLCharacteristics(page) {
        try {
            const rtlAnalysis = await page.evaluate(() => {
                const indicators = [];
                let rtlScore = 0;
                const rtlElements = document.querySelectorAll('[dir="rtl"]');
                if (rtlElements.length > 0) {
                    rtlScore += 30;
                    indicators.push(`${rtlElements.length} elements with dir="rtl"`);
                }
                const elementsWithRTLStyle = document.querySelectorAll('[style*="direction: rtl"]');
                if (elementsWithRTLStyle.length > 0) {
                    rtlScore += 20;
                    indicators.push(`${elementsWithRTLStyle.length} elements with RTL CSS`);
                }
                const bodyText = document.body.textContent || '';
                const hebrewChars = (bodyText.match(/[\u0590-\u05FF]/g) || []).length;
                if (hebrewChars > 0) {
                    rtlScore += Math.min(hebrewChars, 30);
                    indicators.push(`${hebrewChars} Hebrew characters`);
                }
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
        }
        catch (error) {
            this.debugLog(`RTL detection failed: ${error}`);
            return {
                isRTL: false,
                confidence: 0,
                indicators: ['detection-failed']
            };
        }
    }
}
//# sourceMappingURL=languageDetection.js.map