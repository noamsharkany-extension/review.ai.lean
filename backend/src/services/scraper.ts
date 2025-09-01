import puppeteer, { Browser, Page } from 'puppeteer';
import { ReviewScraperService, RawReview } from '@shared/types';
import { validateGoogleMapsUrl } from '../utils/urlValidator.js';
import { createReviewId } from '../utils/reviewIdUtils.js';
import { LanguageDetectionService, LanguageDetectionResult, SelectorSet, MultilingualDebugInfo, MultilingualError } from './languageDetection.js';
import { ComprehensiveCollectionOrchestrator, ComprehensiveCollectionConfig, ComprehensiveCollectionResult } from './comprehensiveCollectionOrchestrator.js';
import { ReviewSortNavigationService } from './reviewSortNavigationService.js';
import { EnhancedPaginationEngine } from './enhancedPaginationEngine.js';
import { ReviewDeduplicationService } from './reviewDeduplicationService.js';

export class GoogleReviewScraperService implements ReviewScraperService {
  private browser: Browser | null = null;
  private progressCallback?: (message: string) => void;
  private debugMode: boolean = false;
  private languageDetectionService: LanguageDetectionService;
  private currentLanguageDetection?: LanguageDetectionResult;
  private multilingualDebugInfo?: MultilingualDebugInfo;
  private attemptedSelectors: string[] = [];
  private successfulSelectors: string[] = [];
  private fallbacksUsed: string[] = [];
  private selectorMetrics: Record<string, { attempts: number; successes: number; contexts: Set<string>; totalElements: number }> = {};
  
  private currentSessionId?: string;
  private sessionStartTime: number = 0;

  // Reliability framework components removed

  // Comprehensive collection components
  private comprehensiveCollectionOrchestrator: ComprehensiveCollectionOrchestrator;
  private reviewSortNavigationService: ReviewSortNavigationService;
  private enhancedPaginationEngine: EnhancedPaginationEngine;
  private reviewDeduplicationService: ReviewDeduplicationService;

  constructor(progressCallback?: (message: string) => void, debugMode: boolean = false) {
    this.progressCallback = progressCallback;
    this.debugMode = debugMode;
    this.languageDetectionService = new LanguageDetectionService(progressCallback, debugMode);
    // Monitoring service removed
    
    // Initialize reliability framework components
    // this.resourceLoadingMonitor = new GoogleMapsResourceLoadingMonitor(progressCallback, debugMode);
    // this.progressiveSelectorEngine = new ProgressiveSelectorEngine(debugMode);
    // this.domAnalysisService = new DOMAnalysisService(debugMode);

    // Initialize comprehensive collection components
    this.comprehensiveCollectionOrchestrator = new ComprehensiveCollectionOrchestrator(
      (sessionId, progress) => {
        this.progressCallback?.(`[${sessionId}] ${progress.currentPhase}: ${progress.phaseProgress.current}/${progress.phaseProgress.target} (${progress.overallProgress.percentage.toFixed(1)}%)`);
      },
      debugMode
    );
    this.reviewSortNavigationService = new ReviewSortNavigationService(progressCallback, debugMode);
    this.enhancedPaginationEngine = new EnhancedPaginationEngine(debugMode, progressCallback);
    this.reviewDeduplicationService = new ReviewDeduplicationService(debugMode);
  }

  protected log(message: string): void {
    console.log(`[Scraper] ${message}`);
    this.progressCallback?.(message);
  }

