import { SamplingEngine, RawReview, SampledReviews } from '@shared/types';

export class IntelligentSamplingEngine implements SamplingEngine {
  private static readonly SAMPLING_THRESHOLD = 300;
  private static readonly SAMPLE_SIZE_PER_CATEGORY = 100;

  shouldSample(reviews: RawReview[]): boolean {
    return reviews.length > IntelligentSamplingEngine.SAMPLING_THRESHOLD;
  }

  sampleReviews(reviews: RawReview[]): SampledReviews {
    if (!this.shouldSample(reviews)) {
      return {
        reviews,
        breakdown: {
          recent: reviews.length,
          fivestar: 0,
          onestar: 0,
        },
        samplingUsed: false,
      };
    }

    // Sort reviews by date (most recent first) - handle both Date objects and strings
    const sortedByDate = [...reviews].sort((a, b) => {
      const dateA = a.date instanceof Date ? a.date : new Date(a.date);
      const dateB = b.date instanceof Date ? b.date : new Date(b.date);
      return dateB.getTime() - dateA.getTime();
    });
    
    // Get 100 most recent reviews
    const recentReviews = sortedByDate.slice(0, IntelligentSamplingEngine.SAMPLE_SIZE_PER_CATEGORY);
    const recentIds = new Set(recentReviews.map(r => r.id));

    // Get 100 five-star reviews (excluding recent ones)
    const fiveStarReviews = reviews
      .filter(r => r.rating === 5 && !recentIds.has(r.id))
      .slice(0, IntelligentSamplingEngine.SAMPLE_SIZE_PER_CATEGORY);
    const fiveStarIds = new Set(fiveStarReviews.map(r => r.id));

    // Get 100 one-star reviews (excluding recent and five-star ones)
    const oneStarReviews = reviews
      .filter(r => r.rating === 1 && !recentIds.has(r.id) && !fiveStarIds.has(r.id))
      .slice(0, IntelligentSamplingEngine.SAMPLE_SIZE_PER_CATEGORY);

    // Combine all sampled reviews
    const sampledReviews = [...recentReviews, ...fiveStarReviews, ...oneStarReviews];

    return {
      reviews: sampledReviews,
      breakdown: {
        recent: recentReviews.length,
        fivestar: fiveStarReviews.length,
        onestar: oneStarReviews.length,
      },
      samplingUsed: true,
    };
  }

  /**
   * Generates a detailed report explaining the sampling methodology used
   */
  generateSamplingReport(originalCount: number, sampledResult: SampledReviews): string {
    if (!sampledResult.samplingUsed) {
      return `All ${originalCount} reviews were analyzed (no sampling required as count ≤ 300).`;
    }

    const { breakdown } = sampledResult;
    const totalSampled = breakdown.recent + breakdown.fivestar + breakdown.onestar;

    return `Intelligent sampling applied to ${originalCount} reviews:
• ${breakdown.recent} most recent reviews
• ${breakdown.fivestar} five-star reviews (excluding duplicates from recent set)
• ${breakdown.onestar} one-star reviews (excluding duplicates from recent and five-star sets)

Total analyzed: ${totalSampled} reviews (${((totalSampled / originalCount) * 100).toFixed(1)}% of original dataset)

Methodology: This sampling approach ensures representation across time (recent reviews), positive sentiment (five-star), and negative sentiment (one-star) while avoiding duplicate analysis of the same reviews across categories.`;
  }
}