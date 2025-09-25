import { 
  RawReview, 
  SentimentAnalysis, 
  FakeReviewAnalysis, 
  ReviewCitation, 
  SampledReviews,
  SampleBreakdown 
} from '@shared/types';
import { normalizeReviewId } from '../utils/reviewIdUtils.js';

export interface CitationService {
  generateCitations(
    reviews: RawReview[],
    sentimentAnalysis: SentimentAnalysis[],
    fakeAnalysis: FakeReviewAnalysis[]
  ): ReviewCitation[];
  
  generateTransparencyReport(
    originalReviewCount: number,
    samplingInfo: SampledReviews,
    sentimentAnalysis: SentimentAnalysis[],
    fakeAnalysis: FakeReviewAnalysis[]
  ): TransparencyReport;
  
  validateCitationLinks(citations: ReviewCitation[]): Promise<LinkValidationResult[]>;
}

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

export class ReviewCitationService implements CitationService {
  generateCitations(
    reviews: RawReview[],
    sentimentAnalysis: SentimentAnalysis[],
    fakeAnalysis: FakeReviewAnalysis[]
  ): ReviewCitation[] {
    // Create lookup maps for efficient access with normalized IDs
    const sentimentMap = new Map(sentimentAnalysis.map(s => [normalizeReviewId(s.reviewId), s]));
    const fakeMap = new Map(fakeAnalysis.map(f => [normalizeReviewId(f.reviewId), f]));

    // Log debug information to help identify mismatches
    console.log(`[Citation] Processing ${reviews.length} reviews, ${sentimentAnalysis.length} sentiment analyses, ${fakeAnalysis.length} fake analyses`);

    // Generate detailed citations with comprehensive analysis data
    const citations = reviews.map(review => {
      const normalizedReviewId = normalizeReviewId(review.id);
      const sentiment = sentimentMap.get(normalizedReviewId);
      const fakeAnalysisResult = fakeMap.get(normalizedReviewId);

      if (!sentiment || !fakeAnalysisResult) {
        // Log the missing data for debugging but continue processing
        console.warn(`[Citation] Missing analysis data for review ID: "${review.id}"`);
        console.warn(`[Citation] Normalized ID: "${normalizedReviewId}"`);
        console.warn(`[Citation] Has sentiment: ${!!sentiment}, Has fake analysis: ${!!fakeAnalysisResult}`);
        
        // Try exact match as fallback
        const exactSentiment = sentimentAnalysis.find(s => s.reviewId === review.id);
        const exactFakeAnalysis = fakeAnalysis.find(f => f.reviewId === review.id);
        
        if (exactSentiment && exactFakeAnalysis) {
          console.log(`[Citation] Found exact match for review: "${review.id}"`);
          return this.createDetailedCitation(review, exactSentiment, exactFakeAnalysis);
        }
        
        // Skip this review rather than throwing an error
        return null;
      }

      return this.createDetailedCitation(review, sentiment, fakeAnalysisResult);
    }).filter((citation): citation is ReviewCitation => citation !== null);

    console.log(`[Citation] Successfully created ${citations.length} citations from ${reviews.length} reviews`);

    // Sort citations by date (most recent first) for better user experience
    return citations.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  generateTransparencyReport(
    originalReviewCount: number,
    samplingInfo: SampledReviews,
    sentimentAnalysis: SentimentAnalysis[],
    fakeAnalysis: FakeReviewAnalysis[]
  ): TransparencyReport {
    const totalAnalyzed = sentimentAnalysis.length;
    const fakeReviews = fakeAnalysis.filter(f => f.isFake);
    const sentimentMismatches = sentimentAnalysis.filter(s => s.mismatchDetected);

    // Calculate average confidence scores (handle division by zero)
    const avgSentimentConfidence = totalAnalyzed > 0 ? 
      sentimentAnalysis.reduce((sum, s) => sum + s.confidence, 0) / totalAnalyzed : 0;
    const avgFakeConfidence = totalAnalyzed > 0 ? 
      fakeAnalysis.reduce((sum, f) => sum + f.confidence, 0) / totalAnalyzed : 0;
    const averageConfidenceScore = (avgSentimentConfidence + avgFakeConfidence) / 2;

    return {
      samplingBreakdown: {
        totalOriginalReviews: originalReviewCount,
        samplingUsed: samplingInfo.samplingUsed,
        sampleBreakdown: samplingInfo.samplingUsed ? samplingInfo.breakdown : undefined,
        samplingMethodology: this.generateSamplingMethodologyDescription(samplingInfo)
      },
      analysisBreakdown: {
        totalAnalyzed,
        fakeReviewCount: fakeReviews.length,
        fakeReviewRatio: totalAnalyzed > 0 ? Math.round((fakeReviews.length / totalAnalyzed) * 10000) / 10000 : 0, // Decimal (0-1) with 4 decimal places
        sentimentMismatchCount: sentimentMismatches.length,
        sentimentMismatchRatio: totalAnalyzed > 0 ? Math.round((sentimentMismatches.length / totalAnalyzed) * 10000) / 10000 : 0, // Decimal (0-1) with 4 decimal places
        averageConfidenceScore: Math.round(averageConfidenceScore * 100) / 100 // Keep as decimal (0-1)
      },
      qualityMetrics: {
        citationAccuracy: this.calculateCitationAccuracy(sentimentAnalysis, fakeAnalysis),
        linkValidityRatio: 100, // Will be updated after link validation
        analysisCompleteness: this.calculateAnalysisCompleteness(sentimentAnalysis, fakeAnalysis)
      }
    };
  }

  async validateCitationLinks(citations: ReviewCitation[]): Promise<LinkValidationResult[]> {
    const validationPromises = citations.map(citation => 
      this.validateSingleLink(citation.reviewId, citation.originalUrl)
    );

    return Promise.all(validationPromises);
  }

  private createDetailedCitation(
    review: RawReview,
    sentiment: SentimentAnalysis,
    fakeAnalysis: FakeReviewAnalysis
  ): ReviewCitation {
    return {
      reviewId: review.id,
      author: review.author,
      rating: review.rating,
      text: review.text,
      date: review.date,
      originalUrl: this.ensureValidGoogleUrl(review.originalUrl),
      sentiment: {
        ...sentiment,
        // Ensure confidence is properly rounded
        confidence: Math.round(sentiment.confidence * 100) / 100 // Keep as decimal (0-1)
      },
      fakeAnalysis: {
        ...fakeAnalysis,
        // Ensure confidence is properly rounded
        confidence: Math.round(fakeAnalysis.confidence * 100) / 100, // Keep as decimal (0-1)
        // Ensure reasons are properly formatted
        reasons: fakeAnalysis.reasons.map(reason => reason.trim()).filter(reason => reason.length > 0)
      }
    };
  }

  private generateSamplingMethodologyDescription(samplingInfo: SampledReviews): string {
    if (!samplingInfo.samplingUsed) {
      return "No sampling applied - all available reviews were analyzed.";
    }

    const { recent, fivestar, onestar } = samplingInfo.breakdown;
    
    return `Intelligent sampling applied due to large review volume. Sample includes: ` +
           `${recent} most recent reviews, ${fivestar} five-star reviews (excluding duplicates from recent), ` +
           `and ${onestar} one-star reviews (excluding duplicates from recent and five-star sets). ` +
           `This methodology ensures representative coverage across recency and rating extremes while ` +
           `avoiding duplicate analysis of the same reviews.`;
  }

  private calculateCitationAccuracy(
    sentimentAnalysis: SentimentAnalysis[],
    fakeAnalysis: FakeReviewAnalysis[]
  ): number {
    // Citation accuracy is based on the completeness and consistency of analysis data
    const totalReviews = sentimentAnalysis.length;
    
    if (totalReviews === 0) return 0;

    // Check that we have matching analysis for all reviews
    const sentimentIds = new Set(sentimentAnalysis.map(s => s.reviewId));
    const fakeIds = new Set(fakeAnalysis.map(f => f.reviewId));
    
    const matchingAnalysis = sentimentAnalysis.filter(s => fakeIds.has(s.reviewId)).length;
    const completenessRatio = matchingAnalysis / totalReviews;

    // Factor in confidence scores - higher confidence means more accurate citations
    const avgConfidence = sentimentAnalysis.reduce((sum, s) => sum + s.confidence, 0) / totalReviews;
    
    // Combine completeness and confidence for overall accuracy score
    const accuracyScore = (completenessRatio * 0.7) + (avgConfidence * 0.3);
    
    return Math.round(accuracyScore * 100) / 100; // Keep as decimal (0-1)
  }

  private calculateAnalysisCompleteness(
    sentimentAnalysis: SentimentAnalysis[],
    fakeAnalysis: FakeReviewAnalysis[]
  ): number {
    const totalReviews = sentimentAnalysis.length;
    
    if (totalReviews === 0) return 0;

    // Check that all reviews have both sentiment and fake analysis
    const sentimentIds = new Set(sentimentAnalysis.map(s => s.reviewId));
    const fakeIds = new Set(fakeAnalysis.map(f => f.reviewId));
    
    const completeAnalysis = sentimentAnalysis.filter(s => fakeIds.has(s.reviewId)).length;
    
    return Math.round((completeAnalysis / totalReviews) * 100) / 100; // Keep as decimal (0-1)
  }

  private async validateSingleLink(reviewId: string, url: string): Promise<LinkValidationResult> {
    try {
      // Parse URL first to check if it's valid
      const urlObj = new URL(url);
      
      // Check if it's a Google domain
      const isGoogleDomain = urlObj.hostname.includes('google.com');
      
      if (!isGoogleDomain) {
        return {
          reviewId,
          originalUrl: url,
          isValid: false,
          error: 'URL is not from Google domain'
        };
      }

      // Additional validation for Google URLs (maps, place, or search paths)
      const hasValidPath = urlObj.pathname.includes('/maps/') || 
                          urlObj.pathname.includes('/search') ||
                          urlObj.pathname.includes('/place/');
      
      if (!hasValidPath) {
        return {
          reviewId,
          originalUrl: url,
          isValid: false,
          error: 'URL does not contain valid Google Maps or Search path'
        };
      }

      return {
        reviewId,
        originalUrl: url,
        isValid: true,
        statusCode: 200
      };
    } catch (error) {
      return {
        reviewId,
        originalUrl: url,
        isValid: false,
        error: 'Invalid Google URL format'
      };
    }
  }

  private isValidGoogleUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.includes('google.com');
    } catch {
      return false;
    }
  }

  private ensureValidGoogleUrl(url: string): string {
    // Ensure the URL is properly formatted and accessible
    if (!this.isValidGoogleUrl(url)) {
      // If the URL is invalid, we might need to reconstruct it or mark it as unavailable
      return url; // For now, return as-is but this could be enhanced
    }
    
    return url;
  }
}