import { Page } from 'puppeteer';

export interface InterfaceDetectionResult {
  interfaceType: 'mobile' | 'desktop';
  version: string;
  language: string;
  layoutPattern: 'standard' | 'compact' | 'minimal' | 'unknown';
  cssClassPattern: 'modern' | 'legacy' | 'hybrid' | 'unknown';
  confidence: number;
  detectionDetails: {
    viewport: { width: number; height: number };
    userAgent: string;
    hasTouch: boolean;
    cssClasses: string[];
    domStructure: {
      hasModernLayout: boolean;
      hasLegacyLayout: boolean;
      reviewContainerTypes: string[];
    };
  };
}

export interface AdaptiveSelectors {
  interfaceType: 'mobile' | 'desktop';
  version: string;
  selectors: {
    reviewContainer: string[];
    author: string[];
    rating: string[];
    text: string[];
    date: string[];
    reviewsTab: string[];
  };
  confidence: number;
}

export class InterfaceDetectionService {
  private debugMode: boolean = false;

  constructor(debugMode: boolean = false) {
    this.debugMode = debugMode;
  }

  async detectInterface(page: Page): Promise<InterfaceDetectionResult> {
    this.debugLog('Starting interface detection...');

    const detectionResult = await page.evaluate(() => {
      // Get viewport information
      const viewport = {
        width: window.innerWidth,
        height: window.innerHeight
      };

      // Get user agent
      const userAgent = navigator.userAgent;

      // Check for touch support
      const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

      // Analyze CSS classes in the document
      const cssClasses: string[] = [];
      const allElements = document.querySelectorAll('*');
      const classSet = new Set<string>();
      
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

      // Analyze DOM structure for Google Maps patterns
      const domStructure = {
        hasModernLayout: false,
        hasLegacyLayout: false,
        reviewContainerTypes: [] as string[]
      };

      // Check for modern Google Maps layout indicators
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

      // Check for legacy Google Maps layout indicators
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

      // Get page language
      const language = document.documentElement.lang || 
                     (document.querySelector('html')?.getAttribute('lang')) || 
                     'en';

      return {
        viewport,
        userAgent,
        hasTouch,
        cssClasses: cssClasses.slice(0, 100), // Limit to first 100 classes
        domStructure,
        language
      };
    });

    // Analyze the collected data to determine interface type
    const interfaceType = this.determineInterfaceType(detectionResult);
    const version = this.determineVersion(detectionResult);
    const layoutPattern = this.determineLayoutPattern(detectionResult);
    const cssClassPattern = this.determineCssClassPattern(detectionResult);
    const confidence = this.calculateDetectionConfidence(detectionResult, interfaceType, layoutPattern);

    const result: InterfaceDetectionResult = {
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

  async getAdaptiveSelectors(page: Page, interfaceResult?: InterfaceDetectionResult): Promise<AdaptiveSelectors> {
    const detection = interfaceResult || await this.detectInterface(page);
    
    this.debugLog(`Generating adaptive selectors for ${detection.interfaceType} interface (${detection.version})`);

    // Generate selectors based on detected interface
    const selectors = this.generateSelectorsForInterface(detection);
    
    return {
      interfaceType: detection.interfaceType,
      version: detection.version,
      selectors,
      confidence: detection.confidence
    };
  }

  private determineInterfaceType(detection: any): 'mobile' | 'desktop' {
    const { viewport, userAgent, hasTouch } = detection;

    // Check viewport size
    const isMobileViewport = viewport.width <= 768 || viewport.height <= 1024;
    
    // Check user agent for mobile indicators
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

    // Scoring system
    let mobileScore = 0;
    let desktopScore = 0;

    if (isMobileViewport) mobileScore += 2;
    else desktopScore += 2;

    if (isMobileUserAgent) mobileScore += 3;
    else desktopScore += 1;

    if (hasTouch) mobileScore += 1;
    else desktopScore += 1;

    // Check for mobile-specific CSS classes
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
    } else {
      return 'desktop'; // Default to desktop when scores are equal or desktop wins
    }
  }

  private determineVersion(detection: any): string {
    const { cssClasses, domStructure } = detection;

    // Check for version indicators in CSS classes
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

    // Determine version based on DOM structure
    if (domStructure.hasModernLayout && !domStructure.hasLegacyLayout) {
      return 'modern';
    } else if (domStructure.hasLegacyLayout && !domStructure.hasModernLayout) {
      return 'legacy';
    } else if (domStructure.hasModernLayout && domStructure.hasLegacyLayout) {
      return 'hybrid';
    } else {
      return 'unknown';
    }
  }

  private determineLayoutPattern(detection: any): 'standard' | 'compact' | 'minimal' | 'unknown' {
    const { viewport, domStructure } = detection;

    // Analyze layout based on viewport and DOM structure
    const isSmallViewport = viewport.width < 600 || viewport.height < 800;
    const hasMultipleContainerTypes = domStructure.reviewContainerTypes.length > 2;

    if (isSmallViewport) {
      return hasMultipleContainerTypes ? 'compact' : 'minimal';
    } else {
      return hasMultipleContainerTypes ? 'standard' : 'compact';
    }
  }

  private determineCssClassPattern(detection: any): 'modern' | 'legacy' | 'hybrid' | 'unknown' {
    const { cssClasses } = detection;

    let modernScore = 0;
    let legacyScore = 0;

    // Modern CSS patterns
    const modernPatterns = [
      /^[a-zA-Z]+[A-Z][a-zA-Z]*$/, // camelCase
      /^[a-z]+-[a-z]+(-[a-z]+)*$/, // kebab-case
      /fontBody/i,
      /jsaction/i,
      /data-/i
    ];

    // Legacy CSS patterns
    const legacyPatterns = [
      /^[a-z]+_[a-z]+(_[a-z]+)*$/, // snake_case
      /section-/i,
      /gws-/i,
      /review-item/i
    ];

    for (const cssClass of cssClasses.slice(0, 50)) { // Check first 50 classes
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
    } else if (ratio < 0.5) {
      return 'legacy';
    } else if (modernScore > 0 && legacyScore > 0) {
      return 'hybrid';
    } else {
      return 'unknown';
    }
  }

  private calculateDetectionConfidence(detection: any, interfaceType: string, layoutPattern: string): number {
    let confidence = 0.5; // Base confidence

    // Increase confidence based on clear indicators
    confidence += 0.2; // Always add confidence since we always determine a type
    if (layoutPattern !== 'unknown') confidence += 0.1;
    if (detection.domStructure.reviewContainerTypes.length > 0) confidence += 0.1;
    if (detection.language && detection.language !== 'en') confidence += 0.05;

    // Decrease confidence for ambiguous cases
    if (detection.domStructure.hasModernLayout && detection.domStructure.hasLegacyLayout) {
      confidence -= 0.1;
    }

    return Math.min(1.0, Math.max(0.1, confidence));
  }

  private generateSelectorsForInterface(detection: InterfaceDetectionResult): AdaptiveSelectors['selectors'] {
    const { interfaceType, version, cssClassPattern, layoutPattern } = detection;

    // Base selectors that work across interfaces
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

    // Mobile-specific adaptations
    if (interfaceType === 'mobile') {
      baseSelectors.reviewContainer.unshift(
        'div[class*="compact"]',
        'div[class*="mobile"]',
        '[data-mobile-review]'
      );
      
      baseSelectors.author.unshift(
        'div[class*="compact"] span:first-child',
        'div[class*="mobile-author"]'
      );

      baseSelectors.text.unshift(
        'div[class*="compact"] span:not(:first-child)',
        '[class*="mobile-text"]'
      );
    }

    // Desktop-specific adaptations
    if (interfaceType === 'desktop') {
      baseSelectors.reviewContainer.unshift(
        'div[class*="desktop"]',
        'div[class*="wide"]',
        '[data-desktop-review]'
      );
    }

    // Version-specific adaptations
    if (version === 'legacy') {
      baseSelectors.reviewContainer.unshift(
        '.section-review',
        '.review-item',
        '.gws-localreviews__google-review'
      );
      
      baseSelectors.author.unshift(
        '.section-review .author',
        '.review-item .author-name'
      );
      
      baseSelectors.rating.unshift(
        '.section-review .rating',
        '.review-item .stars'
      );
    }

    // CSS class pattern adaptations
    if (cssClassPattern === 'modern') {
      // Add modern selector patterns
      baseSelectors.reviewContainer.unshift(
        'div[class*="fontBodyMedium"]',
        'div[class*="reviewItem"]'
      );
    } else if (cssClassPattern === 'legacy') {
      // Add legacy selector patterns
      baseSelectors.reviewContainer.unshift(
        'div[class*="section_review"]',
        'div[class*="review_item"]'
      );
    }

    // Layout pattern adaptations
    if (layoutPattern === 'compact') {
      baseSelectors.reviewContainer.unshift(
        'div[class*="compact"]',
        'li[class*="compact"]'
      );
    } else if (layoutPattern === 'minimal') {
      baseSelectors.reviewContainer.unshift(
        'div[class*="minimal"]',
        'div[class*="simple"]'
      );
    }

    // Language-specific adaptations
    if (detection.language.startsWith('he')) {
      // Hebrew-specific selectors
      baseSelectors.rating.unshift(
        '[aria-label*="כוכב"]',
        '[title*="כוכב"]'
      );
      
      baseSelectors.date.unshift(
        'span:contains("לפני")'
      );
    } else if (detection.language.startsWith('ar')) {
      // Arabic-specific selectors
      baseSelectors.rating.unshift(
        '[aria-label*="نجمة"]',
        '[title*="نجمة"]'
      );
    }

    return baseSelectors;
  }

  private debugLog(message: string): void {
    if (this.debugMode) {
      console.log(`[InterfaceDetectionService] ${message}`);
    }
  }
}