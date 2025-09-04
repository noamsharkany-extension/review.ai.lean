import { RawReview, SentimentAnalysis, FakeReviewAnalysis, AnalysisResults, ReviewCitation, SampledReviews } from '@shared/types';
import { ReviewCitationService } from './citation';

export interface VerdictGeneratorService {
  generateVerdict(
    reviews: RawReview[],
    sentimentAnalysis: SentimentAnalysis[],
    fakeAnalysis: FakeReviewAnalysis[],
    samplingInfo: SampledReviews,
    originalReviewCount: number
  ): AnalysisResults;
}

export class ReviewVerdictGenerator implements VerdictGeneratorService {
  private citationService: ReviewCitationService;

  constructor() {
    this.citationService = new ReviewCitationService();
  }

  generateVerdict(
    reviews: RawReview[],
    sentimentAnalysis: SentimentAnalysis[],
    fakeAnalysis: FakeReviewAnalysis[],
    samplingInfo: SampledReviews,
    originalReviewCount: number
  ): AnalysisResults {
    
    // Debug the array length mismatch issue
    console.log(`[VERDICT-DEBUG] Array lengths - Reviews: ${reviews.length}, Sentiment: ${sentimentAnalysis.length}, Fake: ${fakeAnalysis.length}`);
    // Filter out fake reviews for scoring calculations but keep them for transparency
    const authenticReviews = this.filterAuthenticReviews(reviews, fakeAnalysis);
    const authenticSentiment = this.filterAuthenticSentiment(sentimentAnalysis, fakeAnalysis);
    
    // Calculate verdict scores based on authentic reviews only
    const verdict = this.calculateVerdictScores(authenticReviews, authenticSentiment);
    
    // Calculate analysis metrics including fake review ratio
    const analysis = this.calculateAnalysisMetrics(sentimentAnalysis, fakeAnalysis);
    
    // Generate citations for all reviews (including fake ones for transparency)
    const citations = this.citationService.generateCitations(reviews, sentimentAnalysis, fakeAnalysis);
    
    // Generate transparency report
    const transparencyReport = this.citationService.generateTransparencyReport(
      originalReviewCount,
      samplingInfo,
      sentimentAnalysis,
      fakeAnalysis
    );
    
    return {
      verdict,
      sampling: {
        totalReviews: samplingInfo.reviews.length,
        samplingUsed: samplingInfo.samplingUsed,
        sampleBreakdown: samplingInfo.samplingUsed ? samplingInfo.breakdown : undefined
      },
      analysis,
      citations,
      transparencyReport
    };
  }

  private filterAuthenticReviews(reviews: RawReview[], fakeAnalysis: FakeReviewAnalysis[]): RawReview[] {
    const fakeReviewIds = new Set(
      fakeAnalysis.filter(analysis => analysis.isFake).map(analysis => analysis.reviewId)
    );
    
    return reviews.filter(review => !fakeReviewIds.has(review.id));
  }

  private filterAuthenticSentiment(
    sentimentAnalysis: SentimentAnalysis[], 
    fakeAnalysis: FakeReviewAnalysis[]
  ): SentimentAnalysis[] {
    const fakeReviewIds = new Set(
      fakeAnalysis.filter(analysis => analysis.isFake).map(analysis => analysis.reviewId)
    );
    
    return sentimentAnalysis.filter(sentiment => !fakeReviewIds.has(sentiment.reviewId));
  }

  private calculateVerdictScores(
    authenticReviews: RawReview[], 
    authenticSentiment: SentimentAnalysis[]
  ): { overallScore: number; trustworthiness: number; redFlags: number } {
    if (authenticReviews.length === 0) {
      return {
        overallScore: 0,
        trustworthiness: 0,
        redFlags: 100
      };
    }

    // Calculate overall score based on authentic reviews
    const averageRating = authenticReviews.reduce((sum, review) => sum + review.rating, 0) / authenticReviews.length;
    const overallScore = Math.round((averageRating / 5) * 100);

    // Calculate trustworthiness based on sentiment-rating consistency
    const sentimentMismatches = authenticSentiment.filter(s => s.mismatchDetected).length;
    const mismatchRatio = sentimentMismatches / authenticSentiment.length;
    const trustworthiness = Math.round((1 - mismatchRatio) * 100);

    // Calculate red flags based on various factors
    const redFlags = this.calculateRedFlags(authenticReviews, authenticSentiment, mismatchRatio);

    return {
      overallScore: Math.max(0, Math.min(100, overallScore)),
      trustworthiness: Math.max(0, Math.min(100, trustworthiness)),
      redFlags: Math.max(0, Math.min(100, redFlags))
    };
  }

