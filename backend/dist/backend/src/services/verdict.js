import { ReviewCitationService } from './citation';
export class ReviewVerdictGenerator {
    constructor() {
        this.citationService = new ReviewCitationService();
    }
    generateVerdict(reviews, sentimentAnalysis, fakeAnalysis, samplingInfo, originalReviewCount) {
        const authenticReviews = this.filterAuthenticReviews(reviews, fakeAnalysis);
        const authenticSentiment = this.filterAuthenticSentiment(sentimentAnalysis, fakeAnalysis);
        const verdict = this.calculateVerdictScores(authenticReviews, authenticSentiment);
        const analysis = this.calculateAnalysisMetrics(sentimentAnalysis, fakeAnalysis);
        const citations = this.citationService.generateCitations(reviews, sentimentAnalysis, fakeAnalysis);
        const transparencyReport = this.citationService.generateTransparencyReport(originalReviewCount, samplingInfo, sentimentAnalysis, fakeAnalysis);
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
    filterAuthenticReviews(reviews, fakeAnalysis) {
        const fakeReviewIds = new Set(fakeAnalysis.filter(analysis => analysis.isFake).map(analysis => analysis.reviewId));
        return reviews.filter(review => !fakeReviewIds.has(review.id));
    }
    filterAuthenticSentiment(sentimentAnalysis, fakeAnalysis) {
        const fakeReviewIds = new Set(fakeAnalysis.filter(analysis => analysis.isFake).map(analysis => analysis.reviewId));
        return sentimentAnalysis.filter(sentiment => !fakeReviewIds.has(sentiment.reviewId));
    }
    calculateVerdictScores(authenticReviews, authenticSentiment) {
        if (authenticReviews.length === 0) {
            return {
                overallScore: 0,
                trustworthiness: 0,
                redFlags: 100
            };
        }
        const averageRating = authenticReviews.reduce((sum, review) => sum + review.rating, 0) / authenticReviews.length;
        const overallScore = Math.round((averageRating / 5) * 100);
        const sentimentMismatches = authenticSentiment.filter(s => s.mismatchDetected).length;
        const mismatchRatio = sentimentMismatches / authenticSentiment.length;
        const trustworthiness = Math.round((1 - mismatchRatio) * 100);
        const redFlags = this.calculateRedFlags(authenticReviews, authenticSentiment, mismatchRatio);
        return {
            overallScore: Math.max(0, Math.min(100, overallScore)),
            trustworthiness: Math.max(0, Math.min(100, trustworthiness)),
            redFlags: Math.max(0, Math.min(100, redFlags))
        };
    }
    calculateRedFlags(authenticReviews, authenticSentiment, mismatchRatio) {
        let redFlagScore = 0;
        if (mismatchRatio > 0.3) {
            redFlagScore += 40;
        }
        else if (mismatchRatio > 0.15) {
            redFlagScore += 20;
        }
        const ratingCounts = [0, 0, 0, 0, 0, 0];
        authenticReviews.forEach(review => {
            ratingCounts[review.rating]++;
        });
        const totalReviews = authenticReviews.length;
        const extremeRatios = (ratingCounts[1] + ratingCounts[5]) / totalReviews;
        if (extremeRatios > 0.8) {
            redFlagScore += 30;
        }
        else if (extremeRatios > 0.6) {
            redFlagScore += 15;
        }
        const avgConfidence = authenticSentiment.reduce((sum, s) => sum + s.confidence, 0) / authenticSentiment.length;
        if (avgConfidence < 0.6) {
            redFlagScore += 20;
        }
        else if (avgConfidence < 0.7) {
            redFlagScore += 10;
        }
        return Math.min(100, redFlagScore);
    }
    calculateAnalysisMetrics(sentimentAnalysis, fakeAnalysis) {
        const totalReviews = sentimentAnalysis.length;
        const fakeReviews = fakeAnalysis.filter(analysis => analysis.isFake).length;
        const fakeReviewRatio = totalReviews > 0 ? fakeReviews / totalReviews : 0;
        const sentimentMismatches = sentimentAnalysis.filter(s => s.mismatchDetected).length;
        const sentimentMismatchRatio = totalReviews > 0 ? sentimentMismatches / totalReviews : 0;
        const sentimentConfidence = sentimentAnalysis.reduce((sum, s) => sum + s.confidence, 0) / totalReviews;
        const fakeDetectionConfidence = fakeAnalysis.reduce((sum, f) => sum + f.confidence, 0) / totalReviews;
        const confidenceScore = (sentimentConfidence + fakeDetectionConfidence) / 2;
        return {
            fakeReviewRatio: Math.round(fakeReviewRatio * 100) / 100,
            sentimentMismatchRatio: Math.round(sentimentMismatchRatio * 100) / 100,
            confidenceScore: Math.round(confidenceScore * 100) / 100
        };
    }
}
//# sourceMappingURL=verdict.js.map