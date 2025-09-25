import { RawReview } from '@shared/types';

export interface FilterResult {
  gptReviews: RawReview[];
  skippedReviews: RawReview[];
  stats: {
    total: number;
    sentToGpt: number;
    skippedEmpty: number;
    skippedEmojiOnly: number;
  };
}

export class ReviewQualityFilter {
  static isEmojiOnly(text: string): boolean {
    const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
    const withoutEmojis = (text || '').replace(emojiRegex, '').trim();
    return withoutEmojis.length === 0 && (text || '').trim().length > 0;
  }

  static isEmpty(text: string): boolean {
    return (text || '').trim().length === 0;
  }

  static filterForGPTAnalysis(reviews: RawReview[]): FilterResult {
    const gptReviews: RawReview[] = [];
    const skippedReviews: RawReview[] = [];

    let skippedEmpty = 0;
    let skippedEmojiOnly = 0;

    for (const review of reviews) {
      if (this.isEmpty(review.text)) {
        skippedReviews.push(review);
        skippedEmpty++;
        continue;
      }

      if (this.isEmojiOnly(review.text)) {
        skippedReviews.push(review);
        skippedEmojiOnly++;
        continue;
      }

      gptReviews.push(review);
    }

    return {
      gptReviews,
      skippedReviews,
      stats: {
        total: reviews.length,
        sentToGpt: gptReviews.length,
        skippedEmpty,
        skippedEmojiOnly
      }
    };
  }
}


