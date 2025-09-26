// Core data models for the Review Analyzer application

export interface Review {
  id: string;
  author: string;
  rating: number;
  text: string;
  date: Date;
  originalUrl: string;
  sentiment?: SentimentAnalysis;
  fakeAnalysis?: FakeReviewAnalysis;
}

export interface RawReview {
  id: string;
  author: string;
  rating: number;
  text: string;
  date: Date;
  originalUrl: string;
}

export interface SentimentAnalysis {
  reviewId: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  confidence: number;
  mismatchDetected: boolean;
}

export interface FakeReviewAnalysis {
  reviewId: string;
  isFake: boolean;
  confidence: number;
  reasons: string[];
}

export interface SampledReviews {
  reviews: RawReview[];
  breakdown: {
    recent: number;
    fivestar: number;
    onestar: number;
  };
  samplingUsed: boolean;
}

export interface SampleBreakdown {
  recent: number;
  fivestar: number;
  onestar: number;
}

export interface AnalysisProgress {
  phase: 'scraping' | 'sampling' | 'sentiment' | 'fake-detection' | 'verdict';
  progress: number;
  message: string;
}

export interface AnalysisResults {
  verdict: {
    overallScore: number;
    trustworthiness: number;
    redFlags: number;
  };
  sampling: {
    totalReviews: number;
    samplingUsed: boolean;
    sampleBreakdown?: SampleBreakdown;
  };
  analysis: {
    fakeReviewRatio: number;
    sentimentMismatchRatio: number;
    confidenceScore: number;
  };
  citations: ReviewCitation[];
  transparencyReport: TransparencyReport;
}

export interface ReviewCitation {
  reviewId: string;
  author: string;
  rating: number;
  text: string;
  date: Date;
  originalUrl: string;
  sentiment: SentimentAnalysis;
  fakeAnalysis: FakeReviewAnalysis;
  analysis?: string;
  link?: string;
}

export interface AnalysisSession {
  id: string;
  googleUrl: string;
  status: 'pending' | 'scraping' | 'analyzing' | 'complete' | 'error';
  progress: AnalysisProgress;
  results?: AnalysisResults;
  // Optional caches to avoid re-scraping/re-sampling on retries within the same process
  cachedReviews?: RawReview[];
  cachedSampledReviews?: SampledReviews;
  error?: {
    message: string;
    type: string;
  };
  createdAt: Date;
  completedAt?: Date;
}

// Service interfaces
export interface ReviewScraperService {
  scrapeReviews(googleUrl: string): Promise<RawReview[]>;
  validateUrl(url: string): boolean;
}

export interface SamplingEngine {
  shouldSample(reviews: RawReview[]): boolean;
  sampleReviews(reviews: RawReview[]): SampledReviews;
  generateSamplingReport(originalCount: number, sampledResult: SampledReviews): string;
}

export interface AnalysisEngine {
  analyzeSentiment(reviews: RawReview[]): Promise<SentimentAnalysis[]>;
  detectFakeReviews(reviews: RawReview[]): Promise<FakeReviewAnalysis[]>;
}

// API types
export interface AnalyzeRequest {
  googleUrl: string;
}

export interface AnalyzeResponse {
  sessionId: string;
  status: string;
}

export interface AnalysisStatusResponse {
  session: AnalysisSession;
}

// WebSocket message types
export interface WebSocketMessage {
  type: 'progress' | 'complete' | 'error' | 'connected' | 'subscribed' | 'unsubscribed' | 'comprehensive_progress' | 'comprehensive_complete' | 'comprehensive_error';
  sessionId: string;
  data: AnalysisProgress | AnalysisResults | ComprehensiveCollectionProgress | ComprehensiveCollectionResults | { error: string } | { message: string };
}

// Comprehensive collection types
export interface ComprehensiveCollectionProgress {
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
  message?: string;
}

export interface ComprehensiveCollectionResults {
  uniqueReviews: RawReview[];
  reviewsByCategory: {
    recent: RawReview[];
    worst: RawReview[];
    best: RawReview[];
  };
  metadata: {
    sessionId: string;
    totalCollected: number;
    totalUnique: number;
    duplicatesRemoved: number;
    collectionTime: number;
    sortingResults: {
      recent: { collected: number; target: number };
      worst: { collected: number; target: number };
      best: { collected: number; target: number };
    };
  };
}

export interface ComprehensiveCollectionSession {
  id: string;
  googleUrl: string;
  status: 'pending' | 'collecting' | 'complete' | 'error';
  progress: ComprehensiveCollectionProgress;
  results?: ComprehensiveCollectionResults;
  error?: {
    message: string;
    type: string;
  };
  createdAt: Date;
  completedAt?: Date;
}

// Citation and transparency types
export interface TransparencyReport {
  samplingBreakdown: {
    totalOriginalReviews: number;
    samplingUsed: boolean;
    sampleBreakdown?: SampleBreakdown;
    samplingMethodology: string;
  };
  analysisBreakdown: {
    totalAnalyzed: number;
    fakeReviewCount: number;
    fakeReviewRatio: number;
    sentimentMismatchCount: number;
    sentimentMismatchRatio: number;
    averageConfidenceScore: number;
  };
  qualityMetrics: {
    citationAccuracy: number;
    linkValidityRatio: number;
    analysisCompleteness: number;
  };
}

export interface LinkValidationResult {
  reviewId: string;
  originalUrl: string;
  isValid: boolean;
  statusCode?: number;
  error?: string;
}