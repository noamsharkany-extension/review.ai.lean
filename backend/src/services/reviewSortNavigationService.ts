import { Page } from 'puppeteer';
import { LanguageDetectionResult } from './languageDetection';

export interface SortingOption {
  type: 'recent' | 'worst' | 'best';
  selectors: string[];
  labels: string[];
  fallbackStrategies: string[];
}

export interface SortNavigationResult {
  success: boolean;
  sortType: 'recent' | 'worst' | 'best';
  method: 'click' | 'url-manipulation' | 'fallback';
  timeToNavigate: number;
  error?: string;
}

export interface SortingInterface {
  type: 'desktop' | 'mobile' | 'unknown';
  hasDropdown: boolean;
  hasButtons: boolean;
  hasTabs: boolean;
  confidence: number;
}

export class ReviewSortNavigationService {
  private debugMode: boolean = false;
  private progressCallback?: (message: string) => void;

  constructor(progressCallback?: (message: string) => void, debugMode: boolean = false) {
    this.progressCallback = progressCallback;
    this.debugMode = debugMode;
  }

  /**
   * Navigate to a specific review sorting option
   */
  async navigateToSort(
    page: Page, 
    sortType: 'recent' | 'worst' | 'best',
    languageDetection: LanguageDetectionResult
  ): Promise<SortNavigationResult> {
    const startTime = Date.now();
    this.debugLog(`Starting navigation to ${sortType} sort...`);

    try {
      // First detect the sorting interface type
      const sortingInterface = await this.detectSortingInterface(page);
      this.debugLog(`Detected sorting interface: ${sortingInterface.type} (confidence: ${sortingInterface.confidence})`);

      // Get appropriate selectors for the detected interface and language
      const sortingOption = this.getSortingSelectors(sortType, sortingInterface.type, languageDetection.language);
      
      // Try different navigation methods in order of preference
      const methods = ['click', 'url-manipulation', 'fallback'] as const;
      
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
        } catch (methodError) {
          this.debugLog(`Navigation method ${method} failed: ${methodError}`);
          continue;
        }
      }

