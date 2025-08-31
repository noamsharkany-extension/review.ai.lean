export class IntelligentSamplingEngine {
    shouldSample(reviews) {
        return reviews.length > IntelligentSamplingEngine.SAMPLING_THRESHOLD;
    }
    sampleReviews(reviews) {
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
        const sortedByDate = [...reviews].sort((a, b) => {
            const dateA = typeof a.date === 'string' ? new Date(a.date) : a.date;
            const dateB = typeof b.date === 'string' ? new Date(b.date) : b.date;
            return dateB.getTime() - dateA.getTime();
        });
        const recentReviews = sortedByDate.slice(0, IntelligentSamplingEngine.SAMPLE_SIZE_PER_CATEGORY);
        const recentIds = new Set(recentReviews.map(r => r.id));
        const fiveStarReviews = reviews
            .filter(r => r.rating === 5 && !recentIds.has(r.id))
            .slice(0, IntelligentSamplingEngine.SAMPLE_SIZE_PER_CATEGORY);
        const fiveStarIds = new Set(fiveStarReviews.map(r => r.id));
        const oneStarReviews = reviews
            .filter(r => r.rating === 1 && !recentIds.has(r.id) && !fiveStarIds.has(r.id))
            .slice(0, IntelligentSamplingEngine.SAMPLE_SIZE_PER_CATEGORY);
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
    generateSamplingReport(originalCount, sampledResult) {
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
IntelligentSamplingEngine.SAMPLING_THRESHOLD = 300;
IntelligentSamplingEngine.SAMPLE_SIZE_PER_CATEGORY = 100;
//# sourceMappingURL=sampling.js.map