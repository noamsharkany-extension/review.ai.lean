import { RawReview } from '@shared/types';
import { createReviewId } from '../utils/reviewIdUtils.js';

export interface DeduplicationResult {
  uniqueReviews: RawReview[];
  duplicateCount: number;
  duplicateIds: string[];
}

export class ReviewDeduplicationService {
  private debugMode: boolean;

  constructor(debugMode: boolean = false) {
    this.debugMode = debugMode;
  }

  private debugLog(message: string): void {
    if (this.debugMode) {
      console.log(`[ReviewDedup Debug] ${message}`);
    }
  }

  /**
   * Deduplicate reviews using multiple strategies
   */
  deduplicateReviews(reviews: RawReview[]): DeduplicationResult {
    this.debugLog(`Starting deduplication for ${reviews.length} reviews`);
    
    const uniqueReviews: RawReview[] = [];
    const seenIds = new Set<string>();
    const seenContent = new Set<string>();
    const duplicateIds: string[] = [];
    
    for (const review of reviews) {
      // Strategy 1: Check by review ID first
      if (seenIds.has(review.id)) {
        this.debugLog(`Duplicate ID detected: ${review.id}`);
        duplicateIds.push(review.id);
        continue;
      }
      
      // Strategy 2: Check by content hash (author + text + rating)
      const contentId = createReviewId(review.author, review.text, review.rating);
      if (seenContent.has(contentId)) {
        this.debugLog(`Duplicate content detected for: ${review.author} - ${review.text.substring(0, 50)}...`);
        duplicateIds.push(review.id);
        continue;
      }
      
      // Strategy 3: Check for near-identical content (fuzzy matching)
      const isDuplicate = this.findNearDuplicate(review, uniqueReviews);
      if (isDuplicate) {
        this.debugLog(`Near-duplicate detected for: ${review.author} - ${review.text.substring(0, 50)}...`);
        duplicateIds.push(review.id);
        continue;
      }
      
      // Not a duplicate - add to unique list
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

  /**
   * Find near-duplicate reviews using fuzzy matching
   */
  private findNearDuplicate(review: RawReview, existingReviews: RawReview[]): boolean {
    const threshold = 0.85; // 85% similarity threshold
    
    for (const existing of existingReviews) {
      // Quick filters first
      if (existing.author !== review.author) continue;
      if (existing.rating !== review.rating) continue;
      
      // Calculate text similarity
      const similarity = this.calculateSimilarity(review.text, existing.text);
      if (similarity >= threshold) {
        this.debugLog(`High similarity (${(similarity * 100).toFixed(1)}%) between reviews`);
        return true;
      }
    }
    
    return false;
  }

  /**
   * Calculate text similarity using Jaccard similarity
   */
  private calculateSimilarity(text1: string, text2: string): number {
    // Normalize texts
    const normalize = (text: string): string => {
      return text
        .toLowerCase()
        .replace(/[^\u0590-\u05FF\u0000-\u007F\s]/g, '') // Keep Hebrew, ASCII and spaces
        .replace(/\s+/g, ' ')
        .trim();
    };
    
    const normalized1 = normalize(text1);
    const normalized2 = normalize(text2);
    
    // If texts are very similar after normalization, they're likely duplicates
    if (normalized1 === normalized2) {
      return 1.0;
    }
    
    // Create word sets for Jaccard similarity
    const words1 = new Set(normalized1.split(' ').filter(w => w.length > 1));
    const words2 = new Set(normalized2.split(' ').filter(w => w.length > 1));
    
    if (words1.size === 0 && words2.size === 0) {
      return 1.0; // Both empty
    }
    
    if (words1.size === 0 || words2.size === 0) {
      return 0.0; // One empty
    }
    
    // Calculate Jaccard similarity: intersection / union
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  /**
   * Merge collections and remove duplicates across all
   */
  mergeAndDeduplicate(collections: { [key: string]: RawReview[] }): { [key: string]: RawReview[] } {
    this.debugLog('Merging and deduplicating across collections');
    
    const allReviews: RawReview[] = [];
    const collectionLabels: { [reviewId: string]: string } = {};
    
    // Collect all reviews with their collection labels
    for (const [collectionName, reviews] of Object.entries(collections)) {
      for (const review of reviews) {
        allReviews.push(review);
        collectionLabels[review.id] = collectionName;
      }
    }
    
    // Deduplicate all reviews together
    const deduplicationResult = this.deduplicateReviews(allReviews);
    
    // Rebuild collections with deduplicated reviews
    const result: { [key: string]: RawReview[] } = {};
    for (const collectionName of Object.keys(collections)) {
      result[collectionName] = [];
    }
    
    // Assign deduplicated reviews back to their original collections
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