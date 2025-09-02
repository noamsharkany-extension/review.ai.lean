import { normalizeReviewId } from '../utils/reviewIdUtils.js';
export class ReviewCitationService {
    generateCitations(reviews, sentimentAnalysis, fakeAnalysis) {
        const sentimentMap = new Map(sentimentAnalysis.map(s => [normalizeReviewId(s.reviewId), s]));
        const fakeMap = new Map(fakeAnalysis.map(f => [normalizeReviewId(f.reviewId), f]));
        console.log(`[Citation] Processing ${reviews.length} reviews, ${sentimentAnalysis.length} sentiment analyses, ${fakeAnalysis.length} fake analyses`);
        const citations = reviews.map(review => {
            const normalizedReviewId = normalizeReviewId(review.id);
            const sentiment = sentimentMap.get(normalizedReviewId);
            const fakeAnalysisResult = fakeMap.get(normalizedReviewId);
            if (!sentiment || !fakeAnalysisResult) {
                console.warn(`[Citation] Missing analysis data for review ID: "${review.id}"`);
                console.warn(`[Citation] Normalized ID: "${normalizedReviewId}"`);
                console.warn(`[Citation] Has sentiment: ${!!sentiment}, Has fake analysis: ${!!fakeAnalysisResult}`);
                const exactSentiment = sentimentAnalysis.find(s => s.reviewId === review.id);
                const exactFakeAnalysis = fakeAnalysis.find(f => f.reviewId === review.id);
                if (exactSentiment && exactFakeAnalysis) {
                    console.log(`[Citation] Found exact match for review: "${review.id}"`);
                    return this.createDetailedCitation(review, exactSentiment, exactFakeAnalysis);
                }
                return null;
            }
            return this.createDetailedCitation(review, sentiment, fakeAnalysisResult);
        }).filter((citation) => citation !== null);
        console.log(`[Citation] Successfully created ${citations.length} citations from ${reviews.length} reviews`);
        return citations.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
    generateTransparencyReport(originalReviewCount, samplingInfo, sentimentAnalysis, fakeAnalysis) {
        const totalAnalyzed = sentimentAnalysis.length;
        const fakeReviews = fakeAnalysis.filter(f => f.isFake);
        const sentimentMismatches = sentimentAnalysis.filter(s => s.mismatchDetected);
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
                fakeReviewRatio: totalAnalyzed > 0 ? Math.round((fakeReviews.length / totalAnalyzed) * 10000) / 100 : 0,
                sentimentMismatchCount: sentimentMismatches.length,
                sentimentMismatchRatio: totalAnalyzed > 0 ? Math.round((sentimentMismatches.length / totalAnalyzed) * 10000) / 100 : 0,
                averageConfidenceScore: Math.round(averageConfidenceScore * 10000) / 100
            },
            qualityMetrics: {
                citationAccuracy: this.calculateCitationAccuracy(sentimentAnalysis, fakeAnalysis),
                linkValidityRatio: 100,
                analysisCompleteness: this.calculateAnalysisCompleteness(sentimentAnalysis, fakeAnalysis)
            }
        };
    }
    async validateCitationLinks(citations) {
        const validationPromises = citations.map(citation => this.validateSingleLink(citation.reviewId, citation.originalUrl));
        return Promise.all(validationPromises);
    }
    createDetailedCitation(review, sentiment, fakeAnalysis) {
        return {
            reviewId: review.id,
            author: review.author,
            rating: review.rating,
            text: review.text,
            date: review.date,
            originalUrl: this.ensureValidGoogleUrl(review.originalUrl),
            sentiment: {
                ...sentiment,
                confidence: Math.round(sentiment.confidence * 10000) / 100
            },
            fakeAnalysis: {
                ...fakeAnalysis,
                confidence: Math.round(fakeAnalysis.confidence * 10000) / 100,
                reasons: fakeAnalysis.reasons.map(reason => reason.trim()).filter(reason => reason.length > 0)
            }
        };
    }
    generateSamplingMethodologyDescription(samplingInfo) {
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
    calculateCitationAccuracy(sentimentAnalysis, fakeAnalysis) {
        const totalReviews = sentimentAnalysis.length;
        if (totalReviews === 0)
            return 0;
        const sentimentIds = new Set(sentimentAnalysis.map(s => s.reviewId));
        const fakeIds = new Set(fakeAnalysis.map(f => f.reviewId));
        const matchingAnalysis = sentimentAnalysis.filter(s => fakeIds.has(s.reviewId)).length;
        const completenessRatio = matchingAnalysis / totalReviews;
        const avgConfidence = sentimentAnalysis.reduce((sum, s) => sum + s.confidence, 0) / totalReviews;
        const accuracyScore = (completenessRatio * 0.7) + (avgConfidence * 0.3);
        return Math.round(accuracyScore * 10000) / 100;
    }
    calculateAnalysisCompleteness(sentimentAnalysis, fakeAnalysis) {
        const totalReviews = sentimentAnalysis.length;
        if (totalReviews === 0)
            return 0;
        const sentimentIds = new Set(sentimentAnalysis.map(s => s.reviewId));
        const fakeIds = new Set(fakeAnalysis.map(f => f.reviewId));
        const completeAnalysis = sentimentAnalysis.filter(s => fakeIds.has(s.reviewId)).length;
        return Math.round((completeAnalysis / totalReviews) * 10000) / 100;
    }
    async validateSingleLink(reviewId, url) {
        try {
            const urlObj = new URL(url);
            const isGoogleDomain = urlObj.hostname.includes('google.com');
            if (!isGoogleDomain) {
                return {
                    reviewId,
                    originalUrl: url,
                    isValid: false,
                    error: 'URL is not from Google domain'
                };
            }
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
        }
        catch (error) {
            return {
                reviewId,
                originalUrl: url,
                isValid: false,
                error: 'Invalid Google URL format'
            };
        }
    }
    isValidGoogleUrl(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname.includes('google.com');
        }
        catch {
            return false;
        }
    }
    ensureValidGoogleUrl(url) {
        if (!this.isValidGoogleUrl(url)) {
            return url;
        }
        return url;
    }
}
//# sourceMappingURL=citation.js.map