  private calculateRedFlags(
    authenticReviews: RawReview[], 
    authenticSentiment: SentimentAnalysis[],
    mismatchRatio: number
  ): number {
    let redFlagScore = 0;

    // High mismatch ratio is a red flag
    if (mismatchRatio > 0.3) {
      redFlagScore += 40;
    } else if (mismatchRatio > 0.15) {
      redFlagScore += 20;
    }

    // Extreme rating distribution can be a red flag
    const ratingCounts = [0, 0, 0, 0, 0, 0]; // Index 0 unused, 1-5 for ratings
    authenticReviews.forEach(review => {
      ratingCounts[review.rating]++;
    });

    const totalReviews = authenticReviews.length;
    const extremeRatios = (ratingCounts[1] + ratingCounts[5]) / totalReviews;
    
    if (extremeRatios > 0.8) {
      redFlagScore += 30;
    } else if (extremeRatios > 0.6) {
      redFlagScore += 15;
    }

    // Low confidence in sentiment analysis is a red flag
    const avgConfidence = authenticSentiment.reduce((sum, s) => sum + s.confidence, 0) / authenticSentiment.length;
    if (avgConfidence < 0.6) {
      redFlagScore += 20;
    } else if (avgConfidence < 0.7) {
      redFlagScore += 10;
    }

    return Math.min(100, redFlagScore);
  }

  private calculateAnalysisMetrics(
    sentimentAnalysis: SentimentAnalysis[], 
    fakeAnalysis: FakeReviewAnalysis[]
  ): { fakeReviewRatio: number; sentimentMismatchRatio: number; confidenceScore: number } {
    // CRITICAL FIX: Use the maximum of both arrays to get the true total reviews count
    // The issue was that we were using sentimentAnalysis.length as totalReviews
    // but if fake analysis processed more reviews, the ratio would exceed 1.0
    const totalReviews = Math.max(sentimentAnalysis.length, fakeAnalysis.length);
    
    // Calculate fake review ratio
    const fakeReviews = fakeAnalysis.filter(analysis => analysis.isFake).length;
    const fakeReviewRatio = totalReviews > 0 ? fakeReviews / totalReviews : 0;
    
    // Debug logging to trace the 141% issue
    console.log(`[VERDICT-DEBUG] FIXED - Total reviews (max): ${totalReviews}, Fake reviews: ${fakeReviews}, Ratio: ${fakeReviewRatio}`);
    console.log(`[VERDICT-DEBUG] Array lengths - Sentiment: ${sentimentAnalysis.length}, Fake: ${fakeAnalysis.length}`);

    // Calculate sentiment mismatch ratio (from all reviews, not just authentic ones)
    const sentimentMismatches = sentimentAnalysis.filter(s => s.mismatchDetected).length;
    const sentimentMismatchRatio = totalReviews > 0 ? sentimentMismatches / totalReviews : 0;

    // Calculate overall confidence score
    const sentimentConfidence = sentimentAnalysis.reduce((sum, s) => sum + s.confidence, 0) / totalReviews;
    const fakeDetectionConfidence = fakeAnalysis.reduce((sum, f) => sum + f.confidence, 0) / totalReviews;
    const confidenceScore = (sentimentConfidence + fakeDetectionConfidence) / 2;

    // Fix the calculation - these should return 0-1 ratios, not percentages
    const finalFakeRatio = Math.min(1.0, fakeReviewRatio); // Cap at 1.0
    const finalMismatchRatio = Math.min(1.0, sentimentMismatchRatio); // Cap at 1.0  
    const finalConfidenceScore = Math.min(1.0, confidenceScore); // Cap at 1.0
    
    console.log(`[VERDICT-DEBUG] Final ratios - Fake: ${finalFakeRatio}, Mismatch: ${finalMismatchRatio}, Confidence: ${finalConfidenceScore}`);
    
    return {
      fakeReviewRatio: finalFakeRatio, // Returns 0-1 ratio
      sentimentMismatchRatio: finalMismatchRatio, // Returns 0-1 ratio
      confidenceScore: finalConfidenceScore // Returns 0-1 ratio
    };
  }


}