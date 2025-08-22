export class InterfaceDetectionService {
    constructor(debugMode = false) {
        this.debugMode = false;
        this.debugMode = debugMode;
    }
    async detectInterface(page) {
        this.debugLog('Starting interface detection...');
        const detectionResult = await page.evaluate(() => {
            const viewport = {
                width: window.innerWidth,
                height: window.innerHeight
            };
            const userAgent = navigator.userAgent;
            const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
            const cssClasses = [];
            const allElements = document.querySelectorAll('*');
            const classSet = new Set();
            for (const element of allElements) {
                if (element.className && typeof element.className === 'string') {
                    const classes = element.className.split(/\s+/);
                    for (const cls of classes) {
                        if (cls.trim() && !classSet.has(cls)) {
                            classSet.add(cls);
                            cssClasses.push(cls);
                        }
                    }
                }
            }
            const domStructure = {
                hasModernLayout: false,
                hasLegacyLayout: false,
                reviewContainerTypes: []
            };
            const modernIndicators = [
                '[data-review-id]',
                '[jsaction*="review"]',
                'div[class*="fontBodyMedium"]',
                '[role="listitem"]',
                'div[class*="section-review"]'
            ];
            for (const selector of modernIndicators) {
                if (document.querySelector(selector)) {
                    domStructure.hasModernLayout = true;
                    domStructure.reviewContainerTypes.push(selector);
                }
            }
            const legacyIndicators = [
                '.section-review',
                '.review-item',
                '.gws-localreviews__google-review',
                '.section-listitem'
            ];
            for (const selector of legacyIndicators) {
                if (document.querySelector(selector)) {
                    domStructure.hasLegacyLayout = true;
                    domStructure.reviewContainerTypes.push(selector);
                }
            }
            const language = document.documentElement.lang ||
                (document.querySelector('html')?.getAttribute('lang')) ||
                'en';
            return {
                viewport,
                userAgent,
                hasTouch,
                cssClasses: cssClasses.slice(0, 100),
                domStructure,
                language
            };
        });
        const interfaceType = this.determineInterfaceType(detectionResult);
        const version = this.determineVersion(detectionResult);
        const layoutPattern = this.determineLayoutPattern(detectionResult);
        const cssClassPattern = this.determineCssClassPattern(detectionResult);
        const confidence = this.calculateDetectionConfidence(detectionResult, interfaceType, layoutPattern);
        const result = {
            interfaceType,
            version,
            language: detectionResult.language,
            layoutPattern,
            cssClassPattern,
            confidence,
            detectionDetails: detectionResult
        };
        this.debugLog(`Interface detected: ${interfaceType} (${version}) - Layout: ${layoutPattern} - Confidence: ${confidence.toFixed(2)}`);
        return result;
    }
    async getAdaptiveSelectors(page, interfaceResult) {
        const detection = interfaceResult || await this.detectInterface(page);
        this.debugLog(`Generating adaptive selectors for ${detection.interfaceType} interface (${detection.version})`);
        const selectors = this.generateSelectorsForInterface(detection);
        return {
            interfaceType: detection.interfaceType,
            version: detection.version,
            selectors,
            confidence: detection.confidence
        };
    }
    determineInterfaceType(detection) {
        const { viewport, userAgent, hasTouch } = detection;
        const isMobileViewport = viewport.width <= 768 || viewport.height <= 1024;
        const mobileUserAgentPatterns = [
            /Mobile/i,
            /Android/i,
            /iPhone/i,
            /iPad/i,
            /iPod/i,
            /BlackBerry/i,
            /Windows Phone/i
        ];
        const isMobileUserAgent = mobileUserAgentPatterns.some(pattern => pattern.test(userAgent));
        let mobileScore = 0;
        let desktopScore = 0;
        if (isMobileViewport)
            mobileScore += 2;
        else
            desktopScore += 2;
        if (isMobileUserAgent)
            mobileScore += 3;
        else
            desktopScore += 1;
        if (hasTouch)
            mobileScore += 1;
        else
            desktopScore += 1;
        const mobileCssPatterns = [
            /mobile/i,
            /touch/i,
            /compact/i,
            /small/i
        ];
        const desktopCssPatterns = [
            /desktop/i,
            /large/i,
            /wide/i,
            /full/i
        ];
        for (const cssClass of detection.cssClasses) {
            if (mobileCssPatterns.some(pattern => pattern.test(cssClass))) {
                mobileScore += 0.5;
            }
            if (desktopCssPatterns.some(pattern => pattern.test(cssClass))) {
                desktopScore += 0.5;
            }
        }
        if (mobileScore > desktopScore) {
            return 'mobile';
        }
        else {
            return 'desktop';
        }
    }
    determineVersion(detection) {
        const { cssClasses, domStructure } = detection;
        const versionPatterns = [
            { pattern: /v\d+/i, type: 'versioned' },
            { pattern: /new/i, type: 'new' },
            { pattern: /modern/i, type: 'modern' },
            { pattern: /legacy/i, type: 'legacy' },
            { pattern: /old/i, type: 'legacy' }
        ];
        for (const cssClass of cssClasses) {
            for (const { pattern, type } of versionPatterns) {
                if (pattern.test(cssClass)) {
                    return type;
                }
            }
        }
        if (domStructure.hasModernLayout && !domStructure.hasLegacyLayout) {
            return 'modern';
        }
        else if (domStructure.hasLegacyLayout && !domStructure.hasModernLayout) {
            return 'legacy';
        }
        else if (domStructure.hasModernLayout && domStructure.hasLegacyLayout) {
            return 'hybrid';
        }
        else {
            return 'unknown';
        }
    }
    determineLayoutPattern(detection) {
        const { viewport, domStructure } = detection;
        const isSmallViewport = viewport.width < 600 || viewport.height < 800;
        const hasMultipleContainerTypes = domStructure.reviewContainerTypes.length > 2;
        if (isSmallViewport) {
            return hasMultipleContainerTypes ? 'compact' : 'minimal';
        }
        else {
            return hasMultipleContainerTypes ? 'standard' : 'compact';
        }
    }
    determineCssClassPattern(detection) {
        const { cssClasses } = detection;
        let modernScore = 0;
        let legacyScore = 0;
        const modernPatterns = [
            /^[a-zA-Z]+[A-Z][a-zA-Z]*$/,
            /^[a-z]+-[a-z]+(-[a-z]+)*$/,
            /fontBody/i,
            /jsaction/i,
            /data-/i
        ];
        const legacyPatterns = [
            /^[a-z]+_[a-z]+(_[a-z]+)*$/,
            /section-/i,
            /gws-/i,
            /review-item/i
        ];
        for (const cssClass of cssClasses.slice(0, 50)) {
            if (modernPatterns.some(pattern => pattern.test(cssClass))) {
                modernScore++;
            }
            if (legacyPatterns.some(pattern => pattern.test(cssClass))) {
                legacyScore++;
            }
        }
        const ratio = modernScore / Math.max(legacyScore, 1);
        if (ratio > 2) {
            return 'modern';
        }
        else if (ratio < 0.5) {
            return 'legacy';
        }
        else if (modernScore > 0 && legacyScore > 0) {
            return 'hybrid';
        }
        else {
            return 'unknown';
        }
    }
    calculateDetectionConfidence(detection, interfaceType, layoutPattern) {
        let confidence = 0.5;
        confidence += 0.2;
        if (layoutPattern !== 'unknown')
            confidence += 0.1;
        if (detection.domStructure.reviewContainerTypes.length > 0)
            confidence += 0.1;
        if (detection.language && detection.language !== 'en')
            confidence += 0.05;
        if (detection.domStructure.hasModernLayout && detection.domStructure.hasLegacyLayout) {
            confidence -= 0.1;
        }
        return Math.min(1.0, Math.max(0.1, confidence));
    }
    generateSelectorsForInterface(detection) {
        const { interfaceType, version, cssClassPattern, layoutPattern } = detection;
        const baseSelectors = {
            reviewContainer: [
                '[data-review-id]',
                '[jsaction*="review"]',
                '[role="listitem"]'
            ],
            author: [
                '[class*="fontBodyMedium"] span:first-child',
                '[aria-label*="review"] span:first-child'
            ],
            rating: [
                '[aria-label*="star" i]',
                '[aria-label*="rating" i]',
                '[role="img"][aria-label*="star"]'
            ],
            text: [
                '[data-expandable-section]',
                'span[jsaction*="expand"]'
            ],
            date: [
                'span[class*="fontBodySmall"]',
                '[class*="date"]'
            ],
            reviewsTab: [
                '[role="tab"][aria-label*="review" i]',
                'button[aria-label*="review" i]'
            ]
        };
        if (interfaceType === 'mobile') {
            baseSelectors.reviewContainer.unshift('div[class*="compact"]', 'div[class*="mobile"]', '[data-mobile-review]');
            baseSelectors.author.unshift('div[class*="compact"] span:first-child', 'div[class*="mobile-author"]');
            baseSelectors.text.unshift('div[class*="compact"] span:not(:first-child)', '[class*="mobile-text"]');
        }
        if (interfaceType === 'desktop') {
            baseSelectors.reviewContainer.unshift('div[class*="desktop"]', 'div[class*="wide"]', '[data-desktop-review]');
        }
        if (version === 'legacy') {
            baseSelectors.reviewContainer.unshift('.section-review', '.review-item', '.gws-localreviews__google-review');
            baseSelectors.author.unshift('.section-review .author', '.review-item .author-name');
            baseSelectors.rating.unshift('.section-review .rating', '.review-item .stars');
        }
        if (cssClassPattern === 'modern') {
            baseSelectors.reviewContainer.unshift('div[class*="fontBodyMedium"]', 'div[class*="reviewItem"]');
        }
        else if (cssClassPattern === 'legacy') {
            baseSelectors.reviewContainer.unshift('div[class*="section_review"]', 'div[class*="review_item"]');
        }
        if (layoutPattern === 'compact') {
            baseSelectors.reviewContainer.unshift('div[class*="compact"]', 'li[class*="compact"]');
        }
        else if (layoutPattern === 'minimal') {
            baseSelectors.reviewContainer.unshift('div[class*="minimal"]', 'div[class*="simple"]');
        }
        if (detection.language.startsWith('he')) {
            baseSelectors.rating.unshift('[aria-label*="כוכב"]', '[title*="כוכב"]');
            baseSelectors.date.unshift('span:contains("לפני")');
        }
        else if (detection.language.startsWith('ar')) {
            baseSelectors.rating.unshift('[aria-label*="نجمة"]', '[title*="نجمة"]');
        }
        return baseSelectors;
    }
    debugLog(message) {
        if (this.debugMode) {
            console.log(`[InterfaceDetectionService] ${message}`);
        }
    }
}
//# sourceMappingURL=interfaceDetectionService.js.map