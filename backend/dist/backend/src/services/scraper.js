import puppeteer from 'puppeteer';
import { validateGoogleMapsUrl } from '../utils/urlValidator.js';
import { createReviewId } from '../utils/reviewIdUtils.js';
import { LanguageDetectionService } from './languageDetection.js';
import { ComprehensiveCollectionOrchestrator } from './comprehensiveCollectionOrchestrator.js';
import { ReviewSortNavigationService } from './reviewSortNavigationService.js';
import { EnhancedPaginationEngine } from './enhancedPaginationEngine.js';
import { ReviewDeduplicationService } from './reviewDeduplicationService.js';
export class GoogleReviewScraperService {
    constructor(progressCallback, debugMode = false) {
        this.browser = null;
        this.debugMode = false;
        this.attemptedSelectors = [];
        this.successfulSelectors = [];
        this.fallbacksUsed = [];
        this.selectorMetrics = {};
        this.sessionStartTime = 0;
        this.progressCallback = progressCallback;
        this.debugMode = debugMode;
        this.languageDetectionService = new LanguageDetectionService(progressCallback, debugMode);
        this.comprehensiveCollectionOrchestrator = new ComprehensiveCollectionOrchestrator((sessionId, progress) => {
            this.progressCallback?.(`[${sessionId}] ${progress.currentPhase}: ${progress.phaseProgress.current}/${progress.phaseProgress.target} (${progress.overallProgress.percentage.toFixed(1)}%)`);
        }, debugMode);
        this.reviewSortNavigationService = new ReviewSortNavigationService(progressCallback, debugMode);
        this.enhancedPaginationEngine = new EnhancedPaginationEngine(debugMode, progressCallback);
        this.reviewDeduplicationService = new ReviewDeduplicationService(debugMode);
    }
    log(message) {
        console.log(`[Scraper] ${message}`);
        this.progressCallback?.(message);
    }
    debugLog(message) {
        if (this.debugMode) {
            console.log(`[Scraper Debug] ${message}`);
        }
    }
    async getBrowser() {
        if (!this.browser) {
            try {
                this.log('Launching browser...');
                const browserPromise = puppeteer.launch({
                    headless: false,
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
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Browser launch timeout after 45 seconds')), 45000));
                this.browser = await Promise.race([browserPromise, timeoutPromise]);
                this.log('Browser launched successfully');
                const page = await this.browser.newPage();
                await page.setExtraHTTPHeaders({
                    'Accept-Language': 'en-US,en;q=0.9'
                });
                await page.close();
                this.browser.on('disconnected', () => {
                    this.log('Browser disconnected unexpectedly');
                    this.browser = null;
                });
            }
            catch (error) {
                this.log(`Failed to launch browser: ${error instanceof Error ? error.message : 'Unknown error'}`);
                throw new Error(`Failed to launch browser: ${error instanceof Error ? error.message : 'Unknown error'}. This may be due to system configuration issues with Chrome/Chromium.`);
            }
        }
        return this.browser;
    }
    async setupPageStreamlined(page) {
        this.log('Setting up streamlined page configuration with English locale...');
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9,en-GB;q=0.8',
            'Accept-Charset': 'utf-8',
            'Cache-Control': 'no-cache'
        });
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'language', {
                get: function () { return 'en-US'; }
            });
            Object.defineProperty(navigator, 'languages', {
                get: function () { return ['en-US', 'en']; }
            });
            if (typeof Intl !== 'undefined') {
                const originalDateTimeFormat = Intl.DateTimeFormat;
                Intl.DateTimeFormat = function (locale, options) {
                    return new originalDateTimeFormat('en-US', options);
                };
            }
            const originalWindowOpen = window.open;
            window.open = function (url, target, features) {
                console.log(`[SCRAPER] BLOCKED window.open attempt to: ${url}`);
                return null;
            };
            const originalSetLocation = Object.getOwnPropertyDescriptor(Location.prototype, 'href') || {};
            Object.defineProperty(location, 'href', {
                get: originalSetLocation.get,
                set: function (value) {
                    if (value && value.includes('/contrib/')) {
                        console.log(`[SCRAPER] BLOCKED location.href change to contributor profile: ${value}`);
                        return;
                    }
                    if (originalSetLocation.set) {
                        originalSetLocation.set.call(this, value);
                    }
                }
            });
            document.addEventListener('click', function (e) {
                const target = e.target;
                const href = target.getAttribute('href') || target.getAttribute('data-href') || '';
                if (href && href.includes('/contrib/')) {
                    console.log(`[SCRAPER] BLOCKED click on contributor link: ${href}`);
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    return false;
                }
                if (e.ctrlKey || e.metaKey || e.button === 1) {
                    console.log(`[SCRAPER] BLOCKED new tab click attempt`);
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    return false;
                }
            }, true);
            const originalAssign = location.assign;
            location.assign = function (url) {
                console.log(`[SCRAPER] BLOCKED location.assign to: ${url}`);
                return;
            };
            const originalReplace = location.replace;
            location.replace = function (url) {
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
    async navigateStreamlined(page, url) {
        this.log('Using streamlined navigation with English locale...');
        try {
            let navigateUrl = url;
            if (url.includes('google.com/maps')) {
                const urlObj = new URL(url);
                urlObj.searchParams.set('hl', 'en');
                urlObj.searchParams.set('gl', 'US');
                navigateUrl = urlObj.toString();
                this.log(`Modified URL for English locale: ${navigateUrl}`);
            }
            await page.goto(navigateUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });
            this.log('Navigation completed successfully');
        }
        catch (error) {
            this.log(`Navigation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw new Error(`Failed to navigate to page: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async scrapeReviews(googleUrl) {
        this.log('🎯 Starting adaptive review extraction...');
        let page = null;
        try {
            const browser = await this.getBrowser();
            page = await browser.newPage();
            await this.setupPageStreamlined(page);
            await this.navigateStreamlined(page, googleUrl);
            await page.waitForTimeout(2000);
            this.log('📋 Step 1: Accessing Reviews tab...');
            await this.clickReviewsTab(page);
            await page.waitForTimeout(2000);
            this.log('🔢 Step 2: Detecting total review count...');
            const totalReviewCount = await this.detectTotalReviewCount(page);
            this.log(`📊 Detected approximately ${totalReviewCount} total reviews`);
            let allUniqueReviews;
            if (totalReviewCount <= 300) {
                this.log('📜 Using Strategy A: Extracting ALL available reviews (≤300 total)');
                allUniqueReviews = await this.extractAllAvailableReviews(page);
            }
            else {
                this.log('🎯 Using Strategy B: Selective filtering (>300 total) - 100 newest + 100 lowest + 100 highest');
                allUniqueReviews = await this.extractWithSelectiveFiltering(page);
            }
            this.log(`🎉 Final result: ${allUniqueReviews.length} unique reviews using ${totalReviewCount <= 300 ? 'Strategy A (extract all)' : 'Strategy B (selective)'}`);
            return allUniqueReviews;
        }
        catch (error) {
            this.log(`Scraping failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw new Error(`Failed to extract reviews: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        finally {
            if (page) {
                await page.close();
            }
        }
    }
    async detectTotalReviewCount(page) {
        const reviewCount = await page.evaluate(() => {
            const selectors = [
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
                    if ((text.includes('reviews') || text.includes('ביקורת') || jsaction.includes('moreReviews')) &&
                        (text.match(/[\d,]+/) || ariaLabel.match(/[\d,]+/))) {
                        const fullText = text + ' ' + ariaLabel;
                        const numberMatch = fullText.match(/([\d,]+)/);
                        if (numberMatch) {
                            const count = parseInt(numberMatch[1].replace(/,/g, ''));
                            console.log(`[DETECT] Found review count: ${count} from text: "${fullText}"`);
                            if (count > 0 && count < 100000) {
                                return count;
                            }
                        }
                    }
                }
            }
            console.log('[DETECT] Could not find review count, defaulting to 999');
            return 999;
        });
        return reviewCount;
    }
    async extractAllAvailableReviews(page) {
        this.log('📜 Extracting ALL available reviews...');
        let allReviews = [];
        let previousCount = 0;
        let stagnantRounds = 0;
        const maxStagnantRounds = 5;
        const maxScrollAttempts = 50;
        await this.applySortFilter(page, 'newest');
        await page.waitForTimeout(3000);
        for (let attempt = 0; attempt < maxScrollAttempts; attempt++) {
            for (let i = 0; i < 3; i++) {
                await this.performAggressiveScrolling(page);
                await page.waitForTimeout(800);
            }
            const currentReviews = await this.extractBasicReviews(page);
            const combinedReviews = [...allReviews, ...currentReviews];
            const deduplicationResult = this.reviewDeduplicationService.deduplicateReviews(combinedReviews);
            allReviews = deduplicationResult.uniqueReviews;
            this.log(`📊 Scroll ${attempt + 1}: Found ${allReviews.length} unique reviews (${deduplicationResult.duplicateCount} duplicates removed)`);
            if (allReviews.length === previousCount) {
                stagnantRounds++;
                this.log(`⚠️ No new reviews found (stagnant round ${stagnantRounds}/${maxStagnantRounds})`);
                if (stagnantRounds >= maxStagnantRounds) {
                    this.log('✅ Reached end of reviews - no new reviews found in multiple attempts');
                    break;
                }
            }
            else {
                stagnantRounds = 0;
                previousCount = allReviews.length;
            }
            if (allReviews.length > 500) {
                this.log('⚠️ Reached maximum safety limit (500), stopping extraction');
                break;
            }
        }
        this.log(`✅ Strategy A complete: Extracted ${allReviews.length} unique reviews`);
        return allReviews.map(r => ({ ...r, sortType: 'all' }));
    }
    async extractWithSelectiveFiltering(page) {
        this.log('🎯 Using selective filtering strategy: 100 newest + 100 lowest + 100 highest');
        const reviewCollections = {
            newest: [],
            lowest: [],
            highest: []
        };
        this.log('🕐 Collecting 100 NEWEST reviews...');
        reviewCollections.newest = await this.collectReviewsBySort(page, 'newest', 100);
        this.log(`✅ Collected ${reviewCollections.newest.length} newest reviews`);
        this.log('⭐ Collecting 100 LOWEST rated reviews...');
        reviewCollections.lowest = await this.collectReviewsBySort(page, 'lowest', 100);
        this.log(`✅ Collected ${reviewCollections.lowest.length} lowest rated reviews`);
        this.log('🌟 Collecting 100 HIGHEST rated reviews...');
        reviewCollections.highest = await this.collectReviewsBySort(page, 'highest', 100);
        this.log(`✅ Collected ${reviewCollections.highest.length} highest rated reviews`);
        this.log('🔍 Combining and deduplicating all reviews...');
        const allCombinedReviews = [
            ...reviewCollections.newest.map(r => ({ ...r, sortType: 'newest' })),
            ...reviewCollections.lowest.map(r => ({ ...r, sortType: 'lowest' })),
            ...reviewCollections.highest.map(r => ({ ...r, sortType: 'highest' }))
        ];
        const deduplicationResult = this.reviewDeduplicationService.deduplicateReviews(allCombinedReviews);
        const uniqueReviews = deduplicationResult.uniqueReviews;
        this.log(`✅ Strategy B complete:`);
        this.log(`   - Total collected: ${allCombinedReviews.length} reviews`);
        this.log(`   - Duplicates removed: ${deduplicationResult.duplicateCount}`);
        this.log(`   - Final unique reviews: ${uniqueReviews.length}`);
        this.log(`   - Newest: ${reviewCollections.newest.length}, Lowest: ${reviewCollections.lowest.length}, Highest: ${reviewCollections.highest.length}`);
        return uniqueReviews;
    }
    async clickReviewsTab(page) {
        const reviewsButtonClicked = await page.evaluate(() => {
            const buttons = document.querySelectorAll('button');
            for (const button of buttons) {
                const text = button.textContent?.trim() || '';
                const jsaction = button.getAttribute('jsaction') || '';
                if ((text.includes('reviews') || text.includes('Reviews')) &&
                    jsaction.includes('moreReviews')) {
                    button.click();
                    return { success: true, text, language: 'english' };
                }
                if ((text.includes('ביקורות')) &&
                    jsaction.includes('moreReviews')) {
                    button.click();
                    return { success: true, text, language: 'hebrew' };
                }
                if ((text.includes('1,863') || text.includes('1863') || /\d+.*reviews?/i.test(text) || /\d+.*ביקורות/.test(text)) &&
                    jsaction.includes('moreReviews')) {
                    button.click();
                    return { success: true, text, language: 'numeric' };
                }
            }
            return { success: false };
        });
        if (reviewsButtonClicked.success) {
            this.log(`Reviews panel opened: "${reviewsButtonClicked.text}" (${reviewsButtonClicked.language})`);
            await page.waitForTimeout(3000);
        }
        else {
            this.log('Could not open reviews panel');
        }
    }
    async collectReviewsBySort(page, sortType, target) {
        this.log(`🔄 Collecting ${target} ${sortType} reviews with aggressive pagination...`);
        try {
            const sortApplied = await this.applySortFilter(page, sortType);
            if (!sortApplied) {
                this.log(`⚠️ Could not apply ${sortType} sort, using current order`);
            }
            await page.waitForTimeout(4000);
            let collectedReviews = [];
            let previousCount = 0;
            let stagnantRounds = 0;
            const maxStagnantRounds = 5;
            const maxScrollAttempts = 40;
            this.log(`📜 Aggressively scrolling to load ${sortType} reviews (target: ${target})...`);
            for (let i = 0; i < maxScrollAttempts; i++) {
                for (let j = 0; j < 5; j++) {
                    await this.performAggressiveScrolling(page);
                    await page.waitForTimeout(500);
                }
                await page.waitForTimeout(1000);
                const currentReviews = await this.extractBasicReviews(page);
                const combinedReviews = [...collectedReviews, ...currentReviews];
                const deduplicationResult = this.reviewDeduplicationService.deduplicateReviews(combinedReviews);
                collectedReviews = deduplicationResult.uniqueReviews;
                this.log(`${sortType} - Scroll ${i + 1}: Found ${collectedReviews.length} unique reviews (${deduplicationResult.duplicateCount} duplicates removed, raw: ${currentReviews.length})`);
                if (collectedReviews.length === previousCount) {
                    stagnantRounds++;
                    if (stagnantRounds >= maxStagnantRounds) {
                        this.log(`⚠️ ${sortType} - No new reviews found in ${stagnantRounds} attempts, stopping at ${collectedReviews.length} reviews`);
                        break;
                    }
                }
                else {
                    stagnantRounds = 0;
                    previousCount = collectedReviews.length;
                }
                if (collectedReviews.length >= target) {
                    this.log(`✅ ${sortType} - Reached target of ${target} reviews`);
                    break;
                }
                if (i % 5 === 0 && i > 0) {
                    this.log(`📊 ${sortType} progress: ${collectedReviews.length}/${target} reviews after ${i + 1} scroll attempts`);
                }
            }
            this.log(`📊 ${sortType} collection completed: ${collectedReviews.length} reviews (target was ${target})`);
            if (sortType === 'lowest' && collectedReviews.length < 10) {
                this.log(`ℹ️ Very few lowest rated reviews found (${collectedReviews.length}). This might indicate a business with mostly positive reviews.`);
                this.log(`🔄 Attempting to collect additional lower-rated reviews...`);
                for (let extraAttempt = 0; extraAttempt < 15; extraAttempt++) {
                    await this.performAggressiveScrolling(page);
                    await page.waitForTimeout(800);
                    const moreReviews = await this.extractBasicReviews(page);
                    const combinedReviews = [...collectedReviews, ...moreReviews];
                    const deduplicationResult = this.reviewDeduplicationService.deduplicateReviews(combinedReviews);
                    if (deduplicationResult.uniqueReviews.length > collectedReviews.length) {
                        collectedReviews = deduplicationResult.uniqueReviews;
                        this.log(`${sortType} - Extra attempt ${extraAttempt + 1}: Found ${collectedReviews.length} total reviews`);
                        if (collectedReviews.length >= 20) {
                            break;
                        }
                    }
                }
            }
            return collectedReviews.slice(0, target);
        }
        catch (error) {
            this.log(`❌ Error collecting ${sortType} reviews: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return [];
        }
    }
    async scrollToTopOfReviews(page) {
        await page.evaluate(() => {
            const reviewsContainer = document.querySelector('.m6QErb') ||
                document.querySelector('[role="main"]') ||
                document.querySelector('.review-dialog-list') ||
                document.querySelector('[class*="scroll"]');
            if (reviewsContainer) {
                reviewsContainer.scrollTop = 0;
                console.log('[DEBUG] Scrolled reviews container to top');
            }
            window.scrollTo(0, 0);
            console.log('[DEBUG] Scrolled window to top');
        });
        await page.waitForTimeout(1000);
    }
    async applySortFilter(page, sortType) {
        try {
            await this.scrollToTopOfReviews(page);
            await page.waitForTimeout(2000);
            this.log(`🔄 Applying ${sortType} sort filter with enhanced detection...`);
            const sortApplied = await page.evaluate(async (sortType) => {
                console.log(`[DEBUG] Looking for sort dropdown button for ${sortType}...`);
                let sortButton = null;
                const allButtons = document.querySelectorAll('button, div[role="button"], span[role="button"]');
                console.log(`[DEBUG] Found ${allButtons.length} potential buttons`);
                for (const button of allButtons) {
                    const text = button.textContent?.trim() || '';
                    const ariaLabel = button.getAttribute('aria-label') || '';
                    console.log(`[DEBUG] Checking button: "${text}" (aria-label: "${ariaLabel}")`);
                    if (text.toLowerCase().includes('sort') || ariaLabel.toLowerCase().includes('sort')) {
                        console.log('[DEBUG] Found English sort button:', text);
                        sortButton = button;
                        break;
                    }
                    if (text.includes('הרלוונטיות ביותר') || text.includes('רלוונטיות')) {
                        console.log('[DEBUG] Found Hebrew sort button:', text);
                        sortButton = button;
                        break;
                    }
                    if (text.includes('Most relevant') || text.includes('Newest') || text.includes('Highest rated') || text.includes('Lowest rated') ||
                        text.includes('החדשות ביותר') || text.includes('הדירוג הגבוה ביותר') || text.includes('הדירוג הנמוך ביותר')) {
                        console.log('[DEBUG] Found current sort selection button:', text);
                        sortButton = button;
                        break;
                    }
                }
                if (!sortButton) {
                    console.log('[DEBUG] No sort button found, trying broader search...');
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
                sortButton.click();
                await new Promise(resolve => setTimeout(resolve, 1500));
                console.log(`[DEBUG] Looking for ${sortType} sort option in dropdown...`);
                const targetTexts = {
                    newest: ['החדשות ביותר', 'Newest', 'Most recent', 'Latest', 'Recent'],
                    lowest: ['הדירוג הנמוך ביותר', 'Lowest rated', 'Lowest rating', 'Lowest', 'Worst rated'],
                    highest: ['הדירוג הגבוה ביותר', 'Highest rated', 'Highest rating', 'Highest', 'Best rated', 'Top rated']
                };
                const searchTexts = targetTexts[sortType];
                console.log(`[DEBUG] Searching for texts:`, searchTexts);
                const fxNQSdElements = document.querySelectorAll('div.fxNQSd');
                console.log(`[DEBUG] Found ${fxNQSdElements.length} div.fxNQSd elements`);
                for (const element of fxNQSdElements) {
                    const text = element.textContent?.trim() || '';
                    console.log(`[DEBUG] Checking fxNQSd element: "${text}"`);
                    for (const searchText of searchTexts) {
                        if (text === searchText || (text.includes(searchText) && text.length < searchText.length + 20)) {
                            if (element.offsetParent !== null) {
                                console.log(`[DEBUG] Clicking ${sortType} option via fxNQSd: "${text}"`);
                                element.click();
                                return true;
                            }
                        }
                    }
                }
                const possibleSelectors = [
                    '[role="menuitem"]',
                    '[role="option"]',
                    'div[jsaction]',
                    'span[jsaction]',
                    'button',
                    'div.VfPpkd-rymPhb-ibnC6b',
                    'div[data-index]',
                    'li[role="menuitem"]',
                    'div'
                ];
                for (const selector of possibleSelectors) {
                    const elements = document.querySelectorAll(selector);
                    console.log(`[DEBUG] Checking ${elements.length} elements with selector "${selector}"`);
                    for (const option of elements) {
                        const text = option.textContent?.trim() || '';
                        const ariaLabel = option.getAttribute('aria-label') || '';
                        if (text && text.length > 0 && text.length < 100) {
                            console.log(`[DEBUG] Checking option: "${text}" (aria: "${ariaLabel}")`);
                            for (const searchText of searchTexts) {
                                if (text === searchText ||
                                    text.toLowerCase().includes(searchText.toLowerCase()) ||
                                    ariaLabel.toLowerCase().includes(searchText.toLowerCase())) {
                                    console.log(`[DEBUG] Found matching option: "${text}" for search text: "${searchText}"`);
                                    option.click();
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
                this.log(`⏳ Waiting for ${sortType} sort to take effect...`);
                await page.waitForTimeout(6000);
                await page.evaluate(() => {
                    const reviewContainer = document.querySelector('.m6QErb') || document.querySelector('[role="main"]');
                    if (reviewContainer) {
                        reviewContainer.scrollTop = 100;
                    }
                });
                await page.waitForTimeout(1000);
                this.log(`✅ Successfully applied ${sortType} sort filter`);
                return true;
            }
            else {
                this.log(`❌ Could not apply ${sortType} sort filter`);
                this.log(`🔄 Attempting fallback verification for ${sortType}...`);
                await page.waitForTimeout(2000);
                return false;
            }
        }
        catch (error) {
            this.log(`❌ Error applying ${sortType} sort filter: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return false;
        }
    }
    async extractBasicReviews(page) {
        await page.evaluate(() => {
            console.log('[SCRAPER] Disabling all contributor links to prevent navigation');
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
                    const element = link;
                    const originalHref = element.getAttribute('href') || element.getAttribute('data-href');
                    console.log(`[SCRAPER] Disabling contributor link ${index + 1}: ${originalHref}`);
                    element.style.pointerEvents = 'none';
                    element.removeAttribute('href');
                    element.removeAttribute('data-href');
                    element.setAttribute('disabled', 'true');
                    element.setAttribute('data-original-href', originalHref || '');
                    element.addEventListener('click', function (e) {
                        console.log('[SCRAPER] Blocked click on disabled contributor link');
                        e.preventDefault();
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                        return false;
                    }, true);
                }
                catch (e) {
                    console.log(`[SCRAPER] Failed to disable link ${index + 1}:`, e);
                }
            });
            window.postMessage('START_SCRAPING', '*');
        });
        const result = await page.evaluate(() => {
            const reviews = [];
            console.log('[SCRAPER] Simple review extraction starting...');
            const starElements = document.querySelectorAll('[role="img"][aria-label*="star"], [role="img"][aria-label*="כוכב"], [aria-label*="stars"], [aria-label*="כוכבים"]');
            console.log(`[SCRAPER] Found ${starElements.length} star elements`);
            for (let i = 0; i < starElements.length; i++) {
                const starEl = starElements[i];
                let container = starEl.closest('div');
                for (let level = 0; level < 5 && container; level++) {
                    const containerText = container.textContent || '';
                    if (containerText.length > 100 && containerText.length < 2000) {
                        break;
                    }
                    container = container.parentElement ? container.parentElement.closest('div') : null;
                }
                if (!container)
                    continue;
                const ariaLabel = starEl.getAttribute('aria-label') || '';
                const ratingMatch = ariaLabel.match(/(\d+)/);
                const rating = ratingMatch ? parseInt(ratingMatch[1]) : null;
                if (!rating || rating < 1 || rating > 5)
                    continue;
                let reviewText = '';
                const moreButtons = container.querySelectorAll('button[data-expandable-section], button[aria-label*="more"], button[aria-label*="עוד"], [role="button"][jsname*="expand"], .review-more-button');
                for (const btn of moreButtons) {
                    try {
                        if (btn && typeof btn.click === 'function') {
                            const btnText = btn.textContent?.toLowerCase() || '';
                            const btnAriaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
                            if (!btnText.includes('profile') && !btnText.includes('contributor') &&
                                !btnAriaLabel.includes('profile') && !btnAriaLabel.includes('contributor')) {
                                btn.click();
                            }
                        }
                    }
                    catch (e) {
                    }
                }
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
                let authorName = 'Anonymous';
                const contributorElements = container.querySelectorAll('a[data-href*="contrib"], button[data-href*="contrib"], [href*="contrib"], a[href*="contrib"]');
                for (const contrib of contributorElements) {
                    if (contrib.textContent && contrib.textContent.trim().length > 0) {
                        let name = contrib.textContent.trim();
                        console.log(`[SCRAPER] Found contributor element (NO CLICK): "${name}"`);
                        try {
                            contrib.style.pointerEvents = 'none';
                            contrib.removeAttribute('href');
                            contrib.removeAttribute('data-href');
                            contrib.setAttribute('disabled', 'true');
                        }
                        catch (e) {
                        }
                        name = name
                            .replace(/\s*ממליץ מקומי.*$/g, '')
                            .replace(/\s*Local Guide.*$/gi, '')
                            .replace(/\s*\d+\s*(ביקורת|ביקורות|reviews?).*$/gi, '')
                            .replace(/\s*\d+\s*(תמונה|תמונות|photos?).*$/gi, '')
                            .replace(/\s*·.*$/g, '')
                            .replace(/\s*\|.*$/g, '')
                            .trim();
                        if (name.length > 1 && name.length < 50 &&
                            !name.includes('כוכב') && !name.includes('star') &&
                            !name.includes('Google') && !name.includes('מדיניות') &&
                            !name.includes('חדש') && !name.includes('עוד') &&
                            !name.includes('New') && !name.includes('More') &&
                            !/^\d+$/.test(name) &&
                            /[\u0590-\u05FF\u0041-\u005A\u0061-\u007A]/.test(name)) {
                            authorName = name;
                            break;
                        }
                    }
                }
                if (authorName === 'Anonymous') {
                    const authorSelectors = ['.d4r55', '.TSUbDb', '.fontBodyMedium', '[data-value]', '.fontBodySmall'];
                    for (const selector of authorSelectors) {
                        const elements = container.querySelectorAll(selector);
                        for (const el of elements) {
                            let name = el.textContent?.trim() || '';
                            name = name
                                .replace(/\s*ממליץ מקומי.*$/g, '')
                                .replace(/\s*Local Guide.*$/gi, '')
                                .replace(/\s*\d+\s*(ביקורת|ביקורות|reviews?).*$/gi, '')
                                .replace(/\s*\d+\s*(תמונה|תמונות|photos?).*$/gi, '')
                                .replace(/\s*·.*$/g, '')
                                .trim();
                            if (name.length > 1 && name.length < 50 &&
                                !name.includes('כוכב') && !name.includes('star') &&
                                !name.includes('Google') && !name.includes('מדיניות') &&
                                !name.includes('לפני') && !name.includes('ago') &&
                                !name.includes('חדש') && !name.includes('עוד') &&
                                !name.includes('New') && !name.includes('More') &&
                                !name.includes('ביקורת') && !name.includes('review') &&
                                !/^\d+$/.test(name) &&
                                /[\u0590-\u05FF\u0041-\u005A\u0061-\u007A]/.test(name)) {
                                const rect = el.getBoundingClientRect();
                                const starRect = starEl.getBoundingClientRect();
                                if (Math.abs(rect.top - starRect.top) < 60) {
                                    authorName = name;
                                    break;
                                }
                            }
                        }
                        if (authorName !== 'Anonymous')
                            break;
                    }
                }
                if (authorName === 'Anonymous') {
                    const allTextElements = container.querySelectorAll('span, div');
                    for (const el of allTextElements) {
                        let text = el.textContent?.trim() || '';
                        if (text.length < 2 || text.length > 40)
                            continue;
                        text = text
                            .replace(/\s*ממליץ מקומי.*$/g, '')
                            .replace(/\s*Local Guide.*$/gi, '')
                            .replace(/\s*\d+\s*(ביקורת|ביקורות|reviews?).*$/gi, '')
                            .replace(/\s*\d+\s*(תמונה|תמונות|photos?).*$/gi, '')
                            .replace(/\s*·.*$/g, '')
                            .trim();
                        if (text.length > 2 && text.length < 40 &&
                            !text.includes('כוכב') && !text.includes('star') &&
                            !text.includes('לפני') && !text.includes('ago') &&
                            !text.includes('Google') && !text.includes('מדיניות') &&
                            !text.includes('ביקורת') && !text.includes('review') &&
                            !text.includes('תמונה') && !text.includes('photos') &&
                            !text.includes('חדש') && !text.includes('עוד') &&
                            !text.includes('New') && !text.includes('More') &&
                            !text.includes('Click') && !text.includes('לחץ') &&
                            !/^\d+$/.test(text) &&
                            !/^[.,:;!?\s]+$/.test(text) &&
                            /[\u0590-\u05FF\u0041-\u005A\u0061-\u007A]/.test(text) &&
                            !/(https?:\/\/|www\.)/i.test(text)) {
                            const rect = el.getBoundingClientRect();
                            const starRect = starEl.getBoundingClientRect();
                            if (Math.abs(rect.top - starRect.top) < 80) {
                                if (!text.includes('טעים') && !text.includes('נהדר') && !text.includes('מקום') &&
                                    !text.includes('delicious') && !text.includes('great') && !text.includes('place')) {
                                    authorName = text;
                                    break;
                                }
                            }
                        }
                    }
                }
                let reviewDate = 'Recent';
                const dateElements = container.querySelectorAll('span, div, time, .date, [class*="time"], [class*="date"]');
                for (const dateEl of dateElements) {
                    const dateText = dateEl.textContent?.trim() || '';
                    if (dateText.includes('לפני') && (dateText.includes('שעות') || dateText.includes('ימים') || dateText.includes('חודשים') || dateText.includes('שנים'))) {
                        reviewDate = dateText;
                        break;
                    }
                    if (dateText.includes('ago') && dateText.match(/\d+\s*(hour|day|week|month|year)/)) {
                        reviewDate = dateText;
                        break;
                    }
                    if (dateText.match(/^\d+\s*(h|d|w|m|y)$/)) {
                        reviewDate = dateText;
                        break;
                    }
                    if (dateText.match(/\d{4}/) ||
                        dateText.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/) ||
                        dateText.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|ינו|פבר|מרץ|אפר|מאי|יונ|יול|אוג|ספט|אוק|נוב|דצמ)/i)) {
                        reviewDate = dateText;
                        break;
                    }
                    if (dateText.match(/^\d{1,2}[\.\-/]\d{1,2}[\.\-/]\d{2,4}$/)) {
                        reviewDate = dateText;
                        break;
                    }
                }
                if (reviewText.length > 10) {
                    let actualDate = new Date();
                    if (reviewDate !== 'Recent') {
                        try {
                            if (reviewDate.includes('לפני')) {
                                const match = reviewDate.match(/(\d+)\s*(שעות?|ימים?|חודשים?|שנים?)/);
                                if (match) {
                                    const num = parseInt(match[1]);
                                    const unit = match[2];
                                    if (unit.includes('שעות')) {
                                        actualDate = new Date(Date.now() - (num * 60 * 60 * 1000));
                                    }
                                    else if (unit.includes('ימים')) {
                                        actualDate = new Date(Date.now() - (num * 24 * 60 * 60 * 1000));
                                    }
                                    else if (unit.includes('חודשים')) {
                                        actualDate = new Date(Date.now() - (num * 30 * 24 * 60 * 60 * 1000));
                                    }
                                    else if (unit.includes('שנים')) {
                                        actualDate = new Date(Date.now() - (num * 365 * 24 * 60 * 60 * 1000));
                                    }
                                }
                            }
                            else if (reviewDate.includes('ago')) {
                                const match = reviewDate.match(/(\d+)\s*(hour|day|week|month|year)/);
                                if (match) {
                                    const num = parseInt(match[1]);
                                    const unit = match[2];
                                    switch (unit) {
                                        case 'hour':
                                            actualDate = new Date(Date.now() - (num * 60 * 60 * 1000));
                                            break;
                                        case 'day':
                                            actualDate = new Date(Date.now() - (num * 24 * 60 * 60 * 1000));
                                            break;
                                        case 'week':
                                            actualDate = new Date(Date.now() - (num * 7 * 24 * 60 * 60 * 1000));
                                            break;
                                        case 'month':
                                            actualDate = new Date(Date.now() - (num * 30 * 24 * 60 * 60 * 1000));
                                            break;
                                        case 'year':
                                            actualDate = new Date(Date.now() - (num * 365 * 24 * 60 * 60 * 1000));
                                            break;
                                    }
                                }
                            }
                        }
                        catch (error) {
                            console.log(`Error parsing date "${reviewDate}":`, error);
                        }
                    }
                    const contentStr = `${authorName}_${reviewText}_${rating}`.substring(0, 100);
                    let hash = 0;
                    for (let i = 0; i < contentStr.length; i++) {
                        const char = contentStr.charCodeAt(i);
                        hash = ((hash << 5) - hash) + char;
                        hash = hash & hash;
                    }
                    const stableId = `review_${Math.abs(hash)}`;
                    reviews.push({
                        id: stableId,
                        rating: rating,
                        text: reviewText,
                        author: authorName,
                        date: actualDate.toISOString(),
                        originalDate: reviewDate,
                        position: i + 1,
                        extractedAt: new Date().toISOString()
                    });
                    console.log(`[SCRAPER] Added review ${reviews.length}: "${authorName}" - ${rating}★ - "${reviewText.substring(0, 50)}..."`);
                }
            }
            console.log(`[SCRAPER] Extracted ${reviews.length} reviews`);
            return reviews;
        });
        console.log(`[Scraper-Backend] extractBasicReviews returned ${result.length} reviews`);
        return result;
    }
    extractCleanAuthorName(text) {
        if (!text || text.length === 0)
            return null;
        const cleanText = text
            .replace(/\s*ממליץ מקומי.*$/g, '')
            .replace(/\s*Local Guide.*$/gi, '')
            .replace(/\s*\d+\s*(ביקורת|ביקורות|reviews?).*$/gi, '')
            .replace(/\s*\d+\s*(תמונה|תמונות|photos?).*$/gi, '')
            .replace(/\s*·.*$/g, '')
            .replace(/\s*\|.*$/g, '')
            .trim();
        const unwantedPatterns = [
            /^(Anonymous|אלמוני)$/i,
            /כוכב|star/i,
            /לפני|ago/i,
            /Google|מדיניות|policy/i,
            /ביקורת|reviews?/i,
            /תמונה|photos?/i,
            /^\d+$/,
            /^[.,:;!?\s]+$/,
            /^(a|an|the|את|של|על|עם)\s/i
        ];
        for (const pattern of unwantedPatterns) {
            if (pattern.test(cleanText)) {
                return null;
            }
        }
        if (cleanText.length < 2 || cleanText.length > 50) {
            return null;
        }
        if (!/[\u0590-\u05FF\u0041-\u005A\u0061-\u007A]/.test(cleanText)) {
            return null;
        }
        const letterCount = (cleanText.match(/[\u0590-\u05FF\u0041-\u005A\u0061-\u007A]/g) || []).length;
        if (letterCount < cleanText.length * 0.5) {
            return null;
        }
        return cleanText;
    }
    async performAggressiveScrolling(page) {
        try {
            await page.evaluate(async () => {
                const reviewContainers = document.querySelectorAll([
                    '.m6QErb',
                    '[role="main"]',
                    '[class*="scroll"]',
                    '[class*="review"]',
                    '.section-scrollbox',
                    '.section-listbox',
                    '[data-value*="reviews"]'
                ].join(', '));
                console.log(`[SCROLL] Found ${reviewContainers.length} potential review containers`);
                for (const container of reviewContainers) {
                    const element = container;
                    if (element.scrollHeight > element.clientHeight) {
                        console.log(`[SCROLL] Scrolling container with scrollHeight: ${element.scrollHeight}, clientHeight: ${element.clientHeight}`);
                        element.scrollTop = element.scrollHeight;
                        await new Promise(resolve => setTimeout(resolve, 300));
                        for (let i = 0; i < 5; i++) {
                            element.scrollTop += 500;
                            await new Promise(resolve => setTimeout(resolve, 100));
                        }
                    }
                }
                const currentScroll = window.pageYOffset;
                const documentHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, document.body.offsetHeight, document.documentElement.offsetHeight);
                console.log(`[SCROLL] Window scroll - current: ${currentScroll}, document height: ${documentHeight}`);
                window.scrollTo(0, documentHeight);
                await new Promise(resolve => setTimeout(resolve, 400));
                document.documentElement.scrollTop = documentHeight;
                await new Promise(resolve => setTimeout(resolve, 300));
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
                    const main = document.querySelector('main') || document.body;
                    main.dispatchEvent(wheelEvent);
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
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
                try {
                    const buttons = document.querySelectorAll('button');
                    for (const button of buttons) {
                        const text = button.textContent?.toLowerCase() || '';
                        const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
                        if ((text.includes('more reviews') || text.includes('show more reviews') ||
                            ariaLabel.includes('more reviews') || ariaLabel.includes('show more reviews')) &&
                            !text.includes('help') && !text.includes('menu') && !text.includes('navigation') &&
                            !text.includes('settings') && !ariaLabel.includes('help') &&
                            !ariaLabel.includes('menu') && !ariaLabel.includes('navigation')) {
                            console.log(`[SCROLL] Found review load more button: "${button.textContent}" (aria: "${ariaLabel}")`);
                            button.click();
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            break;
                        }
                    }
                }
                catch (e) {
                    console.log('[SCROLL] Error clicking load more button:', e);
                }
            });
        }
        catch (error) {
            this.log(`Aggressive scrolling error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    deduplicateReviewsSimple(reviews) {
        const seen = new Set();
        return reviews.filter(review => {
            if (seen.has(review.id)) {
                return false;
            }
            seen.add(review.id);
            return true;
        });
    }
    async fillGapsIfNeeded(page, collections) {
        const structuredCollections = {
            newest: collections.newest || [],
            lowest: collections.lowest || [],
            highest: collections.highest || []
        };
        const currentTotal = structuredCollections.newest.length + structuredCollections.lowest.length + structuredCollections.highest.length;
        const targetTotal = 200;
        this.log(`Current total: ${currentTotal}, Target: ${targetTotal}`);
        if (currentTotal >= targetTotal) {
            this.log(`✅ Already have enough reviews (${currentTotal}), no gap filling needed`);
            return structuredCollections;
        }
        const needed = targetTotal - currentTotal;
        this.log(`🔄 Need ${needed} more reviews, collecting additional newest reviews...`);
        const existingIds = new Set();
        [...structuredCollections.newest, ...structuredCollections.lowest, ...structuredCollections.highest].forEach(review => {
            existingIds.add(createReviewId(review.author, review.text, review.rating));
        });
        await this.applySortFilter(page, 'newest');
        await page.waitForTimeout(1500);
        const additionalReviews = await this.collectAdditionalReviews(page, needed, existingIds);
        structuredCollections.newest.push(...additionalReviews);
        this.log(`✅ Added ${additionalReviews.length} additional reviews. New total: ${structuredCollections.newest.length + structuredCollections.lowest.length + structuredCollections.highest.length}`);
        return structuredCollections;
    }
    async collectAdditionalReviews(page, needed, existingReviews) {
        const additional = [];
        let attempts = 0;
        const maxAttempts = 10;
        while (additional.length < needed && attempts < maxAttempts) {
            await this.performAggressiveScrolling(page);
            await page.waitForTimeout(1000);
            const currentReviews = await this.extractBasicReviews(page);
            for (const review of currentReviews) {
                const key = createReviewId(review.author, review.text, review.rating);
                if (!existingReviews.has(key)) {
                    existingReviews.add(key);
                    additional.push(review);
                    if (additional.length >= needed)
                        break;
                }
            }
            attempts++;
        }
        return additional;
    }
    validateUrl(url) {
        return validateGoogleMapsUrl(url);
    }
    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }
}
//# sourceMappingURL=scraper.js.map