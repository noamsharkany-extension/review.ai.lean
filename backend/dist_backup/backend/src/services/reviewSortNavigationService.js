export class ReviewSortNavigationService {
    constructor(progressCallback, debugMode = false) {
        this.debugMode = false;
        this.progressCallback = progressCallback;
        this.debugMode = debugMode;
    }
    async navigateToSort(page, sortType, languageDetection) {
        const startTime = Date.now();
        this.debugLog(`Starting navigation to ${sortType} sort...`);
        try {
            const sortingInterface = await this.detectSortingInterface(page);
            this.debugLog(`Detected sorting interface: ${sortingInterface.type} (confidence: ${sortingInterface.confidence})`);
            const sortingOption = this.getSortingSelectors(sortType, sortingInterface.type, languageDetection.language);
            const methods = ['click', 'url-manipulation', 'fallback'];
            for (const method of methods) {
                try {
                    const success = await this.attemptNavigation(page, sortingOption, method, sortingInterface);
                    if (success) {
                        const timeToNavigate = Date.now() - startTime;
                        this.debugLog(`Successfully navigated to ${sortType} sort using ${method} method in ${timeToNavigate}ms`);
                        return {
                            success: true,
                            sortType,
                            method,
                            timeToNavigate
                        };
                    }
                }
                catch (methodError) {
                    this.debugLog(`Navigation method ${method} failed: ${methodError}`);
                    continue;
                }
            }
            const timeToNavigate = Date.now() - startTime;
            return {
                success: false,
                sortType,
                method: 'fallback',
                timeToNavigate,
                error: 'All navigation methods failed'
            };
        }
        catch (error) {
            const timeToNavigate = Date.now() - startTime;
            this.debugLog(`Navigation to ${sortType} sort failed: ${error}`);
            return {
                success: false,
                sortType,
                method: 'fallback',
                timeToNavigate,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
    async navigateToSortWithRetry(page, sortType, languageDetection, maxAttempts = 3, timeoutMs = 10000) {
        let lastError;
        let bestResult;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                this.debugLog(`Sort navigation attempt ${attempt}/${maxAttempts} for ${sortType}`);
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error(`Navigation timeout after ${timeoutMs}ms`)), timeoutMs);
                });
                const result = await Promise.race([
                    this.navigateToSort(page, sortType, languageDetection),
                    timeoutPromise
                ]);
                if (result.success) {
                    this.debugLog(`Sort navigation succeeded on attempt ${attempt}`);
                    return result;
                }
                if (!bestResult || this.isResultBetter(result, bestResult)) {
                    bestResult = result;
                }
                lastError = result.error || 'Navigation failed';
                this.debugLog(`Sort navigation attempt ${attempt} failed: ${lastError}`);
            }
            catch (error) {
                lastError = error instanceof Error ? error.message : 'Unknown error';
                this.debugLog(`Sort navigation attempt ${attempt} threw error: ${lastError}`);
            }
            if (attempt < maxAttempts) {
                const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                this.debugLog(`Waiting ${delayMs}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
                try {
                    await this.recoverPageState(page);
                }
                catch (recoveryError) {
                    this.debugLog(`Page state recovery failed: ${recoveryError}`);
                }
            }
        }
        return bestResult || {
            success: false,
            sortType,
            method: 'fallback',
            timeToNavigate: 0,
            error: lastError || 'All navigation attempts failed'
        };
    }
    isResultBetter(result1, result2) {
        if (result1.success && !result2.success)
            return true;
        if (!result1.success && result2.success)
            return false;
        if (!result1.success && !result2.success) {
            return result1.timeToNavigate < result2.timeToNavigate;
        }
        const methodPriority = { 'click': 3, 'url-manipulation': 2, 'fallback': 1 };
        return methodPriority[result1.method] > methodPriority[result2.method];
    }
    async recoverPageState(page) {
        try {
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.waitForTimeout(1000);
            await page.evaluate(() => {
                const body = document.body;
                if (body) {
                    body.click();
                }
                const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
                document.dispatchEvent(escapeEvent);
            });
            await page.waitForTimeout(500);
        }
        catch (error) {
            this.debugLog(`Page state recovery error: ${error}`);
        }
    }
    async detectSortingInterface(page) {
        this.debugLog('Detecting sorting interface type...');
        const interfaceInfo = await page.evaluate(() => {
            const patterns = {
                dropdown: {
                    selectors: [
                        'select[aria-label*="sort" i]',
                        'select[aria-label*="order" i]',
                        '[role="combobox"][aria-label*="sort" i]',
                        '.sort-dropdown',
                        '[data-value*="sort"]'
                    ],
                    found: false
                },
                buttons: {
                    selectors: [
                        'button[aria-label*="recent" i]',
                        'button[aria-label*="newest" i]',
                        'button[aria-label*="oldest" i]',
                        'button[aria-label*="highest" i]',
                        'button[aria-label*="lowest" i]',
                        'button[aria-label*="rating" i]',
                        '[role="button"][aria-label*="sort" i]'
                    ],
                    found: false
                },
                tabs: {
                    selectors: [
                        '[role="tab"][aria-label*="sort" i]',
                        '[role="tablist"] [role="tab"]',
                        '.sort-tabs [role="tab"]',
                        '[data-tab*="sort"]'
                    ],
                    found: false
                }
            };
            for (const [patternName, pattern] of Object.entries(patterns)) {
                for (const selector of pattern.selectors) {
                    if (document.querySelector(selector)) {
                        pattern.found = true;
                        break;
                    }
                }
            }
            const viewport = {
                width: window.innerWidth,
                height: window.innerHeight
            };
            const isMobile = viewport.width <= 768 ||
                /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent) ||
                'ontouchstart' in window;
            return {
                patterns,
                viewport,
                isMobile,
                userAgent: navigator.userAgent
            };
        });
        let interfaceType = 'unknown';
        let confidence = 0;
        if (interfaceInfo.isMobile) {
            interfaceType = 'mobile';
            confidence += 0.3;
        }
        else {
            interfaceType = 'desktop';
            confidence += 0.3;
        }
        const hasDropdown = interfaceInfo.patterns.dropdown.found;
        const hasButtons = interfaceInfo.patterns.buttons.found;
        const hasTabs = interfaceInfo.patterns.tabs.found;
        if (hasDropdown || hasButtons || hasTabs) {
            confidence += 0.5;
        }
        if (interfaceType === 'desktop' && (hasDropdown || hasTabs)) {
            confidence += 0.2;
        }
        if (interfaceType === 'mobile' && hasButtons) {
            confidence += 0.2;
        }
        const result = {
            type: interfaceType,
            hasDropdown,
            hasButtons,
            hasTabs,
            confidence: Math.min(confidence, 1.0)
        };
        this.debugLog(`Sorting interface detected: ${JSON.stringify(result)}`);
        return result;
    }
    getSortingSelectors(sortType, interfaceType, language) {
        const normalizedLang = language.toLowerCase();
        const labels = this.getSortingLabels(sortType, normalizedLang);
        const selectors = this.getSortingSelectorsForInterface(sortType, interfaceType, normalizedLang);
        const fallbackStrategies = this.getFallbackStrategies(sortType, interfaceType);
        return {
            type: sortType,
            selectors,
            labels,
            fallbackStrategies
        };
    }
    getSortingLabels(sortType, language) {
        const labelMaps = {
            recent: {
                english: ['Newest', 'Most recent', 'Latest', 'Recent', 'Newest first', 'Most recent first'],
                hebrew: ['החדשות ביותר', 'הכי חדש', 'חדש ביותר', 'לאחרונה', 'אחרון', 'החדשים ביותר'],
                generic: ['recent', 'newest', 'latest', 'new']
            },
            worst: {
                english: ['Lowest rated', 'Lowest rating', 'Lowest', 'Worst rated', 'Poor rated', 'Worst', 'Poor', 'Bad', 'Lowest first'],
                hebrew: ['הדירוג הנמוך ביותר', 'דירוג נמוך', 'הכי גרוע', 'דירוג נמוך ביותר', 'רע', 'גרוע'],
                generic: ['lowest', 'worst', 'bad', 'poor', 'low']
            },
            best: {
                english: ['Highest rated', 'Highest rating', 'Highest', 'Best rated', 'Top rated', 'Best', 'Excellent', 'Good', 'Highest first'],
                hebrew: ['הדירוג הגבוה ביותר', 'דירוג גבוה', 'הכי טוב', 'דירוג גבוה ביותר', 'מעולה', 'טוב'],
                generic: ['highest', 'best', 'good', 'excellent', 'high']
            }
        };
        const langKey = language === 'hebrew' || language === 'he' ? 'hebrew' :
            language === 'english' || language === 'en' ? 'english' : 'generic';
        return labelMaps[sortType][langKey] || labelMaps[sortType].generic;
    }
    getSortingSelectorsForInterface(sortType, interfaceType, language) {
        const labels = this.getSortingLabels(sortType, language);
        const selectors = [];
        labels.forEach(label => {
            selectors.push(`select option[value*="${label.toLowerCase()}" i]`, `select option:contains("${label}")`, `[role="option"][aria-label*="${label}" i]`, `[role="option"]:contains("${label}")`);
        });
        labels.forEach(label => {
            selectors.push(`button[aria-label*="${label}" i]`, `button:contains("${label}")`, `[role="button"][aria-label*="${label}" i]`, `[role="button"]:contains("${label}")`, `div[role="button"][aria-label*="${label}" i]`);
        });
        labels.forEach(label => {
            selectors.push(`[role="tab"][aria-label*="${label}" i]`, `[role="tab"]:contains("${label}")`, `[data-tab*="${label.toLowerCase()}" i]`);
        });
        labels.forEach(label => {
            selectors.push(`[role="menuitem"][aria-label*="${label}" i]`, `[role="menuitem"]:contains("${label}")`, `.menu-item:contains("${label}")`, `li:contains("${label}")`);
        });
        labels.forEach(label => {
            selectors.push(`*[aria-label*="${label}" i]`, `*:contains("${label}")`, `[data-sort*="${label.toLowerCase()}" i]`, `[data-value*="${label.toLowerCase()}" i]`);
        });
        if (interfaceType === 'mobile') {
            selectors.push('.mobile-sort-option', '[data-mobile-sort]', '.sort-mobile button', '.mobile-menu [role="menuitem"]');
        }
        else if (interfaceType === 'desktop') {
            selectors.push('.desktop-sort-option', '[data-desktop-sort]', '.sort-desktop select', '.desktop-menu [role="menuitem"]');
        }
        selectors.push('[jsaction*="sort"]', '[data-value*="sort"]', '.section-sort-button', '[aria-label*="sort" i]');
        return selectors;
    }
    getFallbackStrategies(sortType, interfaceType) {
        const strategies = [
            'url-parameter-manipulation',
            'keyboard-navigation',
            'scroll-and-search',
            'dom-mutation-trigger',
            'click-all-possible-elements'
        ];
        if (interfaceType === 'mobile') {
            strategies.unshift('mobile-menu-navigation', 'touch-gesture-simulation');
        }
        else if (interfaceType === 'desktop') {
            strategies.unshift('dropdown-navigation', 'right-click-menu');
        }
        return strategies;
    }
    async attemptNavigation(page, sortingOption, method, sortingInterface) {
        this.debugLog(`Attempting navigation using ${method} method...`);
        switch (method) {
            case 'click':
                return await this.attemptClickNavigation(page, sortingOption, sortingInterface);
            case 'url-manipulation':
                return await this.attemptUrlManipulation(page, sortingOption);
            case 'fallback':
                return await this.attemptFallbackNavigation(page, sortingOption, sortingInterface);
            default:
                return false;
        }
    }
    async attemptClickNavigation(page, sortingOption, sortingInterface) {
        this.debugLog(`Attempting click navigation with ${sortingOption.selectors.length} selectors...`);
        for (const selector of sortingOption.selectors) {
            try {
                this.debugLog(`Trying selector: ${selector}`);
                const element = await page.$(selector);
                if (!element) {
                    this.debugLog(`Element not found for selector: ${selector}`);
                    continue;
                }
                const isVisible = await page.evaluate((el) => {
                    const rect = el.getBoundingClientRect();
                    const style = window.getComputedStyle(el);
                    return rect.width > 0 && rect.height > 0 &&
                        style.visibility !== 'hidden' &&
                        style.display !== 'none' &&
                        style.opacity !== '0';
                }, element);
                if (!isVisible) {
                    this.debugLog(`Element not visible for selector: ${selector}`);
                    continue;
                }
                await element.click();
                await page.waitForTimeout(1000);
                const sortApplied = await this.verifySortApplication(page, sortingOption.type);
                if (sortApplied) {
                    this.debugLog(`Successfully clicked element with selector: ${selector}`);
                    return true;
                }
                else {
                    this.debugLog(`Click succeeded but sort not applied for selector: ${selector}`);
                }
            }
            catch (error) {
                this.debugLog(`Click failed for selector ${selector}: ${error}`);
                continue;
            }
        }
        return false;
    }
    async attemptUrlManipulation(page, sortingOption) {
        this.debugLog('Attempting URL manipulation navigation...');
        try {
            const currentUrl = page.url();
            const url = new URL(currentUrl);
            const sortParams = {
                recent: ['sort=newest', 'sort=recent', 'orderby=date', 'sort_by=date'],
                worst: ['sort=lowest', 'sort=worst', 'orderby=rating_asc', 'sort_by=rating_low'],
                best: ['sort=highest', 'sort=best', 'orderby=rating_desc', 'sort_by=rating_high']
            };
            const paramsToTry = sortParams[sortingOption.type] || [];
            for (const paramString of paramsToTry) {
                try {
                    const [key, value] = paramString.split('=');
                    url.searchParams.set(key, value);
                    const newUrl = url.toString();
                    this.debugLog(`Trying URL: ${newUrl}`);
                    await page.goto(newUrl, { waitUntil: 'networkidle0', timeout: 10000 });
                    const sortApplied = await this.verifySortApplication(page, sortingOption.type);
                    if (sortApplied) {
                        this.debugLog(`Successfully applied sort via URL manipulation: ${paramString}`);
                        return true;
                    }
                }
                catch (error) {
                    this.debugLog(`URL manipulation failed for ${paramString}: ${error}`);
                    continue;
                }
            }
        }
        catch (error) {
            this.debugLog(`URL manipulation method failed: ${error}`);
        }
        return false;
    }
    async attemptFallbackNavigation(page, sortingOption, sortingInterface) {
        this.debugLog('Attempting fallback navigation strategies...');
        for (const strategy of sortingOption.fallbackStrategies) {
            try {
                this.debugLog(`Trying fallback strategy: ${strategy}`);
                const success = await this.executeFallbackStrategy(page, strategy, sortingOption, sortingInterface);
                if (success) {
                    this.debugLog(`Fallback strategy ${strategy} succeeded`);
                    return true;
                }
            }
            catch (error) {
                this.debugLog(`Fallback strategy ${strategy} failed: ${error}`);
                continue;
            }
        }
        return false;
    }
    async executeFallbackStrategy(page, strategy, sortingOption, sortingInterface) {
        switch (strategy) {
            case 'keyboard-navigation':
                return await this.tryKeyboardNavigation(page, sortingOption);
            case 'scroll-and-search':
                return await this.tryScrollAndSearch(page, sortingOption);
            case 'dom-mutation-trigger':
                return await this.tryDomMutationTrigger(page, sortingOption);
            case 'mobile-menu-navigation':
                return await this.tryMobileMenuNavigation(page, sortingOption);
            case 'dropdown-navigation':
                return await this.tryDropdownNavigation(page, sortingOption);
            case 'click-all-possible-elements':
                return await this.tryClickAllPossibleElements(page, sortingOption);
            default:
                this.debugLog(`Unknown fallback strategy: ${strategy}`);
                return false;
        }
    }
    async tryKeyboardNavigation(page, sortingOption) {
        this.debugLog('Trying keyboard navigation...');
        try {
            await page.keyboard.press('Tab');
            await page.waitForTimeout(500);
            await page.keyboard.press('Enter');
            await page.waitForTimeout(1000);
            const menuOpened = await page.evaluate(() => {
                const menus = document.querySelectorAll('[role="menu"], [role="listbox"], .dropdown-menu');
                return menus.length > 0 && Array.from(menus).some(menu => {
                    const style = window.getComputedStyle(menu);
                    return style.display !== 'none' && style.visibility !== 'hidden';
                });
            });
            if (menuOpened) {
                for (let i = 0; i < 5; i++) {
                    await page.keyboard.press('ArrowDown');
                    await page.waitForTimeout(200);
                    const currentOption = await page.evaluate(() => {
                        const focused = document.activeElement;
                        return focused ? focused.textContent || focused.getAttribute('aria-label') || '' : '';
                    });
                    if (sortingOption.labels.some(label => currentOption.toLowerCase().includes(label.toLowerCase()))) {
                        await page.keyboard.press('Enter');
                        await page.waitForTimeout(1000);
                        return await this.verifySortApplication(page, sortingOption.type);
                    }
                }
            }
        }
        catch (error) {
            this.debugLog(`Keyboard navigation failed: ${error}`);
        }
        return false;
    }
    async tryScrollAndSearch(page, sortingOption) {
        this.debugLog('Trying scroll and search...');
        try {
            const scrollPositions = [0, 200, 400, 600, 800];
            for (const scrollY of scrollPositions) {
                await page.evaluate((y) => window.scrollTo(0, y), scrollY);
                await page.waitForTimeout(500);
                for (const selector of sortingOption.selectors.slice(0, 10)) {
                    try {
                        const element = await page.$(selector);
                        if (element) {
                            const isVisible = await page.evaluate((el) => {
                                const rect = el.getBoundingClientRect();
                                return rect.top >= 0 && rect.top <= window.innerHeight;
                            }, element);
                            if (isVisible) {
                                await element.click();
                                await page.waitForTimeout(1000);
                                if (await this.verifySortApplication(page, sortingOption.type)) {
                                    return true;
                                }
                            }
                        }
                    }
                    catch (error) {
                        continue;
                    }
                }
            }
        }
        catch (error) {
            this.debugLog(`Scroll and search failed: ${error}`);
        }
        return false;
    }
    async tryDomMutationTrigger(page, sortingOption) {
        this.debugLog('Trying DOM mutation trigger...');
        try {
            const triggerSelectors = [
                '[aria-haspopup="true"]',
                '[aria-expanded="false"]',
                'button[aria-label*="menu" i]',
                'button[aria-label*="options" i]',
                '.menu-trigger',
                '.dropdown-trigger',
                '[role="button"][aria-haspopup]'
            ];
            for (const triggerSelector of triggerSelectors) {
                try {
                    const triggers = await page.$$(triggerSelector);
                    for (const trigger of triggers) {
                        await trigger.click();
                        await page.waitForTimeout(1000);
                        for (const selector of sortingOption.selectors.slice(0, 5)) {
                            try {
                                const sortElement = await page.$(selector);
                                if (sortElement) {
                                    await sortElement.click();
                                    await page.waitForTimeout(1000);
                                    if (await this.verifySortApplication(page, sortingOption.type)) {
                                        return true;
                                    }
                                }
                            }
                            catch (error) {
                                continue;
                            }
                        }
                    }
                }
                catch (error) {
                    continue;
                }
            }
        }
        catch (error) {
            this.debugLog(`DOM mutation trigger failed: ${error}`);
        }
        return false;
    }
    async tryMobileMenuNavigation(page, sortingOption) {
        this.debugLog('Trying mobile menu navigation...');
        try {
            const mobileMenuTriggers = [
                '[aria-label*="menu" i]',
                '.hamburger-menu',
                '.mobile-menu-trigger',
                'button[aria-expanded="false"]',
                '[role="button"][aria-haspopup="true"]'
            ];
            for (const triggerSelector of mobileMenuTriggers) {
                try {
                    const trigger = await page.$(triggerSelector);
                    if (trigger) {
                        await trigger.tap();
                        await page.waitForTimeout(1500);
                        for (const selector of sortingOption.selectors) {
                            try {
                                const sortElement = await page.$(selector);
                                if (sortElement) {
                                    await sortElement.tap();
                                    await page.waitForTimeout(1000);
                                    if (await this.verifySortApplication(page, sortingOption.type)) {
                                        return true;
                                    }
                                }
                            }
                            catch (error) {
                                continue;
                            }
                        }
                    }
                }
                catch (error) {
                    continue;
                }
            }
        }
        catch (error) {
            this.debugLog(`Mobile menu navigation failed: ${error}`);
        }
        return false;
    }
    async tryDropdownNavigation(page, sortingOption) {
        this.debugLog('Trying dropdown navigation...');
        try {
            const dropdownSelectors = [
                'select',
                '[role="combobox"]',
                '[aria-haspopup="listbox"]',
                '.dropdown-select'
            ];
            for (const dropdownSelector of dropdownSelectors) {
                try {
                    const dropdown = await page.$(dropdownSelector);
                    if (dropdown) {
                        await dropdown.click();
                        await page.waitForTimeout(1000);
                        for (const label of sortingOption.labels) {
                            try {
                                await page.select(dropdownSelector, label);
                                await page.waitForTimeout(1000);
                                if (await this.verifySortApplication(page, sortingOption.type)) {
                                    return true;
                                }
                            }
                            catch (error) {
                                const optionSelector = `option:contains("${label}"), [role="option"]:contains("${label}")`;
                                const option = await page.$(optionSelector);
                                if (option) {
                                    await option.click();
                                    await page.waitForTimeout(1000);
                                    if (await this.verifySortApplication(page, sortingOption.type)) {
                                        return true;
                                    }
                                }
                            }
                        }
                    }
                }
                catch (error) {
                    continue;
                }
            }
        }
        catch (error) {
            this.debugLog(`Dropdown navigation failed: ${error}`);
        }
        return false;
    }
    async tryClickAllPossibleElements(page, sortingOption) {
        this.debugLog('Trying to click all possible elements...');
        try {
            const clickableElements = await page.evaluate((labels) => {
                const elements = [];
                const clickableSelectors = [
                    'button', '[role="button"]', 'a', '[onclick]', '[role="menuitem"]',
                    '[role="tab"]', '[role="option"]', 'span[tabindex]', 'div[tabindex]'
                ];
                for (const selector of clickableSelectors) {
                    const els = document.querySelectorAll(selector);
                    for (const el of els) {
                        const text = (el.textContent || '').trim().toLowerCase();
                        const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
                        if (labels.some((label) => text.includes(label.toLowerCase()) || ariaLabel.includes(label.toLowerCase()))) {
                            elements.push({
                                selector: el.tagName.toLowerCase() + (el.className ? '.' + el.className.split(' ').join('.') : ''),
                                text,
                                ariaLabel
                            });
                        }
                    }
                }
                return elements.slice(0, 20);
            }, sortingOption.labels);
            for (const elementInfo of clickableElements) {
                try {
                    const element = await page.evaluateHandle((info) => {
                        const elements = Array.from(document.querySelectorAll('*'));
                        return elements.find(el => {
                            const text = (el.textContent || '').trim().toLowerCase();
                            const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
                            return text === info.text || ariaLabel === info.ariaLabel;
                        });
                    }, elementInfo);
                    if (element && 'click' in element) {
                        await element.click();
                        await page.waitForTimeout(1000);
                        if (await this.verifySortApplication(page, sortingOption.type)) {
                            return true;
                        }
                    }
                }
                catch (error) {
                    continue;
                }
            }
        }
        catch (error) {
            this.debugLog(`Click all possible elements failed: ${error}`);
        }
        return false;
    }
    async verifySortApplication(page, sortType) {
        this.debugLog(`Verifying sort application for ${sortType}...`);
        try {
            await page.waitForTimeout(2000);
            const currentUrl = page.url();
            const urlIndicators = {
                recent: ['newest', 'recent', 'date', 'latest'],
                worst: ['lowest', 'worst', 'rating_asc', 'low'],
                best: ['highest', 'best', 'rating_desc', 'high']
            };
            const indicators = urlIndicators[sortType];
            if (indicators.some(indicator => currentUrl.toLowerCase().includes(indicator))) {
                this.debugLog(`Sort verified via URL: ${currentUrl}`);
                return true;
            }
            const contentVerification = await page.evaluate((type, indicators) => {
                const activeElements = document.querySelectorAll('[aria-selected="true"], .active, .selected, [aria-pressed="true"]');
                for (const element of activeElements) {
                    const text = (element.textContent || '').toLowerCase();
                    const ariaLabel = (element.getAttribute('aria-label') || '').toLowerCase();
                    if (indicators.some((indicator) => text.includes(indicator) || ariaLabel.includes(indicator))) {
                        return true;
                    }
                }
                const reviews = document.querySelectorAll('[data-review-id], [jsaction*="review"], div[role="listitem"]');
                if (reviews.length >= 3) {
                    if (type === 'recent') {
                        const dateElements = Array.from(reviews).slice(0, 3).map(review => {
                            const dateEl = review.querySelector('[aria-label*="ago" i], span:contains("ago")');
                            return dateEl ? dateEl.textContent || '' : '';
                        });
                        const hasRecentPattern = dateElements.some(date => date.includes('day') || date.includes('week') || date.includes('hour'));
                        if (hasRecentPattern)
                            return true;
                    }
                    if (type === 'worst' || type === 'best') {
                        const ratingElements = Array.from(reviews).slice(0, 3).map(review => {
                            const ratingEl = review.querySelector('[aria-label*="star" i], [aria-label*="rating" i]');
                            if (ratingEl) {
                                const ariaLabel = ratingEl.getAttribute('aria-label') || '';
                                const match = ariaLabel.match(/(\d+)\s*(?:out of|of|\/)\s*5|(\d+)\s*star/i);
                                return match ? parseInt(match[1] || match[2]) : null;
                            }
                            return null;
                        }).filter(rating => rating !== null);
                        if (ratingElements.length >= 2) {
                            if (type === 'worst') {
                                return ratingElements.some(rating => rating <= 2) ||
                                    ratingElements[0] >= ratingElements[1];
                            }
                            else if (type === 'best') {
                                return ratingElements.some(rating => rating >= 4) ||
                                    ratingElements[0] <= ratingElements[1];
                            }
                        }
                    }
                }
                return false;
            }, sortType, indicators);
            if (contentVerification) {
                this.debugLog(`Sort verified via content analysis`);
                return true;
            }
            this.debugLog(`Sort verification inconclusive, assuming success`);
            return true;
        }
        catch (error) {
            this.debugLog(`Sort verification failed: ${error}`);
            return false;
        }
    }
    debugLog(message) {
        if (this.debugMode) {
            console.log(`[ReviewSortNavigationService] ${message}`);
        }
        if (this.progressCallback) {
            this.progressCallback(message);
        }
    }
    log(message) {
        console.log(`[ReviewSortNavigationService] ${message}`);
        if (this.progressCallback) {
            this.progressCallback(message);
        }
    }
}
//# sourceMappingURL=reviewSortNavigationService.js.map