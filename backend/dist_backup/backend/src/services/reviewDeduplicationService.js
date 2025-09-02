import { createReviewId } from '../utils/reviewIdUtils.js';
export class ReviewDeduplicationService {
    constructor(debugMode = false) {
        this.debugMode = debugMode;
    }
    debugLog(message) {
        if (this.debugMode) {
            console.log(`[ReviewDedup Debug] ${message}`);
        }
    }
    deduplicateReviews(reviews) {
        this.debugLog(`Starting deduplication for ${reviews.length} reviews`);
        const uniqueReviews = [];
        const seenIds = new Set();
        const seenContent = new Set();
        const duplicateIds = [];
        for (const review of reviews) {
            if (seenIds.has(review.id)) {
                this.debugLog(`Duplicate ID detected: ${review.id}`);
                duplicateIds.push(review.id);
                continue;
            }
            const contentId = createReviewId(review.author, review.text, review.rating);
            if (seenContent.has(contentId)) {
                this.debugLog(`Duplicate content detected for: ${review.author} - ${review.text.substring(0, 50)}...`);
                duplicateIds.push(review.id);
                continue;
            }
            const isDuplicate = this.findNearDuplicate(review, uniqueReviews);
            if (isDuplicate) {
                this.debugLog(`Near-duplicate detected for: ${review.author} - ${review.text.substring(0, 50)}...`);
                duplicateIds.push(review.id);
                continue;
            }
            seenIds.add(review.id);
            seenContent.add(contentId);
            uniqueReviews.push(review);
        }
        const duplicateCount = reviews.length - uniqueReviews.length;
        this.debugLog(`Deduplication complete: ${uniqueReviews.length} unique, ${duplicateCount} duplicates removed`);
        return {
            uniqueReviews,
            duplicateCount,
            duplicateIds
        };
    }
    findNearDuplicate(review, existingReviews) {
        const threshold = 0.85;
        for (const existing of existingReviews) {
            if (existing.author === review.author && existing.text.trim() === review.text.trim()) {
                this.debugLog(`Exact duplicate found: ${review.author} - "${review.text.substring(0, 50)}..."`);
                return true;
            }
            if (existing.author === review.author && existing.rating === review.rating) {
                const similarity = this.calculateSimilarity(review.text, existing.text);
                if (similarity >= threshold) {
                    this.debugLog(`High similarity (${(similarity * 100).toFixed(1)}%) between reviews from ${review.author}`);
                    return true;
                }
            }
            if (review.text.trim() === existing.text.trim() && review.text.length > 50) {
                this.debugLog(`Same text with different authors: "${review.author}" vs "${existing.author}" - likely extraction issue`);
                return true;
            }
        }
        return false;
    }
    calculateSimilarity(text1, text2) {
        const normalize = (text) => {
            return text
                .toLowerCase()
                .replace(/[^\u0590-\u05FF\u0000-\u007F\s]/g, '')
                .replace(/\s+/g, ' ')
                .trim();
        };
        const normalized1 = normalize(text1);
        const normalized2 = normalize(text2);
        if (normalized1 === normalized2) {
            return 1.0;
        }
        if (normalized1.length < 20 || normalized2.length < 20) {
            return normalized1 === normalized2 ? 1.0 : 0.0;
        }
        const words1 = new Set(normalized1.split(' ').filter(w => w.length > 1));
        const words2 = new Set(normalized2.split(' ').filter(w => w.length > 1));
        if (words1.size === 0 && words2.size === 0) {
            return 1.0;
        }
        if (words1.size === 0 || words2.size === 0) {
            return 0.0;
        }
        const intersection = new Set([...words1].filter(word => words2.has(word)));
        const union = new Set([...words1, ...words2]);
        const jaccardSimilarity = intersection.size / union.size;
        const lengthSimilarity = 1 - Math.abs(normalized1.length - normalized2.length) / Math.max(normalized1.length, normalized2.length);
        if (jaccardSimilarity > 0.7 && lengthSimilarity > 0.8) {
            return Math.max(jaccardSimilarity, 0.9);
        }
        return jaccardSimilarity;
    }
    mergeAndDeduplicate(collections) {
        this.debugLog('Merging and deduplicating across collections');
        const allReviews = [];
        const collectionLabels = {};
        for (const [collectionName, reviews] of Object.entries(collections)) {
            for (const review of reviews) {
                allReviews.push(review);
                collectionLabels[review.id] = collectionName;
            }
        }
        const deduplicationResult = this.deduplicateReviews(allReviews);
        const result = {};
        for (const collectionName of Object.keys(collections)) {
            result[collectionName] = [];
        }
        for (const review of deduplicationResult.uniqueReviews) {
            const originalCollection = collectionLabels[review.id];
            if (originalCollection && result[originalCollection]) {
                result[originalCollection].push(review);
            }
        }
        this.debugLog(`Merge complete. Removed ${deduplicationResult.duplicateCount} duplicates across collections`);
        return result;
    }
}
//# sourceMappingURL=reviewDeduplicationService.js.map