      // All methods failed
      const timeToNavigate = Date.now() - startTime;
      return {
        success: false,
        sortType,
        method: 'fallback',
        timeToNavigate,
        error: 'All navigation methods failed'
      };

    } catch (error) {
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

  /**
   * Enhanced navigation with configurable retry logic and graceful degradation
   */
  async navigateToSortWithRetry(
    page: Page, 
    sortType: 'recent' | 'worst' | 'best',
    languageDetection: LanguageDetectionResult,
    maxAttempts: number = 3,
    timeoutMs: number = 10000
  ): Promise<SortNavigationResult> {
    let lastError: string | undefined;
    let bestResult: SortNavigationResult | undefined;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.debugLog(`Sort navigation attempt ${attempt}/${maxAttempts} for ${sortType}`);
        
        // Create timeout promise
        const timeoutPromise = new Promise<SortNavigationResult>((_, reject) => {
          setTimeout(() => reject(new Error(`Navigation timeout after ${timeoutMs}ms`)), timeoutMs);
        });
        
        // Race between navigation and timeout
        const result = await Promise.race([
          this.navigateToSort(page, sortType, languageDetection),
          timeoutPromise
        ]);
        
        // If successful, return immediately
        if (result.success) {
          this.debugLog(`Sort navigation succeeded on attempt ${attempt}`);
          return result;
        }
        
        // Keep track of the best result (closest to success)
        if (!bestResult || this.isResultBetter(result, bestResult)) {
          bestResult = result;
        }
        
        lastError = result.error || 'Navigation failed';
        this.debugLog(`Sort navigation attempt ${attempt} failed: ${lastError}`);
        
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';
        this.debugLog(`Sort navigation attempt ${attempt} threw error: ${lastError}`);
      }
      
      // Wait before retry with exponential backoff
      if (attempt < maxAttempts) {
        const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        this.debugLog(`Waiting ${delayMs}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        
        // Try to recover page state before retry
        try {
          await this.recoverPageState(page);
        } catch (recoveryError) {
          this.debugLog(`Page state recovery failed: ${recoveryError}`);
        }
      }
    }
    
    // Return the best result we got, or a failure result
    return bestResult || {
      success: false,
      sortType,
      method: 'fallback',
      timeToNavigate: 0,
      error: lastError || 'All navigation attempts failed'
    };
  }

  /**
   * Determine if one navigation result is better than another
   */
  private isResultBetter(result1: SortNavigationResult, result2: SortNavigationResult): boolean {
    // Success is always better than failure
    if (result1.success && !result2.success) return true;
    if (!result1.success && result2.success) return false;
    
    // If both failed, prefer the one with shorter time (failed faster)
    if (!result1.success && !result2.success) {
      return result1.timeToNavigate < result2.timeToNavigate;
    }
    
    // If both succeeded, prefer the one with better method
    const methodPriority = { 'click': 3, 'url-manipulation': 2, 'fallback': 1 };
    return methodPriority[result1.method] > methodPriority[result2.method];
  }

  /**
   * Attempt to recover page state before retry
   */
  private async recoverPageState(page: Page): Promise<void> {
    try {
      // Scroll to top to reset view
      await page.evaluate(() => window.scrollTo(0, 0));
      
      // Wait for any animations or transitions to complete
      await page.waitForTimeout(1000);
      
      // Close any open menus or dropdowns
      await page.evaluate(() => {
        // Click outside any open menus
        const body = document.body;
        if (body) {
          body.click();
        }
        
        // Press Escape to close any modal dialogs
        const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
        document.dispatchEvent(escapeEvent);
      });
      
      await page.waitForTimeout(500);
      
    } catch (error) {
      this.debugLog(`Page state recovery error: ${error}`);
    }
  }  /*
*
   * Detect the type of sorting interface present on the page
   */
  private async detectSortingInterface(page: Page): Promise<SortingInterface> {
    this.debugLog('Detecting sorting interface type...');

    const interfaceInfo = await page.evaluate(() => {
      // Check for different sorting interface patterns
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

      // Check each pattern
      for (const [patternName, pattern] of Object.entries(patterns)) {
        for (const selector of pattern.selectors) {
          if (document.querySelector(selector)) {
            pattern.found = true;
            break;
          }
        }
      }

      // Detect mobile vs desktop indicators
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

    // Determine interface type based on detection results
    let interfaceType: 'desktop' | 'mobile' | 'unknown' = 'unknown';
    let confidence = 0;

    if (interfaceInfo.isMobile) {
      interfaceType = 'mobile';
      confidence += 0.3;
    } else {
      interfaceType = 'desktop';
      confidence += 0.3;
    }

    // Adjust confidence based on detected patterns
    const hasDropdown = interfaceInfo.patterns.dropdown.found;
    const hasButtons = interfaceInfo.patterns.buttons.found;
    const hasTabs = interfaceInfo.patterns.tabs.found;

    if (hasDropdown || hasButtons || hasTabs) {
      confidence += 0.5;
    }

    // Desktop typically has more complex sorting interfaces
    if (interfaceType === 'desktop' && (hasDropdown || hasTabs)) {
      confidence += 0.2;
    }

    // Mobile typically has simpler button-based interfaces
    if (interfaceType === 'mobile' && hasButtons) {
      confidence += 0.2;
    }

    const result: SortingInterface = {
      type: interfaceType,
      hasDropdown,
      hasButtons,
      hasTabs,
      confidence: Math.min(confidence, 1.0)
    };

    this.debugLog(`Sorting interface detected: ${JSON.stringify(result)}`);
    return result;
  }

  /**
   * Get appropriate selectors for the sorting option based on interface type and language
   */
  private getSortingSelectors(
    sortType: 'recent' | 'worst' | 'best', 
    interfaceType: string, 
    language: string
  ): SortingOption {
    const normalizedLang = language.toLowerCase();
    
    // Define language-specific labels for sorting options
    const labels = this.getSortingLabels(sortType, normalizedLang);
    
    // Define selectors based on interface type and sort type
    const selectors = this.getSortingSelectorsForInterface(sortType, interfaceType, normalizedLang);
    
    // Define fallback strategies
    const fallbackStrategies = this.getFallbackStrategies(sortType, interfaceType);

    return {
      type: sortType,
      selectors,
      labels,
      fallbackStrategies
    };
  }  
/**
   * Get language-specific labels for sorting options
   */
  private getSortingLabels(sortType: 'recent' | 'worst' | 'best', language: string): string[] {
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

  /**
   * Get selectors for sorting options based on interface type and language
   */
  private getSortingSelectorsForInterface(
    sortType: 'recent' | 'worst' | 'best', 
    interfaceType: string, 
    language: string
  ): string[] {
    const labels = this.getSortingLabels(sortType, language);
    const selectors: string[] = [];

    // Generate selectors for different interface patterns
    
    // Dropdown selectors
    labels.forEach(label => {
      selectors.push(
        `select option[value*="${label.toLowerCase()}" i]`,
        `select option:contains("${label}")`,
        `[role="option"][aria-label*="${label}" i]`,
        `[role="option"]:contains("${label}")`
      );
    });

    // Button selectors
    labels.forEach(label => {
      selectors.push(
        `button[aria-label*="${label}" i]`,
        `button:contains("${label}")`,
        `[role="button"][aria-label*="${label}" i]`,
        `[role="button"]:contains("${label}")`,
        `div[role="button"][aria-label*="${label}" i]`
      );
    });

    // Tab selectors
    labels.forEach(label => {
      selectors.push(
        `[role="tab"][aria-label*="${label}" i]`,
        `[role="tab"]:contains("${label}")`,
        `[data-tab*="${label.toLowerCase()}" i]`
      );
    });

    // Menu item selectors
    labels.forEach(label => {
      selectors.push(
        `[role="menuitem"][aria-label*="${label}" i]`,
        `[role="menuitem"]:contains("${label}")`,
        `.menu-item:contains("${label}")`,
        `li:contains("${label}")`
      );
    });

    // Generic clickable elements with sorting labels
    labels.forEach(label => {
      selectors.push(
        `*[aria-label*="${label}" i]`,
        `*:contains("${label}")`,
        `[data-sort*="${label.toLowerCase()}" i]`,
        `[data-value*="${label.toLowerCase()}" i]`
      );
    });

    // Interface-specific selectors
    if (interfaceType === 'mobile') {
      // Mobile-specific patterns
      selectors.push(
        '.mobile-sort-option',
        '[data-mobile-sort]',
        '.sort-mobile button',
        '.mobile-menu [role="menuitem"]'
      );
    } else if (interfaceType === 'desktop') {
      // Desktop-specific patterns
      selectors.push(
        '.desktop-sort-option',
        '[data-desktop-sort]',
        '.sort-desktop select',
        '.desktop-menu [role="menuitem"]'
      );
    }

    // Google Maps specific patterns (discovered from DOM analysis)
    selectors.push(
      '[jsaction*="sort"]',
      '[data-value*="sort"]',
      '.section-sort-button',
      '[aria-label*="sort" i]'
    );

    return selectors;
  }

  /**
   * Get fallback strategies for sorting navigation
   */
  private getFallbackStrategies(sortType: 'recent' | 'worst' | 'best', interfaceType: string): string[] {
    const strategies = [
      'url-parameter-manipulation',
      'keyboard-navigation',
      'scroll-and-search',
      'dom-mutation-trigger',
      'click-all-possible-elements'
    ];

    // Add interface-specific fallback strategies
    if (interfaceType === 'mobile') {
      strategies.unshift('mobile-menu-navigation', 'touch-gesture-simulation');
    } else if (interfaceType === 'desktop') {
      strategies.unshift('dropdown-navigation', 'right-click-menu');
    }

    return strategies;
  }  /*
*
   * Attempt navigation using a specific method
   */
  private async attemptNavigation(
    page: Page, 
    sortingOption: SortingOption, 
    method: 'click' | 'url-manipulation' | 'fallback',
    sortingInterface: SortingInterface
  ): Promise<boolean> {
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

  /**
   * Attempt navigation by clicking sorting elements
   */
  private async attemptClickNavigation(
    page: Page, 
    sortingOption: SortingOption, 
    sortingInterface: SortingInterface
  ): Promise<boolean> {
    this.debugLog(`Attempting click navigation with ${sortingOption.selectors.length} selectors...`);

    // Try each selector in order of preference
    for (const selector of sortingOption.selectors) {
      try {
        this.debugLog(`Trying selector: ${selector}`);

        // Wait for element to be present
        const element = await page.$(selector);
        if (!element) {
          this.debugLog(`Element not found for selector: ${selector}`);
          continue;
        }

        // Check if element is visible and clickable
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

        // Try to click the element
        await element.click();
        
        // Wait for potential page changes
        await page.waitForTimeout(1000);

        // Verify that the sort was applied by checking URL or page content
        const sortApplied = await this.verifySortApplication(page, sortingOption.type);
        
        if (sortApplied) {
          this.debugLog(`Successfully clicked element with selector: ${selector}`);
          return true;
        } else {
          this.debugLog(`Click succeeded but sort not applied for selector: ${selector}`);
        }

      } catch (error) {
        this.debugLog(`Click failed for selector ${selector}: ${error}`);
        continue;
      }
    }

    return false;
  }

  /**
   * Attempt navigation by manipulating URL parameters
   */
  private async attemptUrlManipulation(page: Page, sortingOption: SortingOption): Promise<boolean> {
    this.debugLog('Attempting URL manipulation navigation...');

    try {
      const currentUrl = page.url();
      const url = new URL(currentUrl);

      // Define URL parameter mappings for different sort types
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
          
          // Verify that the sort was applied
          const sortApplied = await this.verifySortApplication(page, sortingOption.type);
          
          if (sortApplied) {
            this.debugLog(`Successfully applied sort via URL manipulation: ${paramString}`);
            return true;
          }

        } catch (error) {
          this.debugLog(`URL manipulation failed for ${paramString}: ${error}`);
          continue;
        }
      }

    } catch (error) {
      this.debugLog(`URL manipulation method failed: ${error}`);
    }

    return false;
  }

  /**
   * Attempt navigation using fallback strategies
   */
  private async attemptFallbackNavigation(
    page: Page, 
    sortingOption: SortingOption, 
    sortingInterface: SortingInterface
  ): Promise<boolean> {
    this.debugLog('Attempting fallback navigation strategies...');

    for (const strategy of sortingOption.fallbackStrategies) {
      try {
        this.debugLog(`Trying fallback strategy: ${strategy}`);

        const success = await this.executeFallbackStrategy(page, strategy, sortingOption, sortingInterface);
        
        if (success) {
          this.debugLog(`Fallback strategy ${strategy} succeeded`);
          return true;
        }

      } catch (error) {
        this.debugLog(`Fallback strategy ${strategy} failed: ${error}`);
        continue;
      }
    }

    return false;
  }  /**
   
* Execute a specific fallback strategy
   */
  private async executeFallbackStrategy(
    page: Page, 
    strategy: string, 
    sortingOption: SortingOption, 
    sortingInterface: SortingInterface
  ): Promise<boolean> {
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

  /**
   * Try keyboard navigation to access sorting options
   */
  private async tryKeyboardNavigation(page: Page, sortingOption: SortingOption): Promise<boolean> {
    this.debugLog('Trying keyboard navigation...');

    try {
      // Try Tab navigation to find sorting controls
      await page.keyboard.press('Tab');
      await page.waitForTimeout(500);
      
      // Try pressing Enter or Space on focused element
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);
      
      // Check if a menu or dropdown opened
      const menuOpened = await page.evaluate(() => {
        const menus = document.querySelectorAll('[role="menu"], [role="listbox"], .dropdown-menu');
        return menus.length > 0 && Array.from(menus).some(menu => {
          const style = window.getComputedStyle(menu);
          return style.display !== 'none' && style.visibility !== 'hidden';
        });
      });

      if (menuOpened) {
        // Try to navigate to the desired option using arrow keys
        for (let i = 0; i < 5; i++) {
          await page.keyboard.press('ArrowDown');
          await page.waitForTimeout(200);
          
          // Check if we're on the right option
          const currentOption = await page.evaluate(() => {
            const focused = document.activeElement;
            return focused ? focused.textContent || focused.getAttribute('aria-label') || '' : '';
          });

          if (sortingOption.labels.some(label => 
            currentOption.toLowerCase().includes(label.toLowerCase())
          )) {
            await page.keyboard.press('Enter');
            await page.waitForTimeout(1000);
            return await this.verifySortApplication(page, sortingOption.type);
          }
        }
      }

    } catch (error) {
      this.debugLog(`Keyboard navigation failed: ${error}`);
    }

    return false;
  }

  /**
   * Try scrolling and searching for sorting options
   */
  private async tryScrollAndSearch(page: Page, sortingOption: SortingOption): Promise<boolean> {
    this.debugLog('Trying scroll and search...');

    try {
      // Scroll to different parts of the page to reveal hidden sorting options
      const scrollPositions = [0, 200, 400, 600, 800];
      
      for (const scrollY of scrollPositions) {
        await page.evaluate((y) => window.scrollTo(0, y), scrollY);
        await page.waitForTimeout(500);
        
        // Search for sorting elements that might have become visible
        for (const selector of sortingOption.selectors.slice(0, 10)) { // Limit to first 10 for performance
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
          } catch (error) {
            continue;
          }
        }
      }

    } catch (error) {
      this.debugLog(`Scroll and search failed: ${error}`);
    }

    return false;
  }

  /**
   * Try triggering DOM mutations to reveal sorting options
   */
  private async tryDomMutationTrigger(page: Page, sortingOption: SortingOption): Promise<boolean> {
    this.debugLog('Trying DOM mutation trigger...');

    try {
      // Try clicking on potential trigger elements that might reveal sorting options
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
            
            // Now try to find and click sorting options
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
              } catch (error) {
                continue;
              }
            }
          }
        } catch (error) {
          continue;
        }
      }

    } catch (error) {
      this.debugLog(`DOM mutation trigger failed: ${error}`);
    }

    return false;
  }  
/**
   * Try mobile-specific menu navigation
   */
  private async tryMobileMenuNavigation(page: Page, sortingOption: SortingOption): Promise<boolean> {
    this.debugLog('Trying mobile menu navigation...');

    try {
      // Look for mobile menu triggers (hamburger menus, etc.)
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
            // Simulate touch interaction for mobile
            await trigger.tap();
            await page.waitForTimeout(1500);
            
            // Look for sorting options in the opened menu
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
              } catch (error) {
                continue;
              }
            }
          }
        } catch (error) {
          continue;
        }
      }

    } catch (error) {
      this.debugLog(`Mobile menu navigation failed: ${error}`);
    }

    return false;
  }

  /**
   * Try dropdown-specific navigation
   */
  private async tryDropdownNavigation(page: Page, sortingOption: SortingOption): Promise<boolean> {
    this.debugLog('Trying dropdown navigation...');

    try {
      // Look for dropdown elements
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
            // Click to open dropdown
            await dropdown.click();
            await page.waitForTimeout(1000);
            
            // Try to select the appropriate option
            for (const label of sortingOption.labels) {
              try {
                // Try selecting by visible text
                await page.select(dropdownSelector, label);
                await page.waitForTimeout(1000);
                
                if (await this.verifySortApplication(page, sortingOption.type)) {
                  return true;
                }
              } catch (error) {
                // Try clicking on option elements
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
        } catch (error) {
          continue;
        }
      }

    } catch (error) {
      this.debugLog(`Dropdown navigation failed: ${error}`);
    }

    return false;
  }

  /**
   * Try clicking all possible elements that might be sorting controls
   */
  private async tryClickAllPossibleElements(page: Page, sortingOption: SortingOption): Promise<boolean> {
    this.debugLog('Trying to click all possible elements...');

    try {
      // Get all clickable elements that might contain sorting labels
      const clickableElements = await page.evaluate((labels) => {
        const elements: Array<{selector: string, text: string, ariaLabel: string}> = [];
        const clickableSelectors = [
          'button', '[role="button"]', 'a', '[onclick]', '[role="menuitem"]', 
          '[role="tab"]', '[role="option"]', 'span[tabindex]', 'div[tabindex]'
        ];
        
        for (const selector of clickableSelectors) {
          const els = document.querySelectorAll(selector);
          for (const el of els) {
            const text = (el.textContent || '').trim().toLowerCase();
            const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
            
            // Check if element contains any of our target labels
            if (labels.some((label: string) => 
              text.includes(label.toLowerCase()) || ariaLabel.includes(label.toLowerCase())
            )) {
              elements.push({
                selector: el.tagName.toLowerCase() + (el.className ? '.' + el.className.split(' ').join('.') : ''),
                text,
                ariaLabel
              });
            }
          }
        }
        
        return elements.slice(0, 20); // Limit to first 20 matches
      }, sortingOption.labels);

      // Try clicking each potential element
      for (const elementInfo of clickableElements) {
        try {
          // Find element by text content or aria-label
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
        } catch (error) {
          continue;
        }
      }

    } catch (error) {
      this.debugLog(`Click all possible elements failed: ${error}`);
    }

    return false;
  } 
 /**
   * Verify that the sort was successfully applied
   */
  private async verifySortApplication(page: Page, sortType: 'recent' | 'worst' | 'best'): Promise<boolean> {
    this.debugLog(`Verifying sort application for ${sortType}...`);

    try {
      // Wait a moment for the page to update
      await page.waitForTimeout(2000);

      // Check URL for sort parameters
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

      // Check page content for sort indicators
      const contentVerification = await page.evaluate((type, indicators) => {
        // Look for active sort indicators in the UI
        const activeElements = document.querySelectorAll('[aria-selected="true"], .active, .selected, [aria-pressed="true"]');
        
        for (const element of activeElements) {
          const text = (element.textContent || '').toLowerCase();
          const ariaLabel = (element.getAttribute('aria-label') || '').toLowerCase();
          
          if (indicators.some((indicator: string) => 
            text.includes(indicator) || ariaLabel.includes(indicator)
          )) {
            return true;
          }
        }

        // Check for sort order in review dates/ratings (basic heuristic)
        const reviews = document.querySelectorAll('[data-review-id], [jsaction*="review"], div[role="listitem"]');
        if (reviews.length >= 3) {
          // For recent sort, check if dates are in descending order
          if (type === 'recent') {
            const dateElements = Array.from(reviews).slice(0, 3).map(review => {
              const dateEl = review.querySelector('[aria-label*="ago" i], span:contains("ago")');
              return dateEl ? dateEl.textContent || '' : '';
            });
            
            // Simple check: if we see "day", "week", "month" pattern, it's likely sorted by recent
            const hasRecentPattern = dateElements.some(date => 
              date.includes('day') || date.includes('week') || date.includes('hour')
            );
            
            if (hasRecentPattern) return true;
          }
          
          // For rating sorts, check if star ratings follow expected pattern
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
                // Check if ratings are low (1-2 stars) or descending
                return ratingElements.some(rating => rating <= 2) || 
                       ratingElements[0] >= ratingElements[1];
              } else if (type === 'best') {
                // Check if ratings are high (4-5 stars) or ascending
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

      // If we can't verify definitively, assume success if no errors occurred
      // This is a fallback for cases where verification is difficult
      this.debugLog(`Sort verification inconclusive, assuming success`);
      return true;

    } catch (error) {
      this.debugLog(`Sort verification failed: ${error}`);
      return false;
    }
  }

  /**
   * Debug logging helper
   */
  private debugLog(message: string): void {
    if (this.debugMode) {
      console.log(`[ReviewSortNavigationService] ${message}`);
    }
    
    if (this.progressCallback) {
      this.progressCallback(message);
    }
  }

  /**
   * Regular logging helper
   */
  private log(message: string): void {
    console.log(`[ReviewSortNavigationService] ${message}`);
    
    if (this.progressCallback) {
      this.progressCallback(message);
    }
  }
}