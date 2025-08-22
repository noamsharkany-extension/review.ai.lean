# Design Document

## Overview

The comprehensive review collection system extends the existing Google Maps scraper to collect 300 unique reviews across three categories: 100 recent, 100 worst-rated, and 100 best-rated. The design builds upon the existing reliability framework while adding sorting navigation, enhanced pagination, and deduplication capabilities.

## Architecture

### High-Level Flow
1. **Initialize Collection Session** - Set up tracking for the three collection phases
2. **Phase 1: Recent Reviews** - Navigate to "Most recent" sort and collect 100 reviews
3. **Phase 2: Worst Reviews** - Navigate to "Lowest rated" sort and collect 100 reviews  
4. **Phase 3: Best Reviews** - Navigate to "Highest rated" sort and collect 100 reviews
5. **Deduplication** - Remove duplicates across all three collections
6. **Result Compilation** - Return comprehensive collection with metadata

### Integration Points
- **Existing Scraper Service** - Extends `GoogleReviewScraperService` with comprehensive collection methods
- **Reliability Framework** - Leverages existing resource loading monitor, progressive selectors, and degraded mode
- **Language Detection** - Uses existing multilingual support for sorting interface detection

## Components and Interfaces

### 1. ComprehensiveCollectionOrchestrator

**Purpose:** Coordinates the three-phase collection process and manages overall flow.

```typescript
interface ComprehensiveCollectionConfig {
  targetCounts: {
    recent: number;      // Default: 100
    worst: number;       // Default: 100  
    best: number;        // Default: 100
  };
  timeouts: {
    sortNavigation: number;    // Default: 10000ms
    pagination: number;        // Default: 30000ms
    totalCollection: number;   // Default: 300000ms (5 minutes)
  };
  retryLimits: {
    sortingAttempts: number;   // Default: 3
    paginationAttempts: number; // Default: 5
  };
}

interface ComprehensiveCollectionResult {
  collections: {
    recent: RawReview[];
    worst: RawReview[];
    best: RawReview[];
  };
  uniqueReviews: RawReview[];
  metadata: {
    totalCollected: number;
    totalUnique: number;
    duplicatesRemoved: number;
    collectionTime: number;
    phaseResults: PhaseResult[];
  };
}

class ComprehensiveCollectionOrchestrator {
  async collectComprehensiveReviews(
    page: Page, 
    config: ComprehensiveCollectionConfig
  ): Promise<ComprehensiveCollectionResult>;
}
```

### 2. ReviewSortNavigationService

**Purpose:** Handles navigation between different review sorting options across various Google Maps interfaces.

```typescript
interface SortingOption {
  type: 'recent' | 'worst' | 'best';
  selectors: string[];
  labels: string[];
  fallbackStrategies: string[];
}

interface SortNavigationResult {
  success: boolean;
  sortType: 'recent' | 'worst' | 'best';
  method: 'click' | 'url-manipulation' | 'fallback';
  timeToNavigate: number;
  error?: string;
}

class ReviewSortNavigationService {
  async navigateToSort(
    page: Page, 
    sortType: 'recent' | 'worst' | 'best',
    languageDetection: LanguageDetectionResult
  ): Promise<SortNavigationResult>;
  
  private detectSortingInterface(page: Page): Promise<'desktop' | 'mobile' | 'unknown'>;
  private getSortingSelectors(sortType: string, interface: string, language: string): SortingOption;
}
```

### 3. EnhancedPaginationEngine

**Purpose:** Extends existing pagination to handle large-scale review collection with progress tracking.

```typescript
interface PaginationConfig {
  targetCount: number;
  maxAttempts: number;
  scrollStrategy: 'aggressive' | 'conservative' | 'adaptive';
  progressCallback?: (current: number, target: number) => void;
}

interface PaginationResult {
  reviewsCollected: number;
  pagesTraversed: number;
  paginationMethod: 'scroll' | 'click' | 'hybrid';
  stoppedReason: 'target-reached' | 'no-more-content' | 'timeout' | 'error';
  timeElapsed: number;
}

class EnhancedPaginationEngine {
  async paginateForTarget(
    page: Page,
    config: PaginationConfig,
    extractionCallback: () => Promise<RawReview[]>
  ): Promise<PaginationResult>;
  
  private detectPaginationMethod(page: Page): Promise<'scroll' | 'click' | 'hybrid'>;
  private adaptiveScrolling(page: Page, targetCount: number): Promise<void>;
}
```

### 4. ReviewDeduplicationService

**Purpose:** Ensures uniqueness across all collected reviews using multiple identification strategies.

