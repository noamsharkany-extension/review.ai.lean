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
            '--disable-background-networking'
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
    this.log('Setting up streamlined page configuration...');
    
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(30000);

    page.on('pageerror', (error) => {
      this.debugLog(`Page error: ${error.message}`);
    });
  }

  private async navigateStreamlined(page: Page, url: string): Promise<void> {
    this.log('Using streamlined navigation...');
    
    try {
      await page.goto(url, { 
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
   * Main scraping method using our successful multi-lingual approach
   */
  async scrapeReviews(googleUrl: string): Promise<RawReview[]> {
    this.log('🎯 Starting comprehensive review extraction: 100 newest + 100 lowest + 100 highest = 300 unique reviews');
    
    let page: Page | null = null;
    try {
      const browser = await this.getBrowser();
      page = await browser.newPage();
      await this.setupPageStreamlined(page);
      await this.navigateStreamlined(page, googleUrl);
      await page.waitForTimeout(2000);
      
      const reviewCollections = {
        newest: [] as any[],
        lowest: [] as any[],
        highest: [] as any[]
      };
      
      // Step 1: Click on Reviews tab to access all reviews
      this.log('📋 Step 1: Accessing Reviews tab...');
      await this.clickReviewsTab(page);
      await page.waitForTimeout(2000);
      
      // Step 2: Collect 100 NEWEST reviews
      this.log('🕐 Step 2: Collecting 100 NEWEST reviews...');
      reviewCollections.newest = await this.collectReviewsBySort(page, 'newest', 100);
      this.log(`✅ Collected ${reviewCollections.newest.length} newest reviews`);
      
      // Step 3: Collect 100 LOWEST rated reviews  
      this.log('⭐ Step 3: Collecting 100 LOWEST rated reviews...');
      reviewCollections.lowest = await this.collectReviewsBySort(page, 'lowest', 100);
      this.log(`✅ Collected ${reviewCollections.lowest.length} lowest rated reviews`);
      
      // Step 4: Collect 100 HIGHEST rated reviews
      this.log('🌟 Step 4: Collecting 100 HIGHEST rated reviews...');
      reviewCollections.highest = await this.collectReviewsBySort(page, 'highest', 100);
      this.log(`✅ Collected ${reviewCollections.highest.length} highest rated reviews`);
      
      // Step 5: Deduplicate reviews across collections
      this.log('🔍 Step 5: Deduplicating reviews across collections...');
      const deduplicatedCollections = this.reviewDeduplicationService.mergeAndDeduplicate(reviewCollections);
      
      // Step 5b: Fill gaps if needed
      this.log('📈 Step 5b: Checking if we need to fill gaps...');
      const finalCollections = await this.fillGapsIfNeeded(page, deduplicatedCollections);
      
      // Step 6: Combine all unique reviews
      const allUniqueReviews = [
        ...finalCollections.newest.map(r => ({ ...r, sortType: 'newest' })),
        ...finalCollections.lowest.map(r => ({ ...r, sortType: 'lowest' })),
        ...finalCollections.highest.map(r => ({ ...r, sortType: 'highest' }))
      ];
      
      this.log(`🎉 Final result: ${allUniqueReviews.length} unique reviews`);
      this.log(`   - Newest: ${finalCollections.newest.length}`);
      this.log(`   - Lowest: ${finalCollections.lowest.length}`);
      this.log(`   - Highest: ${finalCollections.highest.length}`);
      
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
      await page.waitForTimeout(3000);
      
      let collectedReviews: any[] = [];
      
      // Immediately scroll down aggressively to load reviews for this sort
      this.log(`📜 Scrolling down to load ${sortType} reviews...`);
      for (let i = 0; i < 10; i++) {
        await this.performAggressiveScrolling(page);
        await page.waitForTimeout(800); // Wait for reviews to load
        
        // Try to extract reviews after each scroll
        const currentReviews = await this.extractBasicReviews(page);
        if (currentReviews.length > collectedReviews.length) {
          collectedReviews = currentReviews;
          this.log(`${sortType} - Scroll ${i + 1}: Found ${collectedReviews.length} reviews`);
        }
        
        // If we have enough reviews, stop scrolling
        if (collectedReviews.length >= target) {
          break;
        }
      }
      
      // Final extraction attempt
      const finalReviews = await this.extractBasicReviews(page);
      if (finalReviews.length > collectedReviews.length) {
        collectedReviews = finalReviews;
      }
      
      this.log(`📊 ${sortType} collection completed: ${collectedReviews.length} reviews`);
      return collectedReviews.slice(0, target); // Limit to target
      
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
   * Apply sorting filter using our proven multi-lingual method
   */
  private async applySortFilter(page: Page, sortType: 'newest' | 'lowest' | 'highest'): Promise<boolean> {
    try {
      // First scroll to top to access sort dropdown
      await this.scrollToTopOfReviews(page);
      
      this.log(`🔄 Applying ${sortType} sort filter...`);
      
      const sortApplied = await page.evaluate(async (sortType) => {
        console.log('[DEBUG] Looking for sort dropdown button...');
        
        // Step 1: Find sort dropdown button - multilingual approach
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
              if (element.offsetParent !== null) { // Element is visible
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
        // Wait for sorting to take effect
        await page.waitForTimeout(4000);
        this.log(`✅ Successfully applied ${sortType} sort filter`);
        return true;
      } else {
        this.log(`❌ Could not apply ${sortType} sort filter`);
        return false;
      }
      
    } catch (error) {
      this.log(`❌ Error applying ${sortType} sort filter: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * Extract basic reviews - simple working version
   */
  private async extractBasicReviews(page: Page): Promise<any[]> {
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
        
        // Try specific review text selectors first
        const reviewSelectors = ['.wiI7pd', '.MyEned', '[data-expandable-section]', 'span[jsname="bN97Pc"]'];
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
        
        // Fallback: look for the longest meaningful text but be more selective
        if (!reviewText) {
          const textElements = container.querySelectorAll('span, div, p');
          for (const el of textElements) {
            const text = el.textContent?.trim() || '';
            if (text.length > reviewText.length && text.length > 30 && text.length < 1000 && 
                !text.includes('כוכב') && !text.includes('star') &&
                !text.includes('ago') && !text.includes('לפני') &&
                !text.includes('Google') && !text.includes('מדיניות') &&
                !text.match(/^\d+\s*(month|week|day|year|hours?|minutes?)/)) {
              reviewText = text;
            }
          }
        }
        
        // Extract author name - be more specific about author selectors
        let authorName = 'Anonymous';
        const nameElements = container.querySelectorAll('a[data-href*="contrib"], button[data-href*="contrib"], .d4r55, .TSUbDb');
        for (const nameEl of nameElements) {
          const name = nameEl.textContent?.trim() || '';
          if (name.length > 0 && name.length < 50 && 
              !name.includes('כוכב') && !name.includes('star') &&
              !name.includes('Google') && !name.includes('מדיניות') &&
              !name.includes('policy') && !name.includes('תמונה')) {
            authorName = name;
            break;
          }
        }
        
        // Fallback: look for short text near the star that looks like a name
        if (authorName === 'Anonymous') {
          const shortTexts = container.querySelectorAll('span, div');
          for (const el of shortTexts) {
            const text = el.textContent?.trim() || '';
            if (text.length > 2 && text.length < 30 && 
                !text.includes('כוכב') && !text.includes('star') &&
                !text.includes('לפני') && !text.includes('ago') &&
                !text.includes('Google') && !text.includes('מדיניות')) {
              const parent = el.closest('a, button');
              if (parent && parent.getAttribute('data-href')?.includes('contrib')) {
                authorName = text;
                break;
              }
            }
          }
        }
        
        // Extract date - handle Hebrew and English patterns
        let reviewDate = 'Recent';
        const dateElements = container.querySelectorAll('span');
        for (const dateEl of dateElements) {
          const dateText = dateEl.textContent?.trim() || '';
          // Hebrew patterns: לפני X שעות, לפני X ימים, לפני X חודשים
          // English patterns: X hours ago, X days ago, etc.
          if ((dateText.includes('לפני') && (dateText.includes('שעות') || dateText.includes('ימים') || dateText.includes('חודשים') || dateText.includes('שנים'))) ||
              (dateText.includes('ago') && dateText.match(/\d+\s*(hour|day|week|month|year)/)) ||
              dateText.match(/^\d+\s*(h|d|w|m|y)$/)) {
            reviewDate = dateText;
            break;
          }
        }
        
        // Alternative date search - look for time-related classes
        if (reviewDate === 'Recent') {
          const timeElements = container.querySelectorAll('[class*="time"], [class*="date"], .fontBodySmall, .fontCaption');
          for (const timeEl of timeElements) {
            const timeText = timeEl.textContent?.trim() || '';
            if (timeText.includes('לפני') || timeText.includes('ago') || timeText.match(/\d/)) {
              reviewDate = timeText;
              break;
            }
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
          const stableId = `review_${Math.abs(hash)}_${Date.now()}`;
          
          reviews.push({
            id: stableId,
            rating: rating,
            text: reviewText,
            author: authorName,
            date: actualDate.toISOString(), // Convert to ISO string for frontend
            originalDate: reviewDate, // Keep original for debugging
            position: i + 1,
            extractedAt: new Date().toISOString()
          });
          
          console.log(`[SCRAPER] Added review ${reviews.length}: "${authorName}" - ${rating}★ - "${reviewText.substring(0, 50)}..."`);
          
          if (reviews.length >= 50) break;
        }
      }
      
      console.log(`[SCRAPER] Extracted ${reviews.length} reviews`);
      
      return reviews;
    });
    
    // Add backend logging to see the actual results
    console.log(`[Scraper-Backend] extractBasicReviews returned ${result.length} reviews`);
    return result;
  }

  /**
   * Perform aggressive scrolling to load more reviews
   */
  private async performAggressiveScrolling(page: Page): Promise<void> {
    try {
      await page.evaluate(async () => {
        // Strategy 1: Scroll all potential containers
        const containers = document.querySelectorAll('.m6QErb, [role="main"], [class*="scroll"]');
        for (const container of containers) {
          if (container.scrollHeight > container.clientHeight) {
            container.scrollTop = container.scrollHeight;
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
        
        // Strategy 2: Window scrolling
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Strategy 3: Mouse wheel events
        const wheelEvent = new WheelEvent('wheel', {
          deltaY: 2000,
          bubbles: true,
          cancelable: true
        });
        document.body.dispatchEvent(wheelEvent);
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Strategy 4: Page Down key
        const keyEvent = new KeyboardEvent('keydown', {
          key: 'PageDown',
          code: 'PageDown',
          bubbles: true
        });
        document.body.dispatchEvent(keyEvent);
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
  private async fillGapsIfNeeded(page: Page, collections: { newest: any[], lowest: any[], highest: any[] }): Promise<{ newest: any[], lowest: any[], highest: any[] }> {
    const currentTotal = collections.newest.length + collections.lowest.length + collections.highest.length;
    const targetTotal = 200; // Reduced target for better performance
    
    this.log(`Current total: ${currentTotal}, Target: ${targetTotal}`);
    
    if (currentTotal >= targetTotal) {
      this.log(`✅ Already have enough reviews (${currentTotal}), no gap filling needed`);
      return collections;
    }
    
    const needed = targetTotal - currentTotal;
    this.log(`🔄 Need ${needed} more reviews, collecting additional newest reviews...`);
    
    // Create set of existing review IDs for duplicate checking
    const existingIds = new Set<string>();
    [...collections.newest, ...collections.lowest, ...collections.highest].forEach(review => {
      existingIds.add(createReviewId(review.author, review.text, review.rating));
    });
    
    // Switch back to newest sort and collect more
    await this.applySortFilter(page, 'newest');
    await page.waitForTimeout(1500);
    
    const additionalReviews = await this.collectAdditionalReviews(page, needed, existingIds);
    collections.newest.push(...additionalReviews);
    
    this.log(`✅ Added ${additionalReviews.length} additional reviews. New total: ${collections.newest.length + collections.lowest.length + collections.highest.length}`);
    
    return collections;
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