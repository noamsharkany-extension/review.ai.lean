# Implementation Plan

- [x] 1. Create language detection service foundation
  - Implement `LanguageDetectionService` class with core detection methods
  - Add language detection utilities for Hebrew and RTL language identification
  - Create language confidence scoring algorithm based on DOM element analysis
  - _Requirements: 2.2, 3.1_

- [x] 2. Implement multilingual selector definitions
  - Create comprehensive selector sets for Hebrew and English interfaces
  - Define language-agnostic selectors that work across different Google Maps versions
  - Implement dynamic selector generation based on detected language patterns
  - _Requirements: 1.2, 2.1_

- [x] 3. Enhance scraper service with language detection integration
  - Integrate language detection into existing `GoogleReviewScraperService`
  - Add language detection call at the beginning of scraping workflow
  - Implement language-specific extraction strategy selection
  - _Requirements: 1.1, 2.2, 3.1_

- [x] 4. Implement multilingual text pattern extraction
  - Create multilingual author name extraction patterns for Hebrew and English
  - Implement multilingual date parsing for "X ago" patterns in different languages
  - Add multilingual rating extraction from aria-labels and text content
  - _Requirements: 1.1, 1.2_

- [x] 5. Add URL parameter forcing mechanism
  - Implement URL modification to add English language parameters (`&hl=en`)
  - Create retry mechanism that attempts English forcing when initial extraction fails
  - Add URL validation to ensure parameters are added safely
  - _Requirements: 1.3, 2.3_

- [x] 6. Implement progressive fallback extraction strategies
  - Create fallback chain: language-specific → generic → brute-force extraction
  - Implement broader selector strategies when specific selectors fail
  - Add extraction attempt logging and strategy tracking
  - _Requirements: 2.3, 3.2, 3.3_

- [x] 7. Enhance error handling and debugging for multilingual scenarios
  - Add detailed logging for language detection results and confidence scores
  - Implement multilingual debug information capture including detected selectors
  - Create error categorization for language-specific vs. general extraction failures
  - _Requirements: 2.2, 3.3_

- [x] 8. Create comprehensive unit tests for language detection
  - Write tests for Hebrew and English language detection accuracy
  - Test confidence scoring and RTL language identification
  - Create tests for selector generation based on detected languages
  - _Requirements: 1.1, 2.1, 3.1_

- [x] 9. Implement integration tests with real multilingual pages
  - Create tests using actual Hebrew Google Maps URLs (like the failing cafe example)
  - Test mixed Hebrew-English content scenarios
  - Implement end-to-end testing of the complete multilingual extraction workflow
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 10. Add performance optimization and caching
  - Implement language detection result caching to avoid repeated detection
  - Optimize selector set storage and retrieval for different languages
  - Add performance monitoring for language detection overhead
  - _Requirements: 3.1, 3.2_

- [x] 11. Update existing scraper methods with multilingual support
  - Modify `findAndClickReviewsSection` to use multilingual review tab detection
  - Update `extractReviews` method to use language-specific extraction strategies
  - Enhance `waitForReviewsSection` with multilingual selector support
  - _Requirements: 1.2, 2.1, 2.2_

- [x] 12. Create monitoring and observability features
  - Add metrics tracking for language detection accuracy and extraction success rates
  - Implement logging for fallback strategy usage and effectiveness
  - Create debugging utilities for analyzing failed multilingual extractions
  - _Requirements: 2.2, 3.3_