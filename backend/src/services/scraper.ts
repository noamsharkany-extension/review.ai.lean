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
      
      // Always use Strategy B: Selective filtering (like successful commit 4801237)
      // This ensures we get comprehensive coverage regardless of total review count
      this.log('🎯 Using Strategy B: Selective filtering - 100 newest + 100 lowest + 100 highest (matching commit 4801237)');
      allUniqueReviews = await this.extractWithSelectiveFiltering(page);
      this.log(`🎉 Final result: ${allUniqueReviews.length} unique reviews using Strategy B (selective filtering)`);      
      
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
   * Using efficient single-scroll approach as requested by user
   */
  private async extractAllAvailableReviews(page: Page): Promise<any[]> {
    this.log('📜 Extracting ALL available reviews using efficient single-scroll approach...');
    
    // Step 1: Apply newest sort to ensure we get reviews in a good order
    const sortApplied = await this.applySortFilter(page, 'newest');
    if (!sortApplied) {
      this.log('⚠️ Could not apply newest sort, using current order');
    }
    
    // Step 2: Wait for sort to take effect
    this.log('⏳ Waiting for newest sort to load content...');
    await page.waitForTimeout(3000);
    
    // Step 3: Single efficient scroll to load all available content
    this.log('📜 Single efficient scroll to load all available reviews...');
    await this.performSingleEfficientScroll(page);
    
    // Step 4: Wait for all content to fully load
    this.log('⏳ Waiting for all content to load...');
    await page.waitForTimeout(3000);
    
    // Step 5: Extract all visible reviews at once
    this.log('📊 Extracting all visible reviews...');
    const allReviews = await this.extractBasicReviews(page);
    
    // Step 6: Deduplicate
    const deduplicationResult = this.reviewDeduplicationService.deduplicateReviews(allReviews);
    const uniqueReviews = deduplicationResult.uniqueReviews;
    
    this.log(`📊 Found ${uniqueReviews.length} unique reviews (${deduplicationResult.duplicateCount} duplicates removed)`);
    this.log(`✅ Strategy A complete: Efficient single-scroll approach extracted ${uniqueReviews.length} unique reviews`);
    
    return uniqueReviews.map(r => ({ ...r, sortType: 'all' }));
  }

  /**
   * Strategy B: Efficient selective filtering (newest → lowest → highest, then fill gaps)
   */
  private async extractWithSelectiveFiltering(page: Page): Promise<any[]> {
    this.log('🎯 Using efficient selective filtering strategy: newest → lowest → highest → fill gaps');
    
    const reviewCollections = {
      newest: [] as any[],
      lowest: [] as any[],
      highest: [] as any[]
    };
    
    // Step 1: Collect NEWEST reviews (single scroll, extract, move on)
    this.log('🕐 Step 1: Collecting NEWEST reviews with single scroll...');
    reviewCollections.newest = await this.collectReviewsBySort(page, 'newest', 100);
    this.log(`✅ Collected ${reviewCollections.newest.length} newest reviews`);
    
    // Step 2: Collect LOWEST rated reviews (scroll up, change sort, single scroll, extract)
    this.log('⭐ Step 2: Collecting LOWEST rated reviews with single scroll...');
    reviewCollections.lowest = await this.collectReviewsBySort(page, 'lowest', 100);
    this.log(`✅ Collected ${reviewCollections.lowest.length} lowest rated reviews`);
    
    // Step 3: Collect HIGHEST rated reviews (scroll up, change sort, single scroll, extract)
    this.log('🌟 Step 3: Collecting HIGHEST rated reviews with single scroll...');
    reviewCollections.highest = await this.collectReviewsBySort(page, 'highest', 100);
    this.log(`✅ Collected ${reviewCollections.highest.length} highest rated reviews`);
    
    // Step 4: Combine and deduplicate
    this.log('🔍 Step 4: Combining and deduplicating all reviews...');
    const allCombinedReviews = [
      ...reviewCollections.newest.map(r => ({ ...r, sortType: 'newest' })),
      ...reviewCollections.lowest.map(r => ({ ...r, sortType: 'lowest' })),
      ...reviewCollections.highest.map(r => ({ ...r, sortType: 'highest' }))
    ];
    
    const deduplicationResult = this.reviewDeduplicationService.deduplicateReviews(allCombinedReviews);
    let uniqueReviews = deduplicationResult.uniqueReviews;
    
    this.log(`📊 After deduplication: ${uniqueReviews.length} unique reviews from ${allCombinedReviews.length} total`);
    
    // Step 5: Fill gaps if needed (target ~200-250 reviews for large sites)
    const targetTotal = 200;
    if (uniqueReviews.length < targetTotal) {
      const needed = targetTotal - uniqueReviews.length;
      this.log(`📈 Step 5: Need ${needed} more reviews, collecting additional newest reviews...`);
      
      // Go back to newest and collect more to fill the gap
      const additionalReviews = await this.collectReviewsBySort(page, 'newest', needed + 50); // Get extra to account for duplicates
      const combinedWithAdditional = [...uniqueReviews, ...additionalReviews.map(r => ({ ...r, sortType: 'newest-fill' }))];
      const finalDeduplication = this.reviewDeduplicationService.deduplicateReviews(combinedWithAdditional);
      uniqueReviews = finalDeduplication.uniqueReviews.slice(0, targetTotal);
      
      this.log(`✅ After filling gaps: ${uniqueReviews.length} total reviews`);
    }
    
    this.log(`✅ Strategy B complete - Efficient approach:`);
    this.log(`   - Newest: ${reviewCollections.newest.length}`);
    this.log(`   - Lowest: ${reviewCollections.lowest.length}`);
    this.log(`   - Highest: ${reviewCollections.highest.length}`);
    this.log(`   - Final unique: ${uniqueReviews.length} reviews`);
    this.log(`   - Duplicates removed: ${deduplicationResult.duplicateCount}`);
    
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
   * Collect reviews by specific sort type with smart aggressive pagination (matching commit 4801237 approach)
   */
  private async collectReviewsBySort(page: Page, sortType: 'newest' | 'lowest' | 'highest', target: number): Promise<any[]> {
    this.log(`🔄 Collecting ${target} ${sortType} reviews with smart aggressive pagination...`);
    
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
      const maxStagnantRounds = 5; // Match 4801237 patience level
      const maxScrollAttempts = 25; // Reduced from 40 to 25 for better efficiency while maintaining effectiveness
      
      this.log(`📜 Smart aggressive scrolling to load ${sortType} reviews (target: ${target})...`);
      for (let i = 0; i < maxScrollAttempts; i++) {
        // Smart multi-scroll approach: fewer but more effective scrolls
        for (let j = 0; j < 3; j++) { // Reduced from 5 to 3 scrolls per round
          await this.performAggressiveScrolling(page);
          await page.waitForTimeout(800); // Slightly longer wait for content to load
        }
        
        // Additional wait for content to load
        await page.waitForTimeout(1500); // Increased wait time for better content loading
        
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
    this.log('📜 Scrolling to top of reviews for sort change...');
    
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
    
    await page.waitForTimeout(1500); // Increased wait for UI to settle
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
      console.log('[SCRAPER] Simple review extraction starting... - TESTING IF CHANGES WORK!!!');
      
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
        
        // Aggressive Google Maps author extraction - multiple strategies
        let authorName = 'Anonymous';
        
        // Strategy 1: Common Google Maps author class patterns (most likely)
        const authorSelectors = [
          'div[data-review-id] .d4r55',           // Specific to review containers
          'div[data-review-id] .TSUbDb',          // Alternative author class
          'div[data-review-id] span[jsname]',     // JS component spans
          'div[data-review-id] [data-value]',     // Data value attributes
          '.jftiEf',                              // Common author class
          '.fontBodyMedium',                      // Font styling classes
          '.fontBodySmall',
          '.fontHeaderMedium',
          'span[class*="font"]',                  // Any font-related class
          'div[class*="font"]'
        ];
        
        for (const selector of authorSelectors) {
          const elements = container.querySelectorAll(selector);
          for (const element of elements) {
            let text = element.textContent?.trim() || '';
            
            // Skip empty or very short/long text
            if (!text || text.length < 2 || text.length > 50) continue;
            
            // Skip obvious non-name patterns
            if (text.includes('★') || text.includes('star') || text.includes('כוכב') ||
                text.includes('ago') || text.includes('לפני') ||
                /^\d+\s*(day|week|month|year|hour|min)/i.test(text) ||
                text.includes('more') || text.includes('עוד') ||
                text.includes('Local Guide') || text.includes('ממליץ מקומי') ||
                /\d+\s*(review|ביקורת)/.test(text) ||
                /^visited in (January|February|March|April|May|June|July|August|September|October|November|December)/i.test(text)) continue;
            
            // Clean the text
            text = text
              .replace(/\s*ממליץ מקומי.*$/gi, '')
              .replace(/\s*Local Guide.*$/gi, '')
              .replace(/\s*\d+.*$/g, '') // Remove anything after numbers
              .replace(/\s*·.*$/g, '')
              .replace(/\s*\|.*$/g, '')
              .trim();
            
            // Validate it looks like a proper name
            if (text.length >= 2 && text.length <= 40 && 
                /^[a-zA-Z\u0590-\u05FF][a-zA-Z\u0590-\u05FF\s.'-]*$/.test(text) &&
                !/^(more|less|show|hide|click|the|and|or|of|in|at|to|for|with|by)$/i.test(text)) {
              
              authorName = text;
              console.log(`[SCRAPER] Found author via selector "${selector}": "${authorName}"`);
              break;
            }
          }
          if (authorName !== 'Anonymous') break;
        }
        
        // Strategy 2: Look for clickable author elements (profile links, buttons)
        if (authorName === 'Anonymous') {
          const clickableElements = container.querySelectorAll('a, button, [role="button"], [data-href], [tabindex]');
          for (const element of clickableElements) {
            let text = element.textContent?.trim() || '';
            
            // Skip obvious non-names
            if (!text || text.length < 2 || text.length > 40 ||
                text.includes('★') || text.includes('star') || text.includes('כוכב') ||
                text.includes('ago') || text.includes('לפני') ||
                /more|less|show|hide|click|menu|button/i.test(text) ||
                /^\d+$/.test(text) || // Just numbers
                /^(review|ביקורת|photo|תמונה|video|וידיאו)$/i.test(text) ||
                /^visited in (January|February|March|April|May|June|July|August|September|October|November|December)/i.test(text)) continue;
            
            // Clean and validate
            const originalText = text;
            text = text
              .replace(/\s*ממליץ מקומי.*$/gi, '')
              .replace(/\s*Local Guide.*$/gi, '')
              .replace(/\s*\d+.*$/g, '') // Remove anything after numbers
              .replace(/\s*·.*$/g, '')
              .replace(/\s*\|.*$/g, '')
              .trim();
            
            if (text.length >= 2 && text.length <= 40 &&
                /^[a-zA-Z\u0590-\u05FF][a-zA-Z\u0590-\u05FF\s.'-]*$/.test(text)) {
              
              authorName = text;
              console.log(`[SCRAPER] Found author via clickable element: "${authorName}" (original: "${originalText}")`);
              break;
            }
          }
        }
        
        // Strategy 3: Aggressive text search within reasonable positioning
        if (authorName === 'Anonymous') {
          console.log(`[SCRAPER] Using aggressive text search for author`);
          
          // Look for any text that could be an author name (positioned near rating)
          const allTextElements = container.querySelectorAll('span, div, p, h1, h2, h3, h4, h5, h6');
          const starRect = starEl.getBoundingClientRect();
          
          for (const el of allTextElements) {
            const text = el.textContent?.trim() || '';
            
            // Must be reasonable name length and pattern
            if (text.length < 2 || text.length > 40) continue;
            
            // Skip obviously non-name content
            if (text.includes('★') || text.includes('star') || text.includes('כוכב') ||
                text.includes('ago') || text.includes('לפני') ||
                text.includes('review') || text.includes('ביקורת') ||
                text.includes('more') || text.includes('עוד') ||
                text.includes('Google') || text.includes('Map') ||
                /^\d+$/.test(text) ||  // Just numbers
                /^(a|an|the|this|that|with|and|or|but|if|then|when|where|why|how)$/i.test(text) ||
                /^visited in (January|February|March|April|May|June|July|August|September|October|November|December)/i.test(text) ||
                text.length > 50) continue;
            
            // Check if it's positioned near the star rating (author names usually are)
            try {
              const elementRect = (el as HTMLElement).getBoundingClientRect();
              const verticalDistance = Math.abs(elementRect.top - starRect.top);
              
              // If it's reasonably close to the star rating and looks like a name
              if (verticalDistance < 100 && /^[a-zA-Z\u0590-\u05FF][a-zA-Z\u0590-\u05FF\s.'-]*$/.test(text)) {
                // Final cleaning
                const cleanText = text
                  .replace(/\s*ממליץ מקומי.*$/gi, '')
                  .replace(/\s*Local Guide.*$/gi, '')
                  .replace(/\s*\d+.*$/g, '')
                  .trim();
                
                if (cleanText.length >= 2 && cleanText.length <= 40) {
                  authorName = cleanText;
                  console.log(`[SCRAPER] Found positioned author: "${authorName}" (distance: ${verticalDistance}px)`);
                  break;
                }
              }
            } catch (e) {
              // Continue if positioning check fails
            }
          }
        }
        
        // Enhanced date extraction using regex pattern matching from container text
        let reviewDate = 'Recent';
        const containerText = container.textContent || '';
        
        console.log(`[SCRAPER] Extracting date from container text (${containerText.length} chars) for author "${authorName}"`);
        
        // Try to find date patterns in the container text directly using regex
        const datePatterns = [
          // "Visited in [Month]" patterns that appear in the results
          /visited in (January|February|March|April|May|June|July|August|September|October|November|December)/i,
          // Hebrew relative patterns: לפני X שעות, לפני X ימים, לפני X חודשים  
          /לפני\s+\d+\s*(שעות?|ימים?|חודשים?|שנים?)/,
          // English relative patterns: X hours ago, X days ago, etc.
          /\d+\s*(hour|day|week|month|year)s?\s+ago/i,
          // Short relative patterns: 2h, 5d, 3w, 1m, 2y
          /\b\d+\s*(h|d|w|m|y)\b/,
          // Absolute dates with year
          /\b\d{1,2}\/\d{1,2}\/\d{4}\b/,
          // Month names with potential year
          /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}/i
        ];
        
        for (const pattern of datePatterns) {
          const match = containerText.match(pattern);
          if (match) {
            reviewDate = match[0].trim();
            console.log(`[SCRAPER] Found date pattern: "${reviewDate}"`);
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
              // Enhanced date parsing for month names and temporal references
              else {
                // Handle "Visited in [Month]" patterns specifically
                const visitedMatch = reviewDate.match(/visited in (January|February|March|April|May|June|July|August|September|October|November|December)/i);
                if (visitedMatch) {
                  console.log(`[SCRAPER] Parsing "Visited in Month" pattern: "${reviewDate}"`);
                  const now = new Date();
                  const currentMonth = now.getMonth();
                  const currentYear = now.getFullYear();
                  
                  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                                   'July', 'August', 'September', 'October', 'November', 'December'];
                  
                  const monthIndex = monthNames.findIndex(m => m.toLowerCase() === visitedMatch[1].toLowerCase());
                  
                  if (monthIndex !== -1) {
                    // If the month is in the future, assume it's from last year
                    const targetYear = monthIndex > currentMonth ? currentYear - 1 : currentYear;
                    actualDate = new Date(targetYear, monthIndex, 15); // Use middle of month as approximation
                    console.log(`[SCRAPER] Converted "${reviewDate}" to date: ${actualDate.toISOString()}`);
                  }
                }
                // Try to parse other month names - estimate current year and appropriate month
                else {
                  const monthMatch = reviewDate.match(/(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i);
                  if (monthMatch) {
                    const now = new Date();
                    const currentMonth = now.getMonth();
                    const currentYear = now.getFullYear();
                    
                    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                                     'July', 'August', 'September', 'October', 'November', 'December'];
                    const shortMonthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                                           'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    
                    let monthIndex = monthNames.findIndex(m => m.toLowerCase() === monthMatch[1].toLowerCase());
                    if (monthIndex === -1) {
                      monthIndex = shortMonthNames.findIndex(m => m.toLowerCase() === monthMatch[1].toLowerCase());
                    }
                    
                    if (monthIndex !== -1) {
                      // If the month is in the future, assume it's from last year
                      const targetYear = monthIndex > currentMonth ? currentYear - 1 : currentYear;
                      actualDate = new Date(targetYear, monthIndex, 15); // Use middle of month as approximation
                    }
                  } else {
                    // Fallback: try native Date parsing for any other format
                    const parsedDate = new Date(reviewDate);
                    if (!isNaN(parsedDate.getTime())) {
                      actualDate = parsedDate;
                    }
                  }
                }
              }
            } catch (error) {
              console.log(`Error parsing date "${reviewDate}":`, error);
            }
          }
          
          // Final validation - ensure we never have Invalid Date objects
          if (isNaN(actualDate.getTime())) {
            console.log(`[SCRAPER] Warning: Could not parse date "${reviewDate}" for author "${authorName}", using current date as fallback`);
            actualDate = new Date(); // Use current date as safe fallback
          } else {
            console.log(`[SCRAPER] Successfully parsed date "${reviewDate}" -> ${actualDate.toISOString()} for author "${authorName}"`);
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
          
          const reviewObject = {
            id: stableId,
            rating: rating,
            text: reviewText,
            author: authorName,
            date: actualDate.toISOString(), // Serialize to string for browser-to-node transfer
            originalDate: reviewDate, // Keep original for debugging
            position: i + 1,
            extractedAt: new Date().toISOString()
          };
          
          reviews.push(reviewObject);
          
          console.log(`[SCRAPER] Added review ${reviews.length}: "${authorName}" - ${rating}★ - Date: ${actualDate.toISOString()} (original: "${reviewDate}") - "${reviewText.substring(0, 50)}..."`);
          console.log(`[SCRAPER] Review object date type: ${typeof reviewObject.date}, value: ${reviewObject.date}`);
          
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
    
    // Convert string dates back to Date objects and debug
    const processedResult = result.map(review => ({
      ...review,
      date: new Date(review.date) // Convert ISO string back to Date object
    }));
    
    if (processedResult.length > 0) {
      console.log('[Scraper-Backend] Sample of first review after processing:');
      const firstReview = processedResult[0];
      console.log(`- Author: "${firstReview.author}"`);
      console.log(`- Date: ${firstReview.date} (type: ${typeof firstReview.date})`);
      console.log(`- Original Date: "${firstReview.originalDate}"`);
      console.log(`- Date valid: ${firstReview.date instanceof Date ? !isNaN(firstReview.date.getTime()) : 'Not a Date object'}`);
      console.log(`- Date ISO: ${firstReview.date instanceof Date ? firstReview.date.toISOString() : 'N/A'}`);
    }
    
    this.log(`📋 More Button Stats: Found ${buttonStats.total} buttons, Clicked ${buttonStats.clicked} "more" buttons`);
    
    // Reset stats for next extraction
    await page.evaluate(() => {
      window.moreButtonStats = { total: 0, clicked: 0 };
    });
    
    return processedResult;
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
   * Perform single efficient scroll to load all reviews
   * User requirement: "start scrolling and whenever there's more button click on it -> extract the reviews on the first scroll"
   */
  private async performSingleEfficientScroll(page: Page): Promise<void> {
    this.log('📜 Performing single efficient scroll with More button clicking...');
    
    try {
      await page.evaluate(async () => {
        console.log('[SCROLL] Starting single efficient scroll');
        
        // Step 1: Find the main reviews container
        const reviewContainer = document.querySelector('.m6QErb') || 
                               document.querySelector('[role="main"]') ||
                               document.querySelector('.section-scrollbox');
        
        if (reviewContainer) {
          console.log('[SCROLL] Found review container, scrolling with More button clicking');
          
          let previousScrollHeight = reviewContainer.scrollHeight;
          let scrollPosition = 0;
          const scrollStep = reviewContainer.clientHeight * 0.8; // 80% of viewport height
          
          while (scrollPosition < reviewContainer.scrollHeight) {
            // Scroll down by one step
            scrollPosition += scrollStep;
            reviewContainer.scrollTop = scrollPosition;
            
            console.log(`[SCROLL] Scrolled to position ${scrollPosition} of ${reviewContainer.scrollHeight}`);
            
            // Wait for content to load
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Look for More buttons to click immediately
            const moreButtons = document.querySelectorAll('button');
            let buttonsClicked = 0;
            
            for (const btn of moreButtons) {
              const text = (btn.textContent || '').toLowerCase().trim();
              if (text === 'more' || text === 'עוד' || text === 'show more' || text === 'read more') {
                const rect = btn.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0 && !btn.hasAttribute('aria-expanded')) {
                  console.log('[SCROLL] Clicking More button during scroll:', text);
                  btn.click();
                  buttonsClicked++;
                  await new Promise(resolve => setTimeout(resolve, 800)); // Wait for content expansion
                }
              }
            }
            
            if (buttonsClicked > 0) {
              console.log(`[SCROLL] Clicked ${buttonsClicked} More buttons, updating scroll height`);
              // Update scroll height after More button clicks
              await new Promise(resolve => setTimeout(resolve, 1500));
            }
            
            // Check if new content was loaded
            const newScrollHeight = reviewContainer.scrollHeight;
            if (newScrollHeight > previousScrollHeight) {
              console.log(`[SCROLL] New content loaded, height increased from ${previousScrollHeight} to ${newScrollHeight}`);
              previousScrollHeight = newScrollHeight;
            }
            
            // If we've reached the bottom and no new content is loading, break
            if (scrollPosition >= reviewContainer.scrollHeight - reviewContainer.clientHeight) {
              console.log('[SCROLL] Reached bottom of container');
              break;
            }
          }
          
          console.log('[SCROLL] Single efficient scroll completed');
          
        } else {
          console.log('[SCROLL] No review container found, using window scroll with More button handling');
          
          let previousHeight = document.documentElement.scrollHeight;
          let scrollPosition = 0;
          const scrollStep = window.innerHeight * 0.8;
          
          while (scrollPosition < document.documentElement.scrollHeight) {
            scrollPosition += scrollStep;
            window.scrollTo(0, scrollPosition);
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Click More buttons during window scroll
            const moreButtons = document.querySelectorAll('button');
            for (const btn of moreButtons) {
              const text = (btn.textContent || '').toLowerCase().trim();
              if (text === 'more' || text === 'עוד' || text === 'show more' || text === 'read more') {
                const rect = btn.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                  btn.click();
                  await new Promise(resolve => setTimeout(resolve, 800));
                }
              }
            }
            
            const newHeight = document.documentElement.scrollHeight;
            if (newHeight > previousHeight) {
              previousHeight = newHeight;
            } else if (scrollPosition >= document.documentElement.scrollHeight - window.innerHeight) {
              break;
            }
          }
        }
        
        console.log('[SCROLL] Single efficient scroll with More buttons completed');
      });
      
    } catch (error) {
      this.log(`Single scroll error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Legacy aggressive scrolling method (kept for compatibility)
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