```typescript
interface DeduplicationConfig {
  strategy: 'id-based' | 'content-hash' | 'hybrid';
  priorityOrder: ('recent' | 'worst' | 'best')[];
  similarityThreshold: number; // For content-based deduplication
}

interface DeduplicationResult {
  originalCount: number;
  uniqueCount: number;
  duplicatesRemoved: number;
  deduplicationMethod: string;
  duplicateGroups: DuplicateGroup[];
}

interface DuplicateGroup {
  reviews: RawReview[];
  reason: 'identical-id' | 'identical-content' | 'similar-content';
  keptReview: RawReview;
}

class ReviewDeduplicationService {
  async deduplicateReviews(
    collections: { recent: RawReview[]; worst: RawReview[]; best: RawReview[] },
    config: DeduplicationConfig
  ): Promise<{ uniqueReviews: RawReview[]; result: DeduplicationResult }>;
  
  private generateReviewHash(review: RawReview): string;
  private calculateContentSimilarity(review1: RawReview, review2: RawReview): number;
}
```

### 5. CollectionProgressTracker

**Purpose:** Provides real-time progress updates and performance monitoring for long-running collections.

```typescript
interface CollectionProgress {
  currentPhase: 'recent' | 'worst' | 'best' | 'deduplication' | 'complete';
  phaseProgress: {
    current: number;
    target: number;
    percentage: number;
  };
  overallProgress: {
    reviewsCollected: number;
    totalTarget: number;
    percentage: number;
  };
  timeElapsed: number;
  estimatedTimeRemaining: number;
}

class CollectionProgressTracker {
  updateProgress(phase: string, current: number, target: number): void;
  getProgress(): CollectionProgress;
  estimateTimeRemaining(): number;
}
```

## Data Models

### Extended Review Interface
```typescript
interface ExtendedRawReview extends RawReview {
  collectionMetadata: {
    collectionPhase: 'recent' | 'worst' | 'best';
    collectionOrder: number;
    sortingContext: string;
    paginationDepth: number;
  };
}
```

### Collection Session
```typescript
interface CollectionSession {
  sessionId: string;
  startTime: number;
  config: ComprehensiveCollectionConfig;
  progress: CollectionProgress;
  results: Partial<ComprehensiveCollectionResult>;
}
```

## Error Handling

### Graceful Degradation Strategy
1. **Sorting Navigation Failure** - Fall back to default sorting and collect available reviews
2. **Pagination Timeout** - Return reviews collected so far rather than failing completely
3. **Resource Loading Issues** - Leverage existing degraded mode capabilities
4. **Partial Collection** - Allow completion with fewer than target reviews if business has limited reviews

### Error Recovery Mechanisms
- **Retry Logic** - Configurable retry attempts for sorting and pagination operations
- **Alternative Strategies** - Multiple approaches for each operation (sorting, pagination, extraction)
- **Progress Preservation** - Save intermediate results to prevent total loss on failure
- **Timeout Management** - Reasonable timeouts with progress-based extensions

## Testing Strategy

### Unit Tests
- **Sort Navigation** - Test detection and clicking of sorting controls across interfaces
- **Enhanced Pagination** - Test large-scale pagination with various page structures
- **Deduplication Logic** - Test uniqueness algorithms with known duplicate sets
- **Progress Tracking** - Test progress calculation and time estimation accuracy

### Integration Tests
- **End-to-End Collection** - Test complete 300-review collection on real business pages
- **Cross-Language Support** - Test comprehensive collection with non-English interfaces
- **Performance Testing** - Validate memory usage and execution time for large collections
- **Reliability Testing** - Test comprehensive collection under resource loading failures

### Test Data Requirements
- **High-Volume Businesses** - Businesses with 500+ reviews for full pagination testing
- **Low-Volume Businesses** - Businesses with <100 reviews to test graceful handling
- **Multi-Language Businesses** - Test sorting interface detection across languages
- **Various Interface Types** - Mobile and desktop Google Maps interfaces

## Performance Considerations

### Memory Management
- **Streaming Collection** - Process reviews in batches rather than loading all into memory
- **Garbage Collection** - Explicit cleanup of large DOM snapshots and debug data
- **Progress Checkpoints** - Periodic memory usage monitoring and cleanup

### Execution Time Optimization
- **Parallel Processing** - Where possible, overlap navigation and extraction operations
- **Smart Pagination** - Adaptive scrolling speeds based on page responsiveness
- **Caching** - Cache sorting interface detection results within session

### Resource Usage
- **Network Efficiency** - Minimize unnecessary page reloads and resource requests
- **CPU Optimization** - Efficient deduplication algorithms for large review sets
- **Timeout Tuning** - Balanced timeouts that allow completion without excessive waiting