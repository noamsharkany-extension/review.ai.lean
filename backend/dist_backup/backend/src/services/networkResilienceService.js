export class NetworkResilienceService {
    constructor(progressCallback, debugMode = false) {
        this.DEFAULT_RETRY_CONFIG = {
            maxRetries: 3,
            baseDelayMs: 1000,
            maxDelayMs: 10000,
            backoffMultiplier: 2,
            timeoutMs: 30000
        };
        this.TIMEOUT_CONFIGS = {
            navigation: 60000,
            resourceLoading: 30000,
            dynamicContent: 45000,
            extraction: 30000
        };
        this.progressCallback = progressCallback;
        this.debugMode = debugMode;
    }
    log(message) {
        if (this.debugMode) {
            console.log(`[NetworkResilience] ${message}`);
        }
        this.progressCallback?.(message);
    }
    async executeWithRetry(operation, config = {}, operationName = 'operation') {
        const finalConfig = { ...this.DEFAULT_RETRY_CONFIG, ...config };
        const startTime = Date.now();
        let lastError = null;
        let attempts = 0;
        this.log(`Starting ${operationName} with retry logic (max ${finalConfig.maxRetries} attempts)`);
        const maxAttempts = finalConfig.maxRetries + 1;
        while (attempts < maxAttempts) {
            attempts++;
            const attemptStartTime = Date.now();
            try {
                this.log(`${operationName} attempt ${attempts}/${maxAttempts}`);
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => {
                        reject(new Error(`${operationName} timeout after ${finalConfig.timeoutMs}ms (attempt ${attempts})`));
                    }, finalConfig.timeoutMs);
                });
                const result = await Promise.race([operation(), timeoutPromise]);
                const attemptTime = Date.now() - attemptStartTime;
                const totalTime = Date.now() - startTime;
                this.log(`${operationName} succeeded on attempt ${attempts} (${attemptTime}ms)`);
                return {
                    success: true,
                    data: result,
                    attempts,
                    totalTimeMs: totalTime,
                    partialContent: false
                };
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                const attemptTime = Date.now() - attemptStartTime;
                this.log(`${operationName} failed on attempt ${attempts}: ${lastError.message} (${attemptTime}ms)`);
                if (!this.isRetryableError(lastError) || attempts >= maxAttempts) {
                    break;
                }
                const delay = Math.min(finalConfig.baseDelayMs * Math.pow(finalConfig.backoffMultiplier, attempts - 1), finalConfig.maxDelayMs);
                this.log(`Retrying ${operationName} in ${delay}ms...`);
                await this.delay(delay);
            }
        }
        const totalTime = Date.now() - startTime;
        this.log(`${operationName} failed after ${attempts} attempts (${totalTime}ms)`);
        return {
            success: false,
            error: lastError || new Error(`${operationName} failed after ${attempts} attempts`),
            attempts,
            totalTimeMs: totalTime,
            partialContent: false
        };
    }
    async waitForDynamicContent(page, contentSelector, options = {}) {
        const { timeout = this.TIMEOUT_CONFIGS.dynamicContent, checkInterval = 1000, minElements = 1, allowPartialContent = true } = options;
        const selectors = Array.isArray(contentSelector) ? contentSelector : [contentSelector];
        const startTime = Date.now();
        let lastElementCount = 0;
        let stableCount = 0;
        const requiredStableChecks = 3;
        this.log(`Waiting for dynamic content to load (timeout: ${timeout}ms)`);
        this.log(`Selectors: ${selectors.join(', ')}`);
        while (Date.now() - startTime < timeout) {
            try {
                const contentStatus = await page.evaluate((sels, minElems) => {
                    let totalElements = 0;
                    const foundSelectors = [];
                    const missingSelectors = [];
                    for (const selector of sels) {
                        try {
                            const elements = document.querySelectorAll(selector);
                            if (elements.length > 0) {
                                totalElements += elements.length;
                                foundSelectors.push(selector);
                            }
                            else {
                                missingSelectors.push(selector);
                            }
                        }
                        catch (error) {
                            missingSelectors.push(selector);
                        }
                    }
                    return {
                        totalElements,
                        foundSelectors,
                        missingSelectors,
                        hasMinimumContent: totalElements >= minElems,
                        hasAnyContent: totalElements > 0
                    };
                }, selectors, minElements);
                if (contentStatus.totalElements === lastElementCount) {
                    stableCount++;
                }
                else {
                    stableCount = 0;
                    lastElementCount = contentStatus.totalElements;
                }
                if (contentStatus.hasMinimumContent && stableCount >= requiredStableChecks) {
                    this.log(`Dynamic content loaded successfully (${contentStatus.totalElements} elements)`);
                    return {
                        isComplete: true,
                        hasPartialContent: false,
                        loadingProgress: 1.0,
                        missingResources: contentStatus.missingSelectors,
                        criticalResourcesLoaded: true
                    };
                }
                if (allowPartialContent && contentStatus.hasAnyContent && stableCount >= requiredStableChecks) {
                    const progress = Math.min(contentStatus.totalElements / minElements, 1.0);
                    if (progress >= 0.5) {
                        this.log(`Partial dynamic content detected (${contentStatus.totalElements} elements, ${(progress * 100).toFixed(1)}% complete)`);
                        return {
                            isComplete: false,
                            hasPartialContent: true,
                            loadingProgress: progress,
                            missingResources: contentStatus.missingSelectors,
                            criticalResourcesLoaded: progress >= 0.7
                        };
                    }
                }
                this.log(`Waiting for content... (${contentStatus.totalElements} elements found, stable: ${stableCount}/${requiredStableChecks})`);
                await this.delay(checkInterval);
            }
            catch (error) {
                this.log(`Error checking dynamic content: ${error}`);
                await this.delay(checkInterval);
            }
        }
        const finalStatus = await page.evaluate((sels) => {
            let totalElements = 0;
            const missingSelectors = [];
            for (const selector of sels) {
                try {
                    const elements = document.querySelectorAll(selector);
                    totalElements += elements.length;
                    if (elements.length === 0) {
                        missingSelectors.push(selector);
                    }
                }
                catch (error) {
                    missingSelectors.push(selector);
                }
            }
            return { totalElements, missingSelectors };
        }, selectors);
        const hasPartialContent = finalStatus.totalElements > 0;
        const progress = Math.min(finalStatus.totalElements / minElements, 1.0);
        this.log(`Dynamic content loading timeout (${finalStatus.totalElements} elements found)`);
        return {
            isComplete: false,
            hasPartialContent,
            loadingProgress: progress,
            missingResources: finalStatus.missingSelectors,
            criticalResourcesLoaded: progress >= 0.3
        };
    }
    async extractPartialContent(page, extractionFunction, fallbackSelectors = []) {
        this.log('Attempting partial content extraction...');
        try {
            const mainResults = await extractionFunction(page);
            if (mainResults.length > 0) {
                this.log(`Main extraction successful: ${mainResults.length} items`);
                return {
                    reviews: mainResults,
                    extractionQuality: 'complete',
                    missingElements: [],
                    confidence: 1.0
                };
            }
            this.log('Main extraction returned no results, trying fallback extraction...');
            const fallbackResults = await this.extractWithFallbackSelectors(page, fallbackSelectors);
            if (fallbackResults.length > 0) {
                this.log(`Fallback extraction successful: ${fallbackResults.length} items`);
                return {
                    reviews: fallbackResults,
                    extractionQuality: 'partial',
                    missingElements: [],
                    confidence: 0.7
                };
            }
            this.log('Fallback extraction failed, trying minimal extraction...');
            const minimalResults = await this.extractMinimalContent(page);
            if (minimalResults.length > 0) {
                return {
                    reviews: minimalResults,
                    extractionQuality: 'minimal',
                    missingElements: fallbackSelectors,
                    confidence: 0.3
                };
            }
            this.log('Minimal extraction failed, trying emergency extraction...');
            const emergencyResults = await this.extractEmergencyContent(page);
            return {
                reviews: emergencyResults,
                extractionQuality: 'minimal',
                missingElements: fallbackSelectors,
                confidence: emergencyResults.length > 0 ? 0.2 : 0.0
            };
        }
        catch (error) {
            this.log(`Partial content extraction error: ${error}`);
            const emergencyResults = await this.extractEmergencyContent(page);
            return {
                reviews: emergencyResults,
                extractionQuality: 'minimal',
                missingElements: fallbackSelectors,
                confidence: emergencyResults.length > 0 ? 0.2 : 0.0
            };
        }
    }
    async handleResourceLoadingFailures(page, operation, resourceTypes = ['stylesheet', 'script', 'font']) {
        const failedResources = [];
        let degradedMode = false;
        const requestFailedHandler = (request) => {
            const resourceType = request.resourceType();
            if (resourceTypes.includes(resourceType)) {
                failedResources.push(request.url());
                this.log(`Resource loading failed: ${request.url()} (${resourceType})`);
            }
        };
        const responseHandler = (response) => {
            if (!response.ok()) {
                const resourceType = response.request().resourceType();
                if (resourceTypes.includes(resourceType)) {
                    failedResources.push(response.url());
                    this.log(`Resource response failed: ${response.url()} (${response.status()})`);
                }
            }
        };
        page.on('requestfailed', requestFailedHandler);
        page.on('response', responseHandler);
        try {
            const result = await operation();
            degradedMode = failedResources.length > 5 ||
                failedResources.some(url => url.includes('maps') && url.includes('.js'));
            if (degradedMode) {
                this.log(`Degraded mode detected due to ${failedResources.length} failed resources`);
            }
            return { result, failedResources, degradedMode };
        }
        finally {
            page.off('requestfailed', requestFailedHandler);
            page.off('response', responseHandler);
        }
    }
    getAdaptiveTimeout(baseTimeout, networkCondition = 'fast') {
        const multipliers = {
            fast: 1.0,
            slow: 1.5,
            unstable: 2.0
        };
        return Math.floor(baseTimeout * multipliers[networkCondition]);
    }
    async detectNetworkConditions(page) {
        const startTime = Date.now();
        let requestCount = 0;
        let failedCount = 0;
        let slowCount = 0;
        const requestHandler = () => requestCount++;
        const responseHandler = (response) => {
            const responseTime = Date.now() - startTime;
            if (!response.ok())
                failedCount++;
            if (responseTime > 3000)
                slowCount++;
        };
        const requestFailedHandler = () => failedCount++;
        page.on('request', requestHandler);
        page.on('response', responseHandler);
        page.on('requestfailed', requestFailedHandler);
        await this.delay(5000);
        page.off('request', requestHandler);
        page.off('response', responseHandler);
        page.off('requestfailed', requestFailedHandler);
        const failureRate = requestCount > 0 ? failedCount / requestCount : 0;
        const slowRate = requestCount > 0 ? slowCount / requestCount : 0;
        if (failureRate > 0.4 || (slowRate > 0.6 && failureRate > 0.2)) {
            return 'unstable';
        }
        else if (failureRate > 0.05 || slowRate > 0.2) {
            return 'slow';
        }
        else {
            return 'fast';
        }
    }
    async executeWithProgressiveTimeout(operation, timeouts, operationName = 'operation') {
        let lastError = null;
        for (let i = 0; i < timeouts.length; i++) {
            const timeout = timeouts[i];
            this.log(`${operationName} attempt ${i + 1}/${timeouts.length} with ${timeout}ms timeout`);
            try {
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => {
                        reject(new Error(`${operationName} timeout after ${timeout}ms`));
                    }, timeout);
                });
                return await Promise.race([operation(), timeoutPromise]);
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                this.log(`${operationName} failed with ${timeout}ms timeout: ${lastError.message}`);
                if (i < timeouts.length - 1) {
                    const delay = Math.min(1000 * (i + 1), 5000);
                    this.log(`Retrying with longer timeout in ${delay}ms...`);
                    await this.delay(delay);
                }
            }
        }
        throw lastError || new Error(`${operationName} failed with all timeout strategies`);
    }
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    isRetryableError(error) {
        if (error.message.includes('timeout after') && error.message.includes('ms (attempt')) {
            return false;
        }
        const retryablePatterns = [
            /network/i,
            /connection/i,
            /ECONNRESET/i,
            /ENOTFOUND/i,
            /ETIMEDOUT/i,
            /net::ERR_/i,
            /Protocol error/i,
            /Navigation timeout/i
        ];
        return retryablePatterns.some(pattern => pattern.test(error.message));
    }
    async extractWithFallbackSelectors(page, selectors) {
        const results = [];
        for (const selector of selectors) {
            try {
                const elements = await page.$$(selector);
                for (const element of elements) {
                    const text = await element.evaluate(el => el.textContent?.trim() || '');
                    const ariaLabel = await element.evaluate(el => el.getAttribute('aria-label') || '');
                    if (text || ariaLabel) {
                        results.push({
                            text,
                            ariaLabel,
                            selector,
                            extractionMethod: 'fallback'
                        });
                    }
                }
            }
            catch (error) {
                continue;
            }
        }
        return results;
    }
    async extractMinimalContent(page) {
        try {
            return await page.evaluate(() => {
                const results = [];
                const potentialReviewElements = document.querySelectorAll('[aria-label*="star" i], [aria-label*="rating" i], [class*="review"], [role="listitem"]');
                potentialReviewElements.forEach((element, index) => {
                    const text = element.textContent?.trim() || '';
                    const ariaLabel = element.getAttribute('aria-label') || '';
                    if (text.length > 10 || ariaLabel.length > 5) {
                        results.push({
                            text,
                            ariaLabel,
                            index,
                            extractionMethod: 'minimal'
                        });
                    }
                });
                return results;
            });
        }
        catch (error) {
            return [];
        }
    }
    async extractEmergencyContent(page) {
        try {
            return await page.evaluate(() => {
                const results = [];
                const bodyText = document.body.textContent || '';
                const reviewPatterns = [
                    /\d+\s*star[s]?/gi,
                    /\d+\/5/g,
                    /★+/g,
                    /review[s]?\s*by/gi
                ];
                reviewPatterns.forEach((pattern, index) => {
                    const matches = bodyText.match(pattern);
                    if (matches) {
                        matches.forEach(match => {
                            results.push({
                                text: match,
                                pattern: pattern.toString(),
                                extractionMethod: 'emergency'
                            });
                        });
                    }
                });
                if (results.length === 0) {
                    results.push({
                        text: 'Emergency extraction fallback',
                        pattern: 'fallback',
                        extractionMethod: 'emergency'
                    });
                }
                return results;
            });
        }
        catch (error) {
            return [{
                    text: 'Emergency extraction error fallback',
                    pattern: 'error',
                    extractionMethod: 'emergency'
                }];
        }
    }
}
//# sourceMappingURL=networkResilienceService.js.map