  private debugLog(message: string): void {
    if (this.debugMode) {
      console.log(`[Scraper Debug] ${message}`);
    }
  }

  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      try {
        this.log('Launching browser...');
        
        const browserPromise = puppeteer.launch({
          headless: false, // Enable visual debugging
          executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-extensions',
            '--disable-plugins',
            '--disable-default-apps',
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-background-networking',
            '--lang=en-US',
            '--accept-lang=en-US,en',
            `--user-data-dir=/tmp/chrome-english-profile-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            '--disable-translate',
            '--disable-features=Translate'
          ],
          defaultViewport: {
            width: 1366,
            height: 768
          },
          timeout: 45000
        });

        const timeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Browser launch timeout after 45 seconds')), 45000)
        );

        this.browser = await Promise.race([browserPromise, timeoutPromise]);
        this.log('Browser launched successfully');
        
        // Set browser to English language
        const page = await this.browser.newPage();
        await page.setExtraHTTPHeaders({
          'Accept-Language': 'en-US,en;q=0.9'
        });
        await page.close();

        this.browser.on('disconnected', () => {
          this.log('Browser disconnected unexpectedly');
          this.browser = null;
        });

      } catch (error) {
        this.log(`Failed to launch browser: ${error instanceof Error ? error.message : 'Unknown error'}`);
        throw new Error(`Failed to launch browser: ${error instanceof Error ? error.message : 'Unknown error'}. This may be due to system configuration issues with Chrome/Chromium.`);
      }
    }
    return this.browser;
  }

  private async setupPageStreamlined(page: Page): Promise<void> {
    this.log('Setting up streamlined page configuration with English locale...');
    
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Set comprehensive language preferences for English
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9,en-GB;q=0.8',
      'Accept-Charset': 'utf-8',
      'Cache-Control': 'no-cache'
    });
    
    // Set viewport locale and timezone to US/English + prevent new tabs
    await page.evaluateOnNewDocument(() => {
      // Override navigator language properties
      Object.defineProperty(navigator, 'language', {
        get: function() { return 'en-US'; }
      });
      Object.defineProperty(navigator, 'languages', {
        get: function() { return ['en-US', 'en']; }
      });
      
      // Set locale formatting
      if (typeof Intl !== 'undefined') {
        const originalDateTimeFormat = Intl.DateTimeFormat;
        Intl.DateTimeFormat = function(locale, options) {
          return new originalDateTimeFormat('en-US', options);
        } as any;
      }
      
      // Comprehensive navigation protection - block ALL new tabs/windows during scraping
      const originalWindowOpen = window.open;
      window.open = function(url, target, features) {
        console.log(`[SCRAPER] BLOCKED window.open attempt to: ${url}`);
        return null; // Block ALL new window attempts during scraping
      };
      
      // Override location changes that could cause navigation
      const originalSetLocation = Object.getOwnPropertyDescriptor(Location.prototype, 'href') || {};
      Object.defineProperty(location, 'href', {
        get: originalSetLocation.get,
        set: function(value) {
          if (value && value.includes('/contrib/')) {
            console.log(`[SCRAPER] BLOCKED location.href change to contributor profile: ${value}`);
            return;
          }
          if (originalSetLocation.set) {
            originalSetLocation.set.call(this, value);
          }
        }
      });
      
      // Block ALL clicks that might cause navigation
      document.addEventListener('click', function(e) {
        const target = e.target as HTMLElement;
        const href = target.getAttribute('href') || target.getAttribute('data-href') || '';
        
        // Block contributor profile links
        if (href && href.includes('/contrib/')) {
          console.log(`[SCRAPER] BLOCKED click on contributor link: ${href}`);
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          return false;
        }
        
        // Block any clicks that might open new tabs/windows
        if (e.ctrlKey || e.metaKey || e.button === 1) {
          console.log(`[SCRAPER] BLOCKED new tab click attempt`);
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          return false;
        }
      }, true);
      
      // Block programmatic navigation attempts
      const originalAssign = location.assign;
      location.assign = function(url) {
        console.log(`[SCRAPER] BLOCKED location.assign to: ${url}`);
        return;
      };
      
      const originalReplace = location.replace;
      location.replace = function(url) {
        console.log(`[SCRAPER] BLOCKED location.replace to: ${url}`);
        return;
      };
      
    });
    
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(30000);

    page.on('pageerror', (error) => {
      this.debugLog(`Page error: ${error.message}`);
    });
  }

  private async navigateStreamlined(page: Page, url: string): Promise<void> {
    this.log('Using streamlined navigation with English locale...');
    
    try {
      // Force English language by adding hl=en parameter to Google Maps URLs
      let navigateUrl = url;
      if (url.includes('google.com/maps')) {
        const urlObj = new URL(url);
        urlObj.searchParams.set('hl', 'en'); // Force English language
        urlObj.searchParams.set('gl', 'US'); // Force US country/region
        navigateUrl = urlObj.toString();
        this.log(`Modified URL for English locale: ${navigateUrl}`);
      }
      
      await page.goto(navigateUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });
      
      this.log('Navigation completed successfully');
    } catch (error) {
      this.log(`Navigation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new Error(`Failed to navigate to page: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Main scraping method with adaptive strategy based on total review count
   */
  async scrapeReviews(googleUrl: string): Promise<RawReview[]> {
    this.log('🎯 Starting adaptive review extraction...');
    
    let page: Page | null = null;
    try {
      const browser = await this.getBrowser();
      page = await browser.newPage();
      await this.setupPageStreamlined(page);
      await this.navigateStreamlined(page, googleUrl);
      await page.waitForTimeout(2000);
      
      // Step 1: Click on Reviews tab to access all reviews
      this.log('📋 Step 1: Accessing Reviews tab...');
      await this.clickReviewsTab(page);
      await page.waitForTimeout(2000);
      
      // Step 2: Detect total number of reviews available
      this.log('🔢 Step 2: Detecting total review count...');
      const totalReviewCount = await this.detectTotalReviewCount(page);
      this.log(`📊 Detected approximately ${totalReviewCount} total reviews`);
      
      let allUniqueReviews: any[];
      
      // Choose strategy based on total review count
      if (totalReviewCount <= 300) {
        this.log('🎯 Using Strategy A: Extract all available reviews (≤300 total)');
        allUniqueReviews = await this.extractAllAvailableReviews(page);
        this.log(`🎉 Final result: ${allUniqueReviews.length} unique reviews using Strategy A (extract all)`);
      } else {
        this.log('🎯 Using Strategy B: Selective filtering - 100 newest + 100 lowest + 100 highest');
        allUniqueReviews = await this.extractWithSelectiveFiltering(page);
        this.log(`🎉 Final result: ${allUniqueReviews.length} unique reviews using Strategy B (selective filtering)`);
      }
      
      return allUniqueReviews;
      
    } catch (error) {
      this.log(`Scraping failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new Error(`Failed to extract reviews: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      if (page) {
        await page.close();
      }
    }
  }

  /**
   * Detect the total number of reviews available on the page
   */
  private async detectTotalReviewCount(page: Page): Promise<number> {
    const reviewCount = await page.evaluate(() => {
      // Try multiple selectors to find the review count
      const selectors = [
        // Look for text patterns like "1,863 reviews" or "1863 ביקורות"
        'button[jsaction*="moreReviews"]',
        'button:contains("reviews")',
        'button:contains("ביקורות")',
        '[aria-label*="reviews"]',
        '[aria-label*="ביקורות"]'
      ];
      
      for (const selector of selectors) {
        const elements = document.querySelectorAll('button');
        for (const element of elements) {
          const text = element.textContent || '';
          const ariaLabel = element.getAttribute('aria-label') || '';
          const jsaction = element.getAttribute('jsaction') || '';
          
          // Check if this looks like a reviews button with count
          if ((text.includes('reviews') || text.includes('ביקורת') || jsaction.includes('moreReviews')) &&
              (text.match(/[\d,]+/) || ariaLabel.match(/[\d,]+/))) {
            
            const fullText = text + ' ' + ariaLabel;
            const numberMatch = fullText.match(/([\d,]+)/);
            
            if (numberMatch) {
              const count = parseInt(numberMatch[1].replace(/,/g, ''));
              console.log(`[DETECT] Found review count: ${count} from text: "${fullText}"`);
              if (count > 0 && count < 100000) { // Sanity check
                return count;
              }
            }
          }
        }
      }
      
      console.log('[DETECT] Could not find review count, defaulting to 999');
      return 999; // Default to "many" if we can't detect
    });
    
    return reviewCount;
  }

  /**
   * Strategy A: Extract ALL available reviews (for businesses with ≤300 reviews)
   */
  private async extractAllAvailableReviews(page: Page): Promise<any[]> {
    this.log('📜 Extracting ALL available reviews...');
    
    let allReviews: any[] = [];
    let previousCount = 0;
    let stagnantRounds = 0;
    const maxStagnantRounds = 5; // Increased for more thorough extraction
    const maxScrollAttempts = 50; // Increased to handle larger volumes
    
    // Start with newest sort to ensure we get reviews in a good order
    await this.applySortFilter(page, 'newest');
    await page.waitForTimeout(3000);
    
    for (let attempt = 0; attempt < maxScrollAttempts; attempt++) {
      // Multiple scroll attempts to ensure we load everything
      for (let i = 0; i < 3; i++) {
        await this.performAggressiveScrolling(page);
        await page.waitForTimeout(800);
      }
      
      // Extract all currently visible reviews
      const currentReviews = await this.extractBasicReviews(page);
      
      // Merge with existing reviews and deduplicate
      const combinedReviews = [...allReviews, ...currentReviews];
      const deduplicationResult = this.reviewDeduplicationService.deduplicateReviews(combinedReviews);
      allReviews = deduplicationResult.uniqueReviews;
      
      this.log(`📊 Scroll ${attempt + 1}: Found ${allReviews.length} unique reviews (${deduplicationResult.duplicateCount} duplicates removed)`);
      
      // Check if we're getting new reviews
      if (allReviews.length === previousCount) {
        stagnantRounds++;
        this.log(`⚠️ No new reviews found (stagnant round ${stagnantRounds}/${maxStagnantRounds})`);
        
        if (stagnantRounds >= maxStagnantRounds) {
          this.log('✅ Reached end of reviews - no new reviews found in multiple attempts');
          break;
        }
      } else {
        stagnantRounds = 0; // Reset stagnant counter
        previousCount = allReviews.length;
      }
      
      // Safety check for reasonable limits
      if (allReviews.length > 500) {
        this.log('⚠️ Reached maximum safety limit (500), stopping extraction');
        break;
      }
    }
    
    this.log(`✅ Strategy A complete: Extracted ${allReviews.length} unique reviews`);
    return allReviews.map(r => ({ ...r, sortType: 'all' }));
  }

  /**
   * Strategy B: Selective filtering approach (100 newest + 100 lowest + 100 highest, then deduplicate)
   */
  private async extractWithSelectiveFiltering(page: Page): Promise<any[]> {
    this.log('🎯 Using selective filtering strategy: 100 newest + 100 lowest + 100 highest');
    
    const reviewCollections = {
      newest: [] as any[],
      lowest: [] as any[],
      highest: [] as any[]
    };
    
    // Step 1: Collect 100 NEWEST reviews
    this.log('🕐 Collecting 100 NEWEST reviews...');
    reviewCollections.newest = await this.collectReviewsBySort(page, 'newest', 100);
    this.log(`✅ Collected ${reviewCollections.newest.length} newest reviews`);
    
    // Step 2: Collect 100 LOWEST rated reviews  
    this.log('⭐ Collecting 100 LOWEST rated reviews...');
    reviewCollections.lowest = await this.collectReviewsBySort(page, 'lowest', 100);
    this.log(`✅ Collected ${reviewCollections.lowest.length} lowest rated reviews`);
    
    // Step 3: Collect 100 HIGHEST rated reviews
    this.log('🌟 Collecting 100 HIGHEST rated reviews...');
    reviewCollections.highest = await this.collectReviewsBySort(page, 'highest', 100);
    this.log(`✅ Collected ${reviewCollections.highest.length} highest rated reviews`);
    
    // Step 4: Combine all reviews and deduplicate
    this.log('🔍 Combining and deduplicating all reviews...');
    const allCombinedReviews = [
      ...reviewCollections.newest.map(r => ({ ...r, sortType: 'newest' })),
      ...reviewCollections.lowest.map(r => ({ ...r, sortType: 'lowest' })),
      ...reviewCollections.highest.map(r => ({ ...r, sortType: 'highest' }))
    ];
    
    // Use the deduplication service to remove duplicates
    const deduplicationResult = this.reviewDeduplicationService.deduplicateReviews(allCombinedReviews);
    const uniqueReviews = deduplicationResult.uniqueReviews;
    
    this.log(`✅ Strategy B complete:`);
    this.log(`   - Total collected: ${allCombinedReviews.length} reviews`);
    this.log(`   - Duplicates removed: ${deduplicationResult.duplicateCount}`);
    this.log(`   - Final unique reviews: ${uniqueReviews.length}`);
    this.log(`   - Newest: ${reviewCollections.newest.length}, Lowest: ${reviewCollections.lowest.length}, Highest: ${reviewCollections.highest.length}`);
    
    return uniqueReviews;
  }

  /**
   * Click on the reviews tab using our proven multi-lingual method
   */
  private async clickReviewsTab(page: Page): Promise<void> {
    const reviewsButtonClicked = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      for (const button of buttons) {
        const text = button.textContent?.trim() || '';
        const jsaction = button.getAttribute('jsaction') || '';
        
        // Check for English reviews button first
        if ((text.includes('reviews') || text.includes('Reviews')) && 
            jsaction.includes('moreReviews')) {
          (button as HTMLElement).click();
          return { success: true, text, language: 'english' };
        }
        // Check for Hebrew reviews button
        if ((text.includes('ביקורות')) && 
            jsaction.includes('moreReviews')) {
          (button as HTMLElement).click();
          return { success: true, text, language: 'hebrew' };
        }
        // Also check for numeric patterns (1,863 reviews)
        if ((text.includes('1,863') || text.includes('1863') || /\d+.*reviews?/i.test(text) || /\d+.*ביקורות/.test(text)) && 
            jsaction.includes('moreReviews')) {
          (button as HTMLElement).click();
          return { success: true, text, language: 'numeric' };
        }
      }
      return { success: false };
    });
    
    if (reviewsButtonClicked.success) {
      this.log(`Reviews panel opened: "${reviewsButtonClicked.text}" (${reviewsButtonClicked.language})`);
      // Wait for reviews panel content to fully load (matching working test scripts)
      await page.waitForTimeout(3000);
    } else {
      this.log('Could not open reviews panel');
    }
  }

  /**
   * Collect reviews by specific sort type with aggressive pagination
   */
  private async collectReviewsBySort(page: Page, sortType: 'newest' | 'lowest' | 'highest', target: number): Promise<any[]> {
    this.log(`🔄 Collecting ${target} ${sortType} reviews with aggressive pagination...`);
    
    try {
      // Apply the sort filter
      const sortApplied = await this.applySortFilter(page, sortType);
      if (!sortApplied) {
        this.log(`⚠️ Could not apply ${sortType} sort, using current order`);
      }
      
      // Wait for sort to take effect
      await page.waitForTimeout(4000);
      
      let collectedReviews: any[] = [];
      let previousCount = 0;
      let stagnantRounds = 0;
      const maxStagnantRounds = 5; // Increased patience for difficult collections
      const maxScrollAttempts = 40; // Much more aggressive scrolling
      
      this.log(`📜 Aggressively scrolling to load ${sortType} reviews (target: ${target})...`);
      for (let i = 0; i < maxScrollAttempts; i++) {
        // Multiple aggressive scroll attempts per round with more variety
        for (let j = 0; j < 5; j++) {
          await this.performAggressiveScrolling(page);
          await page.waitForTimeout(500);
        }
        
        // Additional wait for content to load
        await page.waitForTimeout(1000);
        
        // Extract reviews after scrolling
        const currentReviews = await this.extractBasicReviews(page);
        
        // Use deduplication to ensure we have unique reviews
        const combinedReviews = [...collectedReviews, ...currentReviews];
        const deduplicationResult = this.reviewDeduplicationService.deduplicateReviews(combinedReviews);
        collectedReviews = deduplicationResult.uniqueReviews;
        
        this.log(`${sortType} - Scroll ${i + 1}: Found ${collectedReviews.length} unique reviews (${deduplicationResult.duplicateCount} duplicates removed, raw: ${currentReviews.length})`);
        
        // Check if we're getting new reviews
        if (collectedReviews.length === previousCount) {
          stagnantRounds++;
          if (stagnantRounds >= maxStagnantRounds) {
            this.log(`⚠️ ${sortType} - No new reviews found in ${stagnantRounds} attempts, stopping at ${collectedReviews.length} reviews`);
            break;
          }
        } else {
          stagnantRounds = 0;
          previousCount = collectedReviews.length;
        }
        
        // If we have enough reviews, stop scrolling
        if (collectedReviews.length >= target) {
          this.log(`✅ ${sortType} - Reached target of ${target} reviews`);
          break;
        }
        
        // Show progress every 5 attempts when we're struggling
        if (i % 5 === 0 && i > 0) {
          this.log(`📊 ${sortType} progress: ${collectedReviews.length}/${target} reviews after ${i + 1} scroll attempts`);
        }
      }
      
      this.log(`📊 ${sortType} collection completed: ${collectedReviews.length} reviews (target was ${target})`);
      
      // Special handling for lowest rated - if we got very few, it might be because there aren't many negative reviews
      if (sortType === 'lowest' && collectedReviews.length < 10) {
        this.log(`ℹ️ Very few lowest rated reviews found (${collectedReviews.length}). This might indicate a business with mostly positive reviews.`);
        
        // Try collecting some medium-rated reviews instead by expanding our collection
        this.log(`🔄 Attempting to collect additional lower-rated reviews...`);
        
        // Try a different approach - scroll more aggressively
        for (let extraAttempt = 0; extraAttempt < 15; extraAttempt++) {
          await this.performAggressiveScrolling(page);
          await page.waitForTimeout(800);
          
          const moreReviews = await this.extractBasicReviews(page);
          const combinedReviews = [...collectedReviews, ...moreReviews];
          const deduplicationResult = this.reviewDeduplicationService.deduplicateReviews(combinedReviews);
          
          if (deduplicationResult.uniqueReviews.length > collectedReviews.length) {
            collectedReviews = deduplicationResult.uniqueReviews;
            this.log(`${sortType} - Extra attempt ${extraAttempt + 1}: Found ${collectedReviews.length} total reviews`);
            
            if (collectedReviews.length >= 20) { // Reasonable minimum
              break;
            }
          }
        }
      }
      
      return collectedReviews.slice(0, target); // Limit to target but return what we have
      
    } catch (error) {
      this.log(`❌ Error collecting ${sortType} reviews: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return [];
    }
  }

  /**
   * Scroll to top of reviews section before applying new sort
   */
  private async scrollToTopOfReviews(page: Page): Promise<void> {
    await page.evaluate(() => {
      // Try to scroll the reviews container to top
      const reviewsContainer = document.querySelector('.m6QErb') ||
                              document.querySelector('[role="main"]') ||
                              document.querySelector('.review-dialog-list') ||
                              document.querySelector('[class*="scroll"]');
      
      if (reviewsContainer) {
        reviewsContainer.scrollTop = 0;
        console.log('[DEBUG] Scrolled reviews container to top');
      }
      
      // Also scroll window to top
      window.scrollTo(0, 0);
      console.log('[DEBUG] Scrolled window to top');
    });
    
    await page.waitForTimeout(1000); // Wait for scroll to complete
  }

  /**
   * Apply sorting filter using our proven multi-lingual method with enhanced reliability
   */
  private async applySortFilter(page: Page, sortType: 'newest' | 'lowest' | 'highest'): Promise<boolean> {
    try {
      // First scroll to top to access sort dropdown
      await this.scrollToTopOfReviews(page);
      
      // Wait a bit more for UI to settle
      await page.waitForTimeout(2000);
      
      this.log(`🔄 Applying ${sortType} sort filter with enhanced detection...`);
      
      const sortApplied = await page.evaluate(async (sortType) => {
        console.log(`[DEBUG] Looking for sort dropdown button for ${sortType}...`);
        
        // Step 1: Enhanced sort button detection with more patterns
        let sortButton = null;
        
        // Look for all possible button elements
        const allButtons = document.querySelectorAll('button, div[role="button"], span[role="button"]');
        console.log(`[DEBUG] Found ${allButtons.length} potential buttons`);
        
        for (const button of allButtons) {
          const text = button.textContent?.trim() || '';
          const ariaLabel = button.getAttribute('aria-label') || '';
          
          console.log(`[DEBUG] Checking button: "${text}" (aria-label: "${ariaLabel}")`);
          
          // Check for English: "sort" button
          if (text.toLowerCase().includes('sort') || ariaLabel.toLowerCase().includes('sort')) {
            console.log('[DEBUG] Found English sort button:', text);
            sortButton = button;
            break;
          }
          
          // Check for Hebrew: "הרלוונטיות ביותר" (most relevant) button
          if (text.includes('הרלוונטיות ביותר') || text.includes('רלוונטיות')) {
            console.log('[DEBUG] Found Hebrew sort button:', text);
            sortButton = button;
            break;
          }
          
          // Check if this looks like a current sort selection (e.g., "Most relevant", "Newest", etc.)
          if (text.includes('Most relevant') || text.includes('Newest') || text.includes('Highest rated') || text.includes('Lowest rated') ||
              text.includes('החדשות ביותר') || text.includes('הדירוג הגבוה ביותר') || text.includes('הדירוג הנמוך ביותר')) {
            console.log('[DEBUG] Found current sort selection button:', text);
            sortButton = button;
            break;
          }
        }

        if (!sortButton) {
          console.log('[DEBUG] No sort button found, trying broader search...');
          // Fallback: look for buttons that might be the sort dropdown
          const possibleSortButtons = document.querySelectorAll('button.HQzyZ, [jsaction*="sort"], [data-value*="sort"]');
          if (possibleSortButtons.length > 0) {
            sortButton = possibleSortButtons[0];
            console.log('[DEBUG] Using fallback sort button');
          }
        }

        if (!sortButton) {
          console.log('[DEBUG] No sort button found anywhere');
          return false;
        }
        
        console.log(`Found sort button: "${sortButton.textContent}"`);
        (sortButton as HTMLElement).click();
        
        // Wait for dropdown/menu to appear - reduced for speed
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Step 2: Find and click the specific sort option
        console.log(`[DEBUG] Looking for ${sortType} sort option in dropdown...`);
        
        const targetTexts = {
          newest: ['החדשות ביותר', 'Newest', 'Most recent', 'Latest', 'Recent'],
          lowest: ['הדירוג הנמוך ביותר', 'Lowest rated', 'Lowest rating', 'Lowest', 'Worst rated'],
          highest: ['הדירוג הגבוה ביותר', 'Highest rated', 'Highest rating', 'Highest', 'Best rated', 'Top rated']
        };
        
        const searchTexts = targetTexts[sortType];
        console.log(`[DEBUG] Searching for texts:`, searchTexts);
        
        // Method 1: Try div.fxNQSd selector (known Google Maps dropdown item class)
        const fxNQSdElements = document.querySelectorAll('div.fxNQSd');
        console.log(`[DEBUG] Found ${fxNQSdElements.length} div.fxNQSd elements`);
        
        for (const element of fxNQSdElements) {
          const text = element.textContent?.trim() || '';
          console.log(`[DEBUG] Checking fxNQSd element: "${text}"`);
          
          for (const searchText of searchTexts) {
            if (text === searchText || (text.includes(searchText) && text.length < searchText.length + 20)) {
              if ((element as HTMLElement).offsetParent !== null) { // Element is visible
                console.log(`[DEBUG] Clicking ${sortType} option via fxNQSd: "${text}"`);
                (element as HTMLElement).click();
                return true;
              }
            }
          }
        }
        
        // Method 2: Try all possible dropdown menu selectors
        const possibleSelectors = [
          '[role="menuitem"]',
          '[role="option"]', 
          'div[jsaction]',
          'span[jsaction]',
          'button',
          'div.VfPpkd-rymPhb-ibnC6b', // Material Design menu item
          'div[data-index]', // Indexed menu items
          'li[role="menuitem"]',
          'div'
        ];
        
        for (const selector of possibleSelectors) {
          const elements = document.querySelectorAll(selector);
          console.log(`[DEBUG] Checking ${elements.length} elements with selector "${selector}"`);
          
          for (const option of elements) {
            const text = option.textContent?.trim() || '';
            const ariaLabel = option.getAttribute('aria-label') || '';
            
            if (text && text.length > 0 && text.length < 100) { // Reasonable text length
              console.log(`[DEBUG] Checking option: "${text}" (aria: "${ariaLabel}")`);
              
              for (const searchText of searchTexts) {
                if (text === searchText || 
                    text.toLowerCase().includes(searchText.toLowerCase()) ||
                    ariaLabel.toLowerCase().includes(searchText.toLowerCase())) {
                  console.log(`[DEBUG] Found matching option: "${text}" for search text: "${searchText}"`);
                  (option as HTMLElement).click();
                  return true;
                }
              }
            }
          }
        }
        
        console.log(`No ${sortType} option found in dropdown`);
        return false;
      }, sortType);
      
      if (sortApplied) {
        // Wait longer for sorting to take effect and content to reload
        this.log(`⏳ Waiting for ${sortType} sort to take effect...`);
        await page.waitForTimeout(6000); // Increased wait time
        
        // Additional verification - scroll a bit to trigger any lazy loading after sort
        await page.evaluate(() => {
          const reviewContainer = document.querySelector('.m6QErb') || document.querySelector('[role="main"]');
          if (reviewContainer) {
            reviewContainer.scrollTop = 100; // Small scroll to trigger loading
          }
        });
        await page.waitForTimeout(1000);
        
        this.log(`✅ Successfully applied ${sortType} sort filter`);
        return true;
      } else {
        this.log(`❌ Could not apply ${sortType} sort filter`);
        
        // Try fallback approach - sometimes sort is already applied
        this.log(`🔄 Attempting fallback verification for ${sortType}...`);
        await page.waitForTimeout(2000);
        return false; // Still return false but at least wait a bit
      }
      
    } catch (error) {
      this.log(`❌ Error applying ${sortType} sort filter: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * Robust More button clicking with JavaScript executor and anti-bot evasion
   */
  private async clickMoreButtonsOnPage(page: Page): Promise<void> {
    this.log('🔄 Starting robust More button clicking...');
    
    try {
      const clicked = await page.evaluate(() => {
        let totalClicked = 0;
        
        console.log('[MORE_BUTTON] Starting More button detection...');
        
        // Find all potential More buttons using text content
        const allButtons = document.querySelectorAll('button, [role="button"]');
        console.log(`[MORE_BUTTON] Found ${allButtons.length} total buttons`);
        
        const moreButtons = [];
        
        for (let i = 0; i < allButtons.length; i++) {
          const btn = allButtons[i];
          const text = (btn.textContent || '').toLowerCase().trim();
          const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
          
          // Check for More button patterns
          if (text === 'more' || text === 'עוד' || text === 'show more' || text === 'read more' ||
              ariaLabel.includes('more') || ariaLabel.includes('עוד')) {
            
            // Verify it's visible and not disabled
            const rect = btn.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0 && !btn.hasAttribute('disabled')) {
              moreButtons.push(btn);
              console.log(`[MORE_BUTTON] Found candidate: "${text}" (aria: "${ariaLabel}")`);
            }
          }
        }
        
        console.log(`[MORE_BUTTON] Found ${moreButtons.length} More button candidates`);
        
        // Click the buttons synchronously (simplified approach)
        for (let i = 0; i < Math.min(moreButtons.length, 10); i++) {
          const button = moreButtons[i];
          try {
            console.log(`[MORE_BUTTON] Clicking button ${i + 1}: "${button.textContent?.trim()}"`);
            
            // Skip if already expanded
            if (button.getAttribute('aria-expanded') === 'true') {
              console.log(`[MORE_BUTTON] Button already expanded, skipping`);
              continue;
            }
            
            // Scroll into view
            button.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // Click the button
            button.click();
            totalClicked++;
            
            console.log(`[MORE_BUTTON] Successfully clicked button ${i + 1}`);
            
          } catch (clickError) {
            console.log(`[MORE_BUTTON] Click failed:`, clickError.message);
          }
        }
        
        console.log(`[MORE_BUTTON] Total buttons clicked: ${totalClicked}`);
        return totalClicked;
      });
      
      // Add a delay after clicking to allow content to load
      if (clicked > 0) {
        this.log(`✅ More button clicking completed: ${clicked} buttons clicked, waiting for content to load...`);
        await page.waitForTimeout(3000); // Wait for content to load
      } else {
        this.log(`ℹ️ No More buttons found to click`);
      }
    } catch (error) {
      this.log(`❌ More button clicking failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract basic reviews - simple working version
   */
  private async extractBasicReviews(page: Page): Promise<any[]> {
    // Comprehensive navigation protection - disable ALL contributor links immediately
    await page.evaluate(() => {
      console.log('[SCRAPER] Disabling all contributor links to prevent navigation');
      
      // Find and disable ALL contributor links on the page
      const contributorLinks = document.querySelectorAll([
        'a[href*="/contrib/"]',
        'a[data-href*="/contrib/"]', 
        'button[data-href*="/contrib/"]',
        '[href*="contrib"]',
        '[data-href*="contrib"]'
      ].join(', '));
      
      console.log(`[SCRAPER] Found ${contributorLinks.length} contributor links to disable`);
      
      contributorLinks.forEach((link, index) => {
        try {
          const element = link as HTMLElement;
          const originalHref = element.getAttribute('href') || element.getAttribute('data-href');
          console.log(`[SCRAPER] Disabling contributor link ${index + 1}: ${originalHref}`);
          
          // Multiple methods to prevent navigation
          element.style.pointerEvents = 'none';
          element.removeAttribute('href');
          element.removeAttribute('data-href');
          element.setAttribute('disabled', 'true');
          element.setAttribute('data-original-href', originalHref || '');
          
          // Override click events
          element.addEventListener('click', function(e) {
            console.log('[SCRAPER] Blocked click on disabled contributor link');
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            return false;
          }, true);
          
        } catch (e) {
          console.log(`[SCRAPER] Failed to disable link ${index + 1}:`, e);
        }
      });
      
      // Activate general navigation protection
      window.postMessage('START_SCRAPING', '*');
    });
    
    // First, handle More button clicking robustly with proper async handling
    await this.clickMoreButtonsOnPage(page);
    
    const result = await page.evaluate(() => {
      const reviews = [];
      console.log('[SCRAPER] Simple review extraction starting...');
      
      // Find all elements with star ratings
      const starElements = document.querySelectorAll('[role="img"][aria-label*="star"], [role="img"][aria-label*="כוכב"], [aria-label*="stars"], [aria-label*="כוכבים"]');
      console.log(`[SCRAPER] Found ${starElements.length} star elements`);
      
      for (let i = 0; i < starElements.length; i++) {
        const starEl = starElements[i];
        
        // Find the review container - go up the DOM tree to find a reasonable container
        let container = starEl.closest('div');
        for (let level = 0; level < 5 && container; level++) {
          const containerText = container.textContent || '';
          if (containerText.length > 100 && containerText.length < 2000) {
            break; // Found good container
          }
          container = container.parentElement ? container.parentElement.closest('div') : null;
        }
        
        if (!container) continue;
        
        // Extract rating
        const ariaLabel = starEl.getAttribute('aria-label') || '';
        const ratingMatch = ariaLabel.match(/(\d+)/);
        const rating = ratingMatch ? parseInt(ratingMatch[1]) : null;
        if (!rating || rating < 1 || rating > 5) continue;
        
        // Extract actual review text - find the review content specifically
        let reviewText = '';
        
        // More buttons are now handled before review extraction
        
        // Try specific review text selectors first
        const reviewSelectors = ['.wiI7pd', '.MyEned', '[data-expandable-section]', 'span[jsname="bN97Pc"]', '.review-full-text'];
        for (const selector of reviewSelectors) {
          const reviewEl = container.querySelector(selector);
          if (reviewEl) {
            const text = reviewEl.textContent?.trim() || '';
            if (text.length > 20) {
              reviewText = text;
              break;
            }
          }
        }
        
        // Enhanced fallback: look for the longest meaningful text but be more selective
        if (!reviewText) {
          let bestText = '';
          const textElements = container.querySelectorAll('span, div, p');
          for (const el of textElements) {
            const text = el.textContent?.trim() || '';
            if (text.length > bestText.length && text.length > 30 && text.length < 2000 && 
                !text.includes('כוכב') && !text.includes('star') &&
                !text.includes('ago') && !text.includes('לפני') &&
                !text.includes('Google') && !text.includes('מדיניות') &&
                !text.includes('ביקורת') && !text.includes('review') &&
                !text.match(/^\d+\s*(month|week|day|year|hours?|minutes?)/)) {
              bestText = text;
            }
          }
          reviewText = bestText;
        }
        
        // Enhanced author name extraction 
        let authorName = 'Anonymous';
        
        // Step 1: Look for contributor links first (most reliable) - but DON'T interact with them AT ALL
        const contributorElements = container.querySelectorAll('a[data-href*="contrib"], button[data-href*="contrib"], [href*="contrib"], a[href*="contrib"]');
        for (const contrib of contributorElements) {
          if (contrib.textContent && contrib.textContent.trim().length > 0) {
            // ABSOLUTELY NO CLICKING OR INTERACTION - just extract text content
            let name = contrib.textContent.trim();
            console.log(`[SCRAPER] Found contributor element (NO CLICK): "${name}"`);
            
            // Disable the link to prevent any accidental navigation
            try {
              (contrib as HTMLElement).style.pointerEvents = 'none';
              contrib.removeAttribute('href');
              contrib.removeAttribute('data-href');
              contrib.setAttribute('disabled', 'true');
            } catch (e) {
              // Continue if disabling fails
            }
            // Clean the name thoroughly
            name = name
              .replace(/\s*ממליץ מקומי.*$/g, '') // Remove Hebrew "local guide" text
              .replace(/\s*Local Guide.*$/gi, '') // Remove English "local guide" text  
              .replace(/\s*\d+\s*(ביקורת|ביקורות|reviews?).*$/gi, '') // Remove review count
              .replace(/\s*\d+\s*(תמונה|תמונות|photos?).*$/gi, '') // Remove photo count
              .replace(/\s*·.*$/g, '') // Remove everything after middle dot
              .replace(/\s*\|.*$/g, '') // Remove everything after pipe
              .trim();
            
            // Validate it's a proper name
            if (name.length > 1 && name.length < 50 && 
                !name.includes('כוכב') && !name.includes('star') &&
                !name.includes('Google') && !name.includes('מדיניות') &&
                !name.includes('חדש') && !name.includes('עוד') && // Block UI elements
                !name.includes('New') && !name.includes('More') &&
                !/^\d+$/.test(name) && // Not just numbers
                /[\u0590-\u05FF\u0041-\u005A\u0061-\u007A]/.test(name)) { // Contains letters
              authorName = name;
              break;
            }
          }
        }
        
        // Step 2: Look for common author selectors if no contributor found
        if (authorName === 'Anonymous') {
          const authorSelectors = ['.d4r55', '.TSUbDb', '.fontBodyMedium', '[data-value]', '.fontBodySmall'];
          for (const selector of authorSelectors) {
            const elements = container.querySelectorAll(selector);
            for (const el of elements) {
              let name = el.textContent?.trim() || '';
              // Clean the name
              name = name
                .replace(/\s*ממליץ מקומי.*$/g, '') // Remove Hebrew "local guide" text
                .replace(/\s*Local Guide.*$/gi, '') // Remove English "local guide" text  
                .replace(/\s*\d+\s*(ביקורת|ביקורות|reviews?).*$/gi, '') // Remove review count
                .replace(/\s*\d+\s*(תמונה|תמונות|photos?).*$/gi, '') // Remove photo count
                .replace(/\s*·.*$/g, '') // Remove everything after middle dot
                .trim();
              
              // Validate it's a proper name
              if (name.length > 1 && name.length < 50 && 
                  !name.includes('כוכב') && !name.includes('star') &&
                  !name.includes('Google') && !name.includes('מדיניות') &&
                  !name.includes('לפני') && !name.includes('ago') &&
                  !name.includes('חדש') && !name.includes('עוד') && // Block UI elements
                  !name.includes('New') && !name.includes('More') &&
                  !name.includes('ביקורת') && !name.includes('review') &&
                  !/^\d+$/.test(name) && // Not just numbers
                  /[\u0590-\u05FF\u0041-\u005A\u0061-\u007A]/.test(name)) { // Contains letters
                // Additional validation: check if it's positioned like an author name
                const rect = (el as HTMLElement).getBoundingClientRect();
                const starRect = starEl.getBoundingClientRect();
                if (Math.abs(rect.top - starRect.top) < 60) { // Within 60px of star rating
                  authorName = name;
                  break;
                }
              }
            }
            if (authorName !== 'Anonymous') break;
          }
        }
        
        // Step 3: Fallback - look for names in any span/div elements
        if (authorName === 'Anonymous') {
          const allTextElements = container.querySelectorAll('span, div');
          for (const el of allTextElements) {
            let text = el.textContent?.trim() || '';
            
            // Skip if it's clearly not a name
            if (text.length < 2 || text.length > 40) continue;
            
            // Clean the text first
            text = text
              .replace(/\s*ממליץ מקומי.*$/g, '') // Remove Hebrew "local guide" text
              .replace(/\s*Local Guide.*$/gi, '') // Remove English "local guide" text  
              .replace(/\s*\d+\s*(ביקורת|ביקורות|reviews?).*$/gi, '') // Remove review count
              .replace(/\s*\d+\s*(תמונה|תמונות|photos?).*$/gi, '') // Remove photo count
              .replace(/\s*·.*$/g, '') // Remove everything after middle dot
              .trim();
            
            // Comprehensive validation for a proper name
            if (text.length > 2 && text.length < 40 && 
                !text.includes('כוכב') && !text.includes('star') &&
                !text.includes('לפני') && !text.includes('ago') &&
                !text.includes('Google') && !text.includes('מדיניות') &&
                !text.includes('ביקורת') && !text.includes('review') &&
                !text.includes('תמונה') && !text.includes('photos') &&
                !text.includes('חדש') && !text.includes('עוד') && // Block UI elements
                !text.includes('New') && !text.includes('More') &&
                !text.includes('Click') && !text.includes('לחץ') &&
                !/^\d+$/.test(text) && // Not just numbers
                !/^[.,:;!?\s]+$/.test(text) && // Not just punctuation
                /[\u0590-\u05FF\u0041-\u005A\u0061-\u007A]/.test(text) && // Contains letters
                !/(https?:\/\/|www\.)/i.test(text)) { // Not a URL
              
              // Check position relative to star (names are usually near ratings)
              const rect = (el as HTMLElement).getBoundingClientRect();
              const starRect = starEl.getBoundingClientRect();
              if (Math.abs(rect.top - starRect.top) < 80) {
                // Additional check: ensure it's not review text by checking length and content
                if (!text.includes('טעים') && !text.includes('נהדר') && !text.includes('מקום') &&
                    !text.includes('delicious') && !text.includes('great') && !text.includes('place')) {
                  authorName = text;
                  break;
                }
              }
            }
          }
        }
        
        // Enhanced date extraction - handle Hebrew, English, and absolute dates
        let reviewDate = 'Recent';
        const dateElements = container.querySelectorAll('span, div, time, .date, [class*="time"], [class*="date"]');
        
        for (const dateEl of dateElements) {
          const dateText = dateEl.textContent?.trim() || '';
          
          // Hebrew relative patterns: לפני X שעות, לפני X ימים, לפני X חודשים
          if (dateText.includes('לפני') && (dateText.includes('שעות') || dateText.includes('ימים') || dateText.includes('חודשים') || dateText.includes('שנים'))) {
            reviewDate = dateText;
            break;
          }
          
          // English relative patterns: X hours ago, X days ago, etc.
          if (dateText.includes('ago') && dateText.match(/\d+\s*(hour|day|week|month|year)/)) {
            reviewDate = dateText;
            break;
          }
          
          // Short patterns: 2h, 5d, 3w, 1m, 2y
          if (dateText.match(/^\d+\s*(h|d|w|m|y)$/)) {
            reviewDate = dateText;
            break;
          }
          
          // Absolute date patterns: Month Year, DD/MM/YYYY, etc.
          if (dateText.match(/\d{4}/) || // Contains year
              dateText.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/) || // DD/MM/YY format
              dateText.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|ינו|פבר|מרץ|אפר|מאי|יונ|יול|אוג|ספט|אוק|נוב|דצמ)/i)) {
            reviewDate = dateText;
            break;
          }
          
          // Numeric dates that look like timestamps
          if (dateText.match(/^\d{1,2}[\.\-/]\d{1,2}[\.\-/]\d{2,4}$/)) {
            reviewDate = dateText;
            break;
          }
        }
        
        if (reviewText.length > 10) {
          // Convert Hebrew/relative dates to actual Date objects
          let actualDate = new Date();
          if (reviewDate !== 'Recent') {
            try {
              // Parse Hebrew relative dates
              if (reviewDate.includes('לפני')) {
                const match = reviewDate.match(/(\d+)\s*(שעות?|ימים?|חודשים?|שנים?)/);
                if (match) {
                  const num = parseInt(match[1]);
                  const unit = match[2];
                  
                  if (unit.includes('שעות')) { // hours
                    actualDate = new Date(Date.now() - (num * 60 * 60 * 1000));
                  } else if (unit.includes('ימים')) { // days
                    actualDate = new Date(Date.now() - (num * 24 * 60 * 60 * 1000));
                  } else if (unit.includes('חודשים')) { // months
                    actualDate = new Date(Date.now() - (num * 30 * 24 * 60 * 60 * 1000));
                  } else if (unit.includes('שנים')) { // years
                    actualDate = new Date(Date.now() - (num * 365 * 24 * 60 * 60 * 1000));
                  }
                }
              }
              // Parse English relative dates
              else if (reviewDate.includes('ago')) {
                const match = reviewDate.match(/(\d+)\s*(hour|day|week|month|year)/);
                if (match) {
                  const num = parseInt(match[1]);
                  const unit = match[2];
                  
                  switch (unit) {
                    case 'hour': actualDate = new Date(Date.now() - (num * 60 * 60 * 1000)); break;
                    case 'day': actualDate = new Date(Date.now() - (num * 24 * 60 * 60 * 1000)); break;
                    case 'week': actualDate = new Date(Date.now() - (num * 7 * 24 * 60 * 60 * 1000)); break;
                    case 'month': actualDate = new Date(Date.now() - (num * 30 * 24 * 60 * 60 * 1000)); break;
                    case 'year': actualDate = new Date(Date.now() - (num * 365 * 24 * 60 * 60 * 1000)); break;
                  }
                }
              }
            } catch (error) {
              console.log(`Error parsing date "${reviewDate}":`, error);
            }
          }
          
          // Create more stable ID based on content
          const contentStr = `${authorName}_${reviewText}_${rating}`.substring(0, 100);
          let hash = 0;
          for (let i = 0; i < contentStr.length; i++) {
            const char = contentStr.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
          }
          const stableId = `review_${Math.abs(hash)}`;
          
          reviews.push({
            id: stableId,
            rating: rating,
            text: reviewText,
            author: authorName,
            date: actualDate, // Keep as Date object to match RawReview interface
            originalDate: reviewDate, // Keep original for debugging
            position: i + 1,
            extractedAt: new Date().toISOString()
          });
          
          console.log(`[SCRAPER] Added review ${reviews.length}: "${authorName}" - ${rating}★ - "${reviewText.substring(0, 50)}..."`);
          
          // Remove arbitrary limit - let the strategy decide how many reviews to collect
        }
      }
      
      console.log(`[SCRAPER] Extracted ${reviews.length} reviews`);
      
      return reviews;
    });
    
    // Check button click stats from the browser context
    const buttonStats = await page.evaluate(() => {
      return window.moreButtonStats || { total: 0, clicked: 0 };
    });
    
    // Add backend logging to see the actual results
    console.log(`[Scraper-Backend] extractBasicReviews returned ${result.length} reviews`);
    this.log(`📋 More Button Stats: Found ${buttonStats.total} buttons, Clicked ${buttonStats.clicked} "more" buttons`);
    
    // Reset stats for next extraction
    await page.evaluate(() => {
      window.moreButtonStats = { total: 0, clicked: 0 };
    });
    
    return result;
  }

  /**
   * Extract and clean author name from text, handling Hebrew and English patterns
   */
  private extractCleanAuthorName(text: string): string | null {
    if (!text || text.length === 0) return null;
    
    // Remove common unwanted patterns
    const cleanText = text
      .replace(/\s*ממליץ מקומי.*$/g, '') // Remove Hebrew "local guide" text
      .replace(/\s*Local Guide.*$/gi, '') // Remove English "local guide" text  
      .replace(/\s*\d+\s*(ביקורת|ביקורות|reviews?).*$/gi, '') // Remove review count
      .replace(/\s*\d+\s*(תמונה|תמונות|photos?).*$/gi, '') // Remove photo count
      .replace(/\s*·.*$/g, '') // Remove everything after middle dot
      .replace(/\s*\|.*$/g, '') // Remove everything after pipe
      .trim();
    
    // Skip if contains unwanted patterns
    const unwantedPatterns = [
      /^(Anonymous|אלמוני)$/i,
      /כוכב|star/i,
      /לפני|ago/i,
      /Google|מדיניות|policy/i,
      /ביקורת|reviews?/i,
      /תמונה|photos?/i,
      /^\d+$/,  // Just numbers
      /^[.,:;!?\s]+$/, // Just punctuation
      /^(a|an|the|את|של|על|עם)\s/i // Articles and prepositions
    ];
    
    for (const pattern of unwantedPatterns) {
      if (pattern.test(cleanText)) {
        return null;
      }
    }
    
    // Length validation
    if (cleanText.length < 2 || cleanText.length > 50) {
      return null;
    }
    
    // Must contain at least one letter (Hebrew or Latin)
    if (!/[\u0590-\u05FF\u0041-\u005A\u0061-\u007A]/.test(cleanText)) {
      return null;
    }
    
    // Additional validation for reasonable names
    // Skip if it's mostly numbers or symbols
    const letterCount = (cleanText.match(/[\u0590-\u05FF\u0041-\u005A\u0061-\u007A]/g) || []).length;
    if (letterCount < cleanText.length * 0.5) {
      return null;
    }
    
    return cleanText;
  }

  /**
   * Perform aggressive scrolling to load more reviews with enhanced strategies
   */
  private async performAggressiveScrolling(page: Page): Promise<void> {
    try {
      await page.evaluate(async () => {
        // Strategy 1: Find and scroll the main reviews container more aggressively
        const reviewContainers = document.querySelectorAll([
          '.m6QErb',           // Main reviews container
          '[role="main"]',     // Main content area
          '[class*="scroll"]', // Any scrollable container
          '[class*="review"]', // Review-related containers
          '.section-scrollbox', // Google Maps scrollbox
          '.section-listbox',  // Alternative listbox
          '[data-value*="reviews"]' // Data attribute containers
        ].join(', '));
        
        console.log(`[SCROLL] Found ${reviewContainers.length} potential review containers`);
        
        for (const container of reviewContainers) {
          const element = container as HTMLElement;
          if (element.scrollHeight > element.clientHeight) {
            console.log(`[SCROLL] Scrolling container with scrollHeight: ${element.scrollHeight}, clientHeight: ${element.clientHeight}`);
            
            // Scroll to bottom
            element.scrollTop = element.scrollHeight;
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // Multiple small scrolls to trigger lazy loading
            for (let i = 0; i < 5; i++) {
              element.scrollTop += 500;
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          }
        }
        
        // Strategy 2: Enhanced window scrolling with multiple approaches
        const currentScroll = window.pageYOffset;
        const documentHeight = Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight,
          document.body.offsetHeight,
          document.documentElement.offsetHeight
        );
        
        console.log(`[SCROLL] Window scroll - current: ${currentScroll}, document height: ${documentHeight}`);
        
        // Scroll to absolute bottom
        window.scrollTo(0, documentHeight);
        await new Promise(resolve => setTimeout(resolve, 400));
        
        // Alternative scroll methods
        document.documentElement.scrollTop = documentHeight;
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Strategy 3: Enhanced mouse wheel events with variation
        const wheelEvents = [
          { deltaY: 3000, deltaX: 0 },
          { deltaY: 2000, deltaX: 0 },
          { deltaY: 5000, deltaX: 0 }
        ];
        
        for (const wheelConfig of wheelEvents) {
          const wheelEvent = new WheelEvent('wheel', {
            ...wheelConfig,
            bubbles: true,
            cancelable: true
          });
          document.body.dispatchEvent(wheelEvent);
          
          // Also try on the main element
          const main = document.querySelector('main') || document.body;
          main.dispatchEvent(wheelEvent);
          
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        // Strategy 4: Keyboard events variety
        const keyEvents = [
          { key: 'PageDown', code: 'PageDown' },
          { key: 'End', code: 'End' },
          { key: 'ArrowDown', code: 'ArrowDown' }
        ];
        
        for (const keyConfig of keyEvents) {
          const keyEvent = new KeyboardEvent('keydown', {
            ...keyConfig,
            bubbles: true,
            cancelable: true
          });
          document.body.dispatchEvent(keyEvent);
          document.documentElement.dispatchEvent(keyEvent);
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Strategy 5: Try to find and click review-specific "Show more" buttons (be very selective)
        try {
          const buttons = document.querySelectorAll('button');
          for (const button of buttons) {
            const text = button.textContent?.toLowerCase() || '';
            const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
            
            // Only click buttons that are clearly for loading more reviews
            // Exclude help, menu, navigation, share, and other non-review buttons
            const hasLoadMoreText = text.includes('more reviews') || text.includes('show more reviews') || 
                                   ariaLabel.includes('more reviews') || ariaLabel.includes('show more reviews');
            
            const forbiddenTerms = ['help', 'menu', 'navigation', 'settings', 'share', 'שיתוף', 'שתף', 
                                   'עזרה', 'תפריט', 'profile', 'contributor', 'report', 'דווח'];
            const hasForbiddenText = forbiddenTerms.some(term => 
                text.includes(term) || ariaLabel.includes(term)
            );
            
            if (hasLoadMoreText && !hasForbiddenText) {
              
              console.log(`[SCROLL] Found review load more button: "${button.textContent}" (aria: "${ariaLabel}")`);
              (button as HTMLElement).click();
              await new Promise(resolve => setTimeout(resolve, 1000));
              break; // Only click one button per scroll attempt
            }
          }
        } catch (e) {
          // Continue if click fails
          console.log('[SCROLL] Error clicking load more button:', e);
        }
      });
    } catch (error) {
      this.log(`Aggressive scrolling error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Simple deduplication based on unique ID
   */
  private deduplicateReviewsSimple(reviews: any[]): any[] {
    const seen = new Set<string>();
    return reviews.filter(review => {
      if (seen.has(review.id)) {
        return false;
      }
      seen.add(review.id);
      return true;
    });
  }

  /**
   * Fill gaps if we don't have enough unique reviews
   */
  private async fillGapsIfNeeded(page: Page, collections: { [key: string]: RawReview[] }): Promise<{ newest: any[], lowest: any[], highest: any[] }> {
    // Ensure we have the expected structure
    const structuredCollections = {
      newest: collections.newest || [],
      lowest: collections.lowest || [],
      highest: collections.highest || []
    };
    
    const currentTotal = structuredCollections.newest.length + structuredCollections.lowest.length + structuredCollections.highest.length;
    const targetTotal = 200; // Reduced target for better performance
    
    this.log(`Current total: ${currentTotal}, Target: ${targetTotal}`);
    
    if (currentTotal >= targetTotal) {
      this.log(`✅ Already have enough reviews (${currentTotal}), no gap filling needed`);
      return structuredCollections;
    }
    
    const needed = targetTotal - currentTotal;
    this.log(`🔄 Need ${needed} more reviews, collecting additional newest reviews...`);
    
    // Create set of existing review IDs for duplicate checking
    const existingIds = new Set<string>();
    [...structuredCollections.newest, ...structuredCollections.lowest, ...structuredCollections.highest].forEach(review => {
      existingIds.add(createReviewId(review.author, review.text, review.rating));
    });
    
    // Switch back to newest sort and collect more
    await this.applySortFilter(page, 'newest');
    await page.waitForTimeout(1500);
    
    const additionalReviews = await this.collectAdditionalReviews(page, needed, existingIds);
    structuredCollections.newest.push(...additionalReviews);
    
    this.log(`✅ Added ${additionalReviews.length} additional reviews. New total: ${structuredCollections.newest.length + structuredCollections.lowest.length + structuredCollections.highest.length}`);
    
    return structuredCollections;
  }

  /**
   * Collect additional reviews to fill gaps, avoiding duplicates
   */
  private async collectAdditionalReviews(page: Page, needed: number, existingReviews: Set<string>): Promise<any[]> {
    const additional: any[] = [];
    let attempts = 0;
    const maxAttempts = 10; // Reduced from 20 to 10 for speed
    
    while (additional.length < needed && attempts < maxAttempts) {
      // Scroll to load more reviews
      await this.performAggressiveScrolling(page);
      await page.waitForTimeout(1000);
      
      // Extract current reviews
      const currentReviews = await this.extractBasicReviews(page);
      
      // Add unique reviews
      for (const review of currentReviews) {
        const key = createReviewId(review.author, review.text, review.rating);
        if (!existingReviews.has(key)) {
          existingReviews.add(key);
          additional.push(review);
          
          if (additional.length >= needed) break;
        }
      }
      
      attempts++;
    }
    
    return additional;
  }

  /**
   * Validate Google Maps URL
   */
  validateUrl(url: string): boolean {
    return validateGoogleMapsUrl(url);
  }

  /**
   * Close browser and cleanup
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}