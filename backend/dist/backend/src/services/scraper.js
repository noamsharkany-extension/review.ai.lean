import puppeteer from 'puppeteer';
import { validateGoogleMapsUrl } from '../utils/urlValidator.js';
import { createReviewId } from '../utils/reviewIdUtils.js';
import { LanguageDetectionService } from './languageDetection.js';
import { ComprehensiveCollectionOrchestrator } from './comprehensiveCollectionOrchestrator.js';
import { ReviewSortNavigationService } from './reviewSortNavigationService.js';
import { EnhancedPaginationEngine } from './enhancedPaginationEngine.js';
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
        this.resourceLoadingMonitor = new GoogleMapsResourceLoadingMonitor(progressCallback, debugMode);
        this.progressiveSelectorEngine = new ProgressiveSelectorEngine(debugMode);
        this.domAnalysisService = new DOMAnalysisService(debugMode);
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
                    headless: "new",
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
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Browser launch timeout after 45 seconds')), 45000));
                this.browser = await Promise.race([browserPromise, timeoutPromise]);
                this.log('Browser launched successfully');
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
        this.log('Setting up streamlined page configuration...');
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        page.setDefaultTimeout(30000);
        page.setDefaultNavigationTimeout(30000);
        page.on('pageerror', (error) => {
            this.debugLog(`Page error: ${error.message}`);
        });
    }
    async navigateStreamlined(page, url) {
        this.log('Using streamlined navigation...');
        try {
            await page.goto(url, {
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
        this.log('🎯 Starting comprehensive review extraction: 100 newest + 100 lowest + 100 highest = 300 unique reviews');
        let page = null;
        try {
            const browser = await this.getBrowser();
            page = await browser.newPage();
            await this.setupPageStreamlined(page);
            await this.navigateStreamlined(page, googleUrl);
            await page.waitForTimeout(2000);
            const reviewCollections = {
                newest: [],
                lowest: [],
                highest: []
            };
            this.log('📋 Step 1: Accessing Reviews tab...');
            await this.clickReviewsTab(page);
            await page.waitForTimeout(2000);
            this.log('🕐 Step 2: Collecting 100 NEWEST reviews...');
            reviewCollections.newest = await this.collectReviewsBySort(page, 'newest', 100);
            this.log(`✅ Collected ${reviewCollections.newest.length} newest reviews`);
            this.log('⭐ Step 3: Collecting 100 LOWEST rated reviews...');
            reviewCollections.lowest = await this.collectReviewsBySort(page, 'lowest', 100);
            this.log(`✅ Collected ${reviewCollections.lowest.length} lowest rated reviews`);
            this.log('🌟 Step 4: Collecting 100 HIGHEST rated reviews...');
            reviewCollections.highest = await this.collectReviewsBySort(page, 'highest', 100);
            this.log(`✅ Collected ${reviewCollections.highest.length} highest rated reviews`);
            this.log('🔍 Step 5: Checking for duplicates and filling gaps...');
            const finalCollections = await this.deduplicateAndFillGaps(page, reviewCollections);
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
            await page.waitForTimeout(5000);
            let collectedReviews = [];
            let scrollAttempts = 0;
            let stableAttempts = 0;
            const maxScrollAttempts = 50;
            const maxStableAttempts = 5;
            while (collectedReviews.length < target && scrollAttempts < maxScrollAttempts && stableAttempts < maxStableAttempts) {
                const beforeCount = collectedReviews.length;
                const currentReviews = await this.extractBasicReviews(page);
                const uniqueReviews = this.deduplicateReviewsSimple(currentReviews);
                collectedReviews = uniqueReviews;
                this.log(`${sortType} - Attempt ${scrollAttempts + 1}: ${collectedReviews.length} reviews`);
                if (collectedReviews.length === beforeCount) {
                    stableAttempts++;
                    await this.performAggressiveScrolling(page);
                }
                else {
                    stableAttempts = 0;
                }
                scrollAttempts++;
                await page.waitForTimeout(500);
            }
            this.log(`📊 ${sortType} collection completed: ${collectedReviews.length} reviews`);
            return collectedReviews.slice(0, target);
        }
        catch (error) {
            this.log(`❌ Error collecting ${sortType} reviews: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return [];
        }
    }
    async applySortFilter(page, sortType) {
        try {
            this.log(`🔄 Applying ${sortType} sort filter...`);
            const sortApplied = await page.evaluate(async (sortType) => {
                let sortButton = null;
                const buttons = document.querySelectorAll('button.HQzyZ, button[data-value="Sort"], button');
                for (const button of buttons) {
                    const text = button.textContent?.trim() || '';
                    const ariaLabel = button.getAttribute('aria-label') || '';
                    if (text === 'Sort' || text.includes('Sort') ||
                        ariaLabel.includes('Sort') || ariaLabel.includes('sort') ||
                        text.includes('Most relevant') || text.includes('Newest') ||
                        text.includes('Highest rated') || text.includes('Lowest rated')) {
                        sortButton = button;
                        break;
                    }
                    if (text.includes('הרלוונטיות ביותר') || text.includes('החדשות ביותר') ||
                        text.includes('הדירוג הגבוה ביותר') || text.includes('הדירוג הנמוך ביותר')) {
                        sortButton = button;
                        break;
                    }
                }
                if (!sortButton) {
                    const hqzyzButtons = document.querySelectorAll('button.HQzyZ');
                    if (hqzyzButtons.length > 0) {
                        sortButton = hqzyzButtons[0];
                    }
                }
                if (!sortButton && hqzyzButtons.length > 0) {
                    sortButton = hqzyzButtons[0];
                }
                if (!sortButton) {
                    const buttons = document.querySelectorAll('button[data-value="Sort"], button');
                    for (const button of buttons) {
                        const text = button.textContent?.trim() || '';
                        const ariaLabel = button.getAttribute('aria-label') || '';
                        if (text === 'Sort' || text.includes('Sort') ||
                            ariaLabel.includes('Sort') || ariaLabel.includes('sort')) {
                            sortButton = button;
                            break;
                        }
                    }
                }
                if (!sortButton) {
                    console.log('No sort button found');
                    return false;
                }
                console.log(`Found sort button: "${sortButton.textContent}"`);
                sortButton.click();
                await new Promise(resolve => setTimeout(resolve, 1500));
                const targetTexts = {
                    newest: ['החדשות ביותר', 'Newest', 'Most recent', 'Latest', 'Recent'],
                    lowest: ['הדירוג הנמוך ביותר', 'Lowest rated', 'Lowest rating', 'Lowest', 'Worst rated'],
                    highest: ['הדירוג הגבוה ביותר', 'Highest rated', 'Highest rating', 'Highest', 'Best rated', 'Top rated']
                };
                const searchTexts = targetTexts[sortType];
                const fxNQSdElements = document.querySelectorAll('div.fxNQSd');
                for (const element of fxNQSdElements) {
                    const text = element.textContent?.trim() || '';
                    for (const searchText of searchTexts) {
                        if (text === searchText || (text.includes(searchText) && text.length < searchText.length + 20)) {
                            if (element.offsetParent !== null) {
                                console.log(`Clicking ${sortType} option via fxNQSd: "${text}"`);
                                element.click();
                                return true;
                            }
                        }
                    }
                }
                const sortOptions = document.querySelectorAll('[role="menuitem"], [role="option"], button, div[jsaction], span[jsaction], div');
                for (const option of sortOptions) {
                    const text = option.textContent?.trim() || '';
                    const ariaLabel = option.getAttribute('aria-label') || '';
                    for (const searchText of searchTexts) {
                        if (text.toLowerCase().includes(searchText.toLowerCase()) ||
                            ariaLabel.toLowerCase().includes(searchText.toLowerCase())) {
                            console.log(`Clicking ${sortType} option via fallback: "${text}"`);
                            option.click();
                            return true;
                        }
                    }
                }
                console.log(`No ${sortType} option found in dropdown`);
                return false;
            }, sortType);
            if (sortApplied) {
                await page.waitForTimeout(4000);
                this.log(`✅ Successfully applied ${sortType} sort filter`);
                return true;
            }
            else {
                this.log(`❌ Could not apply ${sortType} sort filter`);
                return false;
            }
        }
        catch (error) {
            this.log(`❌ Error applying ${sortType} sort filter: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return false;
        }
    }
    async extractBasicReviews(page) {
        const result = await page.evaluate(() => {
            const reviewContainers = document.querySelectorAll('.jftiEf');
            console.log(`[Scraper] Found ${reviewContainers.length} reviews using .jftiEf selector`);
            if (reviewContainers.length === 0) {
                console.log('[Scraper] No review containers found with .jftiEf selector');
                return [];
            }
            const reviews = [];
            const multilingualRatingMap = {
                'כוכב אחד': 1, 'שני כוכבים': 2, 'שלושה כוכבים': 3, 'ארבעה כוכבים': 4, 'חמישה כוכבים': 5,
                '1 כוכבים': 1, '2 כוכבים': 2, '3 כוכבים': 3, '4 כוכבים': 4, '5 כוכבים': 5,
                '1 star': 1, '2 stars': 2, '3 stars': 3, '4 stars': 4, '5 stars': 5,
                'one star': 1, 'two stars': 2, 'three stars': 3, 'four stars': 4, 'five stars': 5,
                '1 out of 5 stars': 1, '2 out of 5 stars': 2, '3 out of 5 stars': 3, '4 out of 5 stars': 4, '5 out of 5 stars': 5,
                'Rated 1 out of 5': 1, 'Rated 2 out of 5': 2, 'Rated 3 out of 5': 3, 'Rated 4 out of 5': 4, 'Rated 5 out of 5': 5
            };
            reviewContainers.forEach((container, index) => {
                try {
                    let rating = null;
                    const ratingElement = container.querySelector('[role="img"][aria-label*="כוכב"]') ||
                        container.querySelector('[role="img"][aria-label*="star"]') ||
                        container.querySelector('[role="img"][aria-label*="כוכבים"]') ||
                        container.querySelector('[role="img"][aria-label*="stars"]') ||
                        container.querySelector('span[role="img"]') ||
                        container.querySelector('[role="img"]');
                    if (ratingElement) {
                        const ariaLabel = ratingElement.getAttribute('aria-label') || '';
                        for (const [ratingText, ratingValue] of Object.entries(multilingualRatingMap)) {
                            if (ariaLabel.toLowerCase().includes(ratingText.toLowerCase())) {
                                rating = ratingValue;
                                break;
                            }
                        }
                        if (rating === null) {
                            const patterns = [
                                /(\d+)\s*(?:כוכבים?|stars?)/i,
                                /rated?\s*(\d+)/i,
                                /(\d+)\s*out\s*of\s*5/i,
                                /(\d+)/
                            ];
                            for (const pattern of patterns) {
                                const match = ariaLabel.match(pattern);
                                if (match && match[1]) {
                                    const extractedRating = parseInt(match[1]);
                                    if (extractedRating >= 1 && extractedRating <= 5) {
                                        rating = extractedRating;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    if (rating === null) {
                        const starElements = container.querySelectorAll('[data-value], .review-stars, .rating');
                        for (const starEl of starElements) {
                            const dataValue = starEl.getAttribute('data-value');
                            if (dataValue) {
                                const numValue = parseInt(dataValue);
                                if (numValue >= 1 && numValue <= 5) {
                                    rating = numValue;
                                    break;
                                }
                            }
                        }
                    }
                    const textElement = container.querySelector('.wiI7pd') ||
                        container.querySelector('.MyEned');
                    const text = textElement?.textContent?.trim();
                    const dateElement = container.querySelector('span[class*="fontBodySmall"]');
                    const dateText = dateElement?.textContent?.trim();
                    const authorElement = container.querySelector('.d4r55');
                    const author = authorElement?.textContent?.trim();
                    const uniqueId = createReviewId(author, text, rating);
                    if (rating !== null && text) {
                        reviews.push({
                            id: uniqueId,
                            rating,
                            text,
                            date: dateText || 'No date',
                            author: author || 'Anonymous',
                            position: index + 1,
                            extractedAt: new Date().toISOString()
                        });
                    }
                }
                catch (error) {
                    console.log(`Error extracting review ${index}:`, error);
                }
            });
            return reviews;
        });
        console.log(`[Scraper-Backend] extractBasicReviews returned ${result.length} reviews`);
        return result;
    }
    async performAggressiveScrolling(page) {
        try {
            await page.evaluate(async () => {
                const containers = document.querySelectorAll('.m6QErb, [role="main"], [class*="scroll"]');
                for (const container of containers) {
                    if (container.scrollHeight > container.clientHeight) {
                        container.scrollTop = container.scrollHeight;
                        await new Promise(resolve => setTimeout(resolve, 200));
                    }
                }
                window.scrollTo(0, document.body.scrollHeight);
                await new Promise(resolve => setTimeout(resolve, 300));
                const wheelEvent = new WheelEvent('wheel', {
                    deltaY: 2000,
                    bubbles: true,
                    cancelable: true
                });
                document.body.dispatchEvent(wheelEvent);
                await new Promise(resolve => setTimeout(resolve, 200));
                const keyEvent = new KeyboardEvent('keydown', {
                    key: 'PageDown',
                    code: 'PageDown',
                    bubbles: true
                });
                document.body.dispatchEvent(keyEvent);
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
    async deduplicateAndFillGaps(page, collections) {
        this.log('🔍 Deduplicating and filling gaps...');
        const allReviewsSet = new Set();
        const result = {
            newest: [],
            lowest: [],
            highest: []
        };
        for (const review of collections.newest) {
            const key = createReviewId(review.author, review.text, review.rating);
            if (!allReviewsSet.has(key)) {
                allReviewsSet.add(key);
                result.newest.push(review);
            }
        }
        for (const review of collections.lowest) {
            const key = createReviewId(review.author, review.text, review.rating);
            if (!allReviewsSet.has(key)) {
                allReviewsSet.add(key);
                result.lowest.push(review);
            }
        }
        for (const review of collections.highest) {
            const key = createReviewId(review.author, review.text, review.rating);
            if (!allReviewsSet.has(key)) {
                allReviewsSet.add(key);
                result.highest.push(review);
            }
        }
        this.log(`After deduplication: Newest: ${result.newest.length}, Lowest: ${result.lowest.length}, Highest: ${result.highest.length}`);
        const totalNeeded = 300 - (result.newest.length + result.lowest.length + result.highest.length);
        if (totalNeeded > 0) {
            this.log(`🔄 Need ${totalNeeded} more reviews, collecting additional newest reviews...`);
            await this.applySortFilter(page, 'newest');
            await page.waitForTimeout(1500);
            const additionalReviews = await this.collectAdditionalReviews(page, totalNeeded, allReviewsSet);
            result.newest.push(...additionalReviews);
            this.log(`Added ${additionalReviews.length} additional newest reviews`);
        }
        return result;
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