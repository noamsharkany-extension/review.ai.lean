# Implementation Plan

- [x] 1. Create comprehensive collection orchestrator foundation
  - Implement `ComprehensiveCollectionOrchestrator` class with three-phase collection workflow
  - Add configuration interface for target counts, timeouts, and retry limits
  - Create session management and progress tracking infrastructure
  - _Requirements: 1.1, 2.1, 3.1, 7.1_

- [x] 2. Implement review sort navigation service
  - Create `ReviewSortNavigationService` to handle clicking between "Most recent", "Lowest rated", "Highest rated" options
  - Add detection for mobile vs desktop sorting interfaces with language-specific selectors
  - Implement fallback strategies for when sorting controls are not found or clickable
  - _Requirements: 1.1, 2.1, 3.1, 5.1, 5.2_

- [x] 3. Build enhanced pagination engine for large-scale collection
  - Extend existing pagination logic in `EnhancedPaginationEngine` to handle 100+ reviews per category
  - Add adaptive scrolling strategies that adjust speed based on page responsiveness
  - Implement progress callbacks and target-based pagination termination
  - _Requirements: 1.2, 2.2, 3.2, 7.2_

- [x] 4. Create review deduplication system
  - Implement `ReviewDeduplicationService` with ID-based and content-hash deduplication strategies
  - Add similarity detection for near-duplicate reviews using content comparison
  - Create priority-based deduplication that preserves reviews from preferred collection phases
  - _Requirements: 4.1, 4.2, 4.3_

- [x] 5. Integrate comprehensive collection with existing scraper service
  - Extend `GoogleReviewScraperService` with `collectComprehensiveReviews()` method
  - Integrate with existing reliability framework (resource loading monitor, progressive selectors)
  - Ensure comprehensive collection works with existing language detection and degraded mode
  - _Requirements: 6.1, 6.2, 5.3_

- [x] 6. Implement collection progress tracking and reporting
  - Create `CollectionProgressTracker` with real-time progress updates and time estimation
  - Add comprehensive result compilation with metadata about collection success/failures
  - Implement progress callbacks for UI integration and monitoring
  - _Requirements: 7.1, 7.3_

- [x] 7. Add error handling and graceful degradation
  - Implement retry logic for sorting navigation failures with configurable attempt limits
  - Add timeout handling that preserves partial results rather than failing completely
  - Create fallback collection mode that works without sorting when navigation fails
  - _Requirements: 5.3, 6.2, 6.3_

- [x] 8. Create comprehensive collection validation and testing
  - Write unit tests for sort navigation across different Google Maps interfaces
  - Test enhanced pagination with businesses that have 500+ reviews for full validation
  - Create integration tests for complete 300-review collection workflow
  - _Requirements: 1.3, 2.3, 3.3, 5.1_

- [x] 9. Implement performance optimization and memory management
  - Add streaming collection that processes reviews in batches to manage memory usage
  - Implement smart timeout management with progress-based extensions
  - Create memory cleanup for large DOM snapshots and debug data during long collections
  - _Requirements: 7.2, 6.1_

- [x] 10. Add comprehensive collection API integration
  - Update existing API endpoints to support comprehensive collection requests
  - Add progress WebSocket updates for real-time collection monitoring
  - Create result caching for completed comprehensive collections
  - _Requirements: 7.1, 7.3_