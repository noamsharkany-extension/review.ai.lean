import { RawReview, SentimentAnalysis, FakeReviewAnalysis, AnalysisResults, ReviewCitation, SampledReviews } from '@shared/types';
import { ReviewCitationService } from './citation';
import { SANITATION_HAZARD_KEYWORDS } from '../utils/hazards.js';

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
    // Filter out fake reviews for scoring calculations but keep them for transparency
    const authenticReviews = this.filterAuthenticReviews(reviews, fakeAnalysis);
    const authenticSentiment = this.filterAuthenticSentiment(sentimentAnalysis, fakeAnalysis);
    
    // Calculate verdict scores based on authentic reviews only
    const verdict = this.calculateVerdictScores(authenticReviews, authenticSentiment, fakeAnalysis);
    
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
    authenticSentiment: SentimentAnalysis[],
    fakeAnalysis: FakeReviewAnalysis[]
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
    const redFlags = this.calculateRedFlags(authenticReviews, authenticSentiment, mismatchRatio, fakeAnalysis);

    return {
      overallScore: Math.max(0, Math.min(100, overallScore)),
      trustworthiness: Math.max(0, Math.min(100, trustworthiness)),
      redFlags: Math.max(0, Math.min(100, redFlags))
    };
  }

  private calculateRedFlags(
    authenticReviews: RawReview[], 
    authenticSentiment: SentimentAnalysis[],
    mismatchRatio: number,
    fakeAnalysis: FakeReviewAnalysis[]
  ): number {
    let redFlagScore = 0;

    // High mismatch ratio is a red flag (tuned for more conservative mismatch detection)
    if (mismatchRatio > 0.22) {
      redFlagScore += 30;
    } else if (mismatchRatio > 0.10) {
      redFlagScore += 15;
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

    // Low confidence in sentiment analysis is a red flag (tuned)
    const avgConfidence = authenticSentiment.reduce((sum, s) => sum + s.confidence, 0) / authenticSentiment.length;
    if (avgConfidence < 0.5) {
      redFlagScore += 20;
    } else if (avgConfidence < 0.6) {
      redFlagScore += 10;
    }

    // Presence of suspected fake reviews among sampled data is a red flag (conservative weighting)
    const suspectedFakeCount = fakeAnalysis.filter(a => a.isFake).length;
    const totalConsidered = authenticReviews.length + suspectedFakeCount;
    const fakeRatio = totalConsidered > 0 ? suspectedFakeCount / totalConsidered : 0;
    if (fakeRatio > 0.3) {
      redFlagScore += 35;
    } else if (fakeRatio > 0.15) {
      redFlagScore += 20;
    }

    // Lightweight sanitation hazard bump based on keywords in review texts (shared list)
    try {
      const text = authenticReviews.map(r => (r.text || '').toLowerCase()).join('\n');
      let hits = 0;
      for (const kw of SANITATION_HAZARD_KEYWORDS) {
        if (text.includes(kw)) hits++;
      }
      if (hits > 0) {
        redFlagScore += Math.min(20, 5 + hits * 2);
      }
    } catch {}

    return Math.min(100, redFlagScore);
  }

  private calculateAnalysisMetrics(
    sentimentAnalysis: SentimentAnalysis[], 
    fakeAnalysis: FakeReviewAnalysis[]
  ): { fakeReviewRatio: number; sentimentMismatchRatio: number; confidenceScore: number } {
    const totalReviews = sentimentAnalysis.length;
    
    // Calculate fake review ratio
    const fakeReviews = fakeAnalysis.filter(analysis => analysis.isFake).length;
    const fakeReviewRatio = totalReviews > 0 ? fakeReviews / totalReviews : 0;

    // Calculate sentiment mismatch ratio (from all reviews, not just authentic ones)
    const sentimentMismatches = sentimentAnalysis.filter(s => s.mismatchDetected).length;
    const sentimentMismatchRatio = totalReviews > 0 ? sentimentMismatches / totalReviews : 0;

    // Calculate overall confidence score
    const sentimentConfidence = sentimentAnalysis.reduce((sum, s) => sum + s.confidence, 0) / totalReviews;
    const fakeDetectionConfidence = fakeAnalysis.reduce((sum, f) => sum + f.confidence, 0) / totalReviews;
    const confidenceScore = (sentimentConfidence + fakeDetectionConfidence) / 2;

    return {
      fakeReviewRatio: Math.round(fakeReviewRatio * 100) / 100, // Round to 2 decimal places
      sentimentMismatchRatio: Math.round(sentimentMismatchRatio * 100) / 100,
      confidenceScore: Math.min(100, Math.round(confidenceScore * 100) / 100) // Cap at 100%
    };
  }


}