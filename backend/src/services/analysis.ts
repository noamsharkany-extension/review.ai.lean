import OpenAI from 'openai';
import { AnalysisEngine, RawReview, SentimentAnalysis, FakeReviewAnalysis } from '@shared/types';
import { ReviewQualityFilter } from './qualityFilter.js';
import { containsSanitationHazard } from '../utils/hazards.js';

export class OpenAIAnalysisEngine implements AnalysisEngine {
  private openai: OpenAI;
  private modelName: string;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.modelName = process.env.OPENAI_MODEL || 'gpt-5';
  }

  async analyzeSentiment(reviews: RawReview[]): Promise<SentimentAnalysis[]> {
    // Check if we should use fallback analysis only (for rate limit issues or testing)
    if (process.env.USE_FALLBACK_ANALYSIS === 'true') {
      console.log('Using fallback analysis instead of OpenAI due to USE_FALLBACK_ANALYSIS=true');
      return reviews.map(review => this.createFallbackSentimentAnalysis(review));
    }

    console.log(`🧠 Starting optimized sentiment analysis for ${reviews.length} reviews`);

    // Apply quality filtering to avoid sending low-value content to the model
    const { gptReviews, skippedReviews, stats } = ReviewQualityFilter.filterForGPTAnalysis(reviews);
    console.log(
      `📊 Quality filtering results: total=${stats.total}, sentToGPT=${stats.sentToGpt}, ` +
      `skippedEmpty=${stats.skippedEmpty}, skippedEmojiOnly=${stats.skippedEmojiOnly}`
    );
    
    // Optimized batch processing with parallel execution
    const batchSize = 12; // Increased from 2 to 12 for cost efficiency
    const maxConcurrent = 3; // Process 3 batches in parallel
    const batches = [];
    
    // Create all batches
    for (let i = 0; i < reviews.length; i += batchSize) {
      batches.push(reviews.slice(i, i + batchSize));
    }
    
    console.log(`📦 Processing ${batches.length} batches of ${batchSize} reviews each with ${maxConcurrent} concurrent requests`);
    
    const results: SentimentAnalysis[] = [];
    
    // Process batches in parallel chunks
    for (let i = 0; i < batches.length; i += maxConcurrent) {
      const batchChunk = batches.slice(i, i + maxConcurrent);
      
      // Process current chunk in parallel
      const chunkPromises = batchChunk.map(batch => this.processSentimentBatch(batch));
      const chunkResults = await Promise.all(chunkPromises);
      
      // Flatten and add results
      for (const batchResult of chunkResults) {
        results.push(...batchResult);
      }
      
      console.log(`✅ Completed chunk ${Math.floor(i/maxConcurrent) + 1}/${Math.ceil(batches.length/maxConcurrent)} (${results.length} reviews processed)`);
      
      // Small delay between parallel chunks (not individual batches)
      if (i + maxConcurrent < batches.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Add fallback analyses for skipped reviews
    const skippedResults = skippedReviews.map(r => this.createFallbackSentimentAnalysis(r));

    // Combine by original order using reviewId mapping
    const byId = new Map<string, SentimentAnalysis>();
    for (const r of [...results, ...skippedResults]) byId.set(r.reviewId, r);
    const combined: SentimentAnalysis[] = reviews.map(r => byId.get(r.id) || this.createFallbackSentimentAnalysis(r));

    console.log(`🎉 Sentiment analysis complete: ${combined.length} reviews analyzed (${results.length} via OpenAI, ${skippedResults.length} fallback)`);
    return combined;
  }

  private async processSentimentBatch(reviews: RawReview[]): Promise<SentimentAnalysis[]> {
    const maxRetries = 3;
    let attempt = 0;
    
    while (attempt < maxRetries) {
      try {
        const prompt = this.buildSentimentPrompt(reviews);
        
        const response = await this.openai.chat.completions.create({
          model: this.modelName,
          messages: [
            {
              role: 'system',
              content: 'You are an expert sentiment analyzer. Analyze the sentiment of reviews and detect mismatches between star ratings and text sentiment. Return ONLY valid JSON with no prose, no markdown, no code fences.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0,
          max_completion_tokens: 2000,
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new Error('No response content from OpenAI');
        }

        return this.parseSentimentResponse(content, reviews);
      } catch (error: any) {
        attempt++;
        console.error(`Error in sentiment analysis batch (attempt ${attempt}/${maxRetries}):`, error?.message || error);
        
        // Check if it's a rate limit error
        if (error?.status === 429 || error?.message?.includes('rate limit') || error?.message?.includes('Too many requests')) {
          if (attempt < maxRetries) {
            // Smart exponential backoff: 30s, 60s, 120s (much faster than before)
            const baseDelay = Math.pow(2, attempt) * 30000; // 30s, 60s, 120s
            const jitter = Math.random() * 5000; // Add up to 5s random delay
            const delayMs = baseDelay + jitter;
            
            console.log(`⏳ Rate limit hit, waiting ${Math.round(delayMs/1000)}s before retry ${attempt}/${maxRetries}...`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
            continue;
          } else {
            // After all retries, throw a user-friendly rate limit error
            throw new Error(`OpenAI rate limit exceeded. Please wait a few minutes and try again.`);
          }
        } else {
          // For 400 unsupported parameter or other client errors, do not keep retrying
          if (error?.status === 400 || /unsupported parameter|max_tokens/i.test(error?.message || '')) {
            break;
          }
          // For non-rate-limit errors, don't retry immediately
          if (attempt < maxRetries) {
            console.log(`Non-rate-limit error, retrying attempt ${attempt}/${maxRetries}...`);
            await new Promise(resolve => setTimeout(resolve, 2000)); // Brief delay for other errors
            continue;
          }
        }
      }
    }
    
    // If all retries failed, return fallback analysis
    console.warn('All retry attempts failed, using fallback sentiment analysis');
    return reviews.map(review => this.createFallbackSentimentAnalysis(review));
  }

  private buildSentimentPrompt(reviews: RawReview[]): string {
    const reviewsText = reviews.map(r => `${r.id}|${r.rating}|${r.text}` ).join('\n');

    return `You will receive multiple reviews, one per line, in the format: ID|Rating|Text.

Analyze each review's TEXT sentiment as one of: "positive", "negative", or "neutral".
Use the RATING only to check for sentiment-rating mismatch (do not let rating affect sentiment itself).

Conservative mismatch rules:
- mismatchDetected=true only if (Rating in {1,2} AND sentiment="positive") OR (Rating in {4,5} AND sentiment="negative").
- Otherwise mismatchDetected=false. Do not flag short, vague, or mixed texts.
- Be extra conservative for non-English texts to avoid false mismatches.

Health-safety override:
- If the TEXT mentions clear sanitation/health hazards (e.g., cockroaches, infestation, mold, food poisoning), treat sentiment as "negative" with high confidence regardless of rating.

Lexical pitfall guidance:
- Do not treat the word "never" as negative when used as positive emphasis (e.g., "I've never had such a great X", "never seen such delicious Y"). Consider overall tone and modifiers.

Return ONLY a JSON array of the same length/order as input. No comments or extra keys.
Schema per item: {"reviewId":"<ID>","sentiment":"positive|negative|neutral","confidence":<0..1>,"mismatchDetected":<boolean>}

Input:
${reviewsText}`;
  }

  private parseSentimentResponse(content: string, reviews: RawReview[]): SentimentAnalysis[] {
    try {
      // Clean the response to extract JSON
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('No JSON array found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      if (!Array.isArray(parsed)) {
        throw new Error('Response is not an array');
      }

      // Build map from items by reviewId for robust alignment
      const itemById = new Map<string, any>();
      for (const item of parsed) {
        if (item && typeof item.reviewId === 'string') {
          itemById.set(String(item.reviewId), item);
        }
      }

      // Map back to expected order; fallback for missing items
      return reviews.map(review => {
        const item = itemById.get(review.id);
        const base: SentimentAnalysis = item ? {
          reviewId: review.id,
          sentiment: this.validateSentiment(item.sentiment),
          confidence: this.validateConfidence(item.confidence),
          mismatchDetected: Boolean(item.mismatchDetected)
        } : this.createFallbackSentimentAnalysis(review);

        // Post-process: enforce sanitation hazard override
        if (containsSanitationHazard(review.text)) {
          const forcedSentiment: SentimentAnalysis = {
            reviewId: base.reviewId,
            sentiment: 'negative',
            confidence: Math.max(base.confidence, 0.85),
            mismatchDetected: review.rating >= 4 // apply conservative mismatch rule
          };
          return forcedSentiment;
        }

        return base;
      });
    } catch (error) {
      console.error('Error parsing sentiment response:', error);
      // Return fallback analysis
      return reviews.map(review => this.createFallbackSentimentAnalysis(review));
    }
  }

  private validateSentiment(sentiment: any): 'positive' | 'negative' | 'neutral' {
    if (['positive', 'negative', 'neutral'].includes(sentiment)) {
      return sentiment;
    }
    return 'neutral'; // Default fallback
  }

  private validateConfidence(confidence: any): number {
    const num = Number(confidence);
    if (isNaN(num) || num < 0 || num > 1) {
      return 0.5; // Default fallback
    }
    return num;
  }

  private createFallbackSentimentAnalysis(review: RawReview): SentimentAnalysis {
    // Enhanced rule-based fallback with Hebrew and English keyword analysis
    const text = review.text.toLowerCase();
    let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
    let confidence = 0.5; // Base confidence for fallback
    let mismatchDetected = false;

    // Strong override for sanitation hazards
    if (containsSanitationHazard(text)) {
      sentiment = 'negative';
      confidence = 0.9;
      mismatchDetected = review.rating >= 4;
      return {
        reviewId: review.id,
        sentiment,
        confidence,
        mismatchDetected
      };
    }

    // Positive and negative keywords for better sentiment detection (English + Hebrew)
    const positiveWords = [
      // English
      'excellent', 'amazing', 'great', 'good', 'fantastic', 'wonderful', 'perfect', 'love', 'best', 'awesome', 'outstanding', 'superb', 'delicious', 'friendly', 'helpful', 'recommend',
      // Hebrew (lowercase equivalents)
      'מעולה', 'נהדר', 'טוב', 'מושלם', 'אוהב', 'הכי טוב', 'ממליץ', 'נחמד', 'יפה', 'טעים', 'מדהים', 'חמוד', 'מקסים'
    ];
    const negativeWords = [
      // English
      'terrible', 'awful', 'bad', 'horrible', 'worst', 'hate', 'disgusting', 'rude', 'poor', 'disappointing', 'waste', 'avoid', 'pathetic', 'useless',
      // Hebrew (lowercase equivalents)
      'גרוע', 'נורא', 'איום', 'רע', 'מאכזב', 'שונא', 'לא טוב', 'בזבוז', 'אל תבואו', 'חבל על הזמן', 'יבש'
    ];

    // Count positive and negative words
    const positiveCount = positiveWords.filter(word => text.includes(word)).length;
    let negativeCount = negativeWords.filter(word => text.includes(word)).length;

    // Adjust for hyperbolic "never" expressions that are actually positive
    const hyperbolicNever = /(never\s+(seen|had|tasted|experienced))/i.test(text);
    if (hyperbolicNever) {
      // Ensure we don't accidentally count a negative only because of "never"
      // Since we removed 'never' from list, this is a no-op for keywords but keeps future safety if list changes
      negativeCount = Math.max(0, negativeCount);
    }

    // Determine sentiment based on keywords first, then rating
    if (positiveCount > negativeCount) {
      sentiment = 'positive';
      confidence = Math.min(0.7, 0.5 + (positiveCount * 0.1));
    } else if (negativeCount > positiveCount) {
      sentiment = 'negative';
      confidence = Math.min(0.7, 0.5 + (negativeCount * 0.1));
    } else {
      // Fallback to rating-based sentiment
      if (review.rating >= 4) {
        sentiment = 'positive';
      } else if (review.rating <= 2) {
        sentiment = 'negative';
      }
    }

    // Enhanced mismatch detection with Hebrew consideration
    // Only flag very clear mismatches - be extremely conservative
    if ((review.rating <= 1 && sentiment === 'positive' && positiveCount >= 3) || 
        (review.rating >= 5 && sentiment === 'negative' && negativeCount >= 3)) {
      mismatchDetected = true;
      confidence = Math.min(confidence, 0.8); // Very high confidence threshold for mismatches
    }

    return {
      reviewId: review.id,
      sentiment,
      confidence,
      mismatchDetected
    };
  }

  async detectFakeReviews(reviews: RawReview[]): Promise<FakeReviewAnalysis[]> {
    // Check if we should use fallback analysis only (for rate limit issues or testing)
    if (process.env.USE_FALLBACK_ANALYSIS === 'true') {
      console.log('Using fallback fake detection instead of OpenAI due to USE_FALLBACK_ANALYSIS=true');
      return reviews.map(review => this.createFallbackFakeAnalysis(review));
    }

    console.log(`🕵️ Starting optimized fake review detection for ${reviews.length} reviews`);

    // Apply quality filtering to avoid sending low-value content to the model
    const { gptReviews, skippedReviews, stats } = ReviewQualityFilter.filterForGPTAnalysis(reviews);
    console.log(
      `📊 Quality filtering results: total=${stats.total}, sentToGPT=${stats.sentToGpt}, ` +
      `skippedEmpty=${stats.skippedEmpty}, skippedEmojiOnly=${stats.skippedEmojiOnly}`
    );
    
    // Optimized batch processing with parallel execution
    const batchSize = 6; // Increased from 1 to 6 for cost efficiency (smaller than sentiment due to longer prompts)
    const maxConcurrent = 2; // Process 2 batches in parallel (conservative for fake detection)
    const batches = [];
    
    // Create all batches
    for (let i = 0; i < reviews.length; i += batchSize) {
      batches.push(reviews.slice(i, i + batchSize));
    }
    
    console.log(`🔍 Processing ${batches.length} batches of ${batchSize} reviews each with ${maxConcurrent} concurrent requests`);
    
    const results: FakeReviewAnalysis[] = [];
    
    // Process batches in parallel chunks
    for (let i = 0; i < batches.length; i += maxConcurrent) {
      const batchChunk = batches.slice(i, i + maxConcurrent);
      
      // Process current chunk in parallel
      const chunkPromises = batchChunk.map(batch => this.processFakeDetectionBatch(batch));
      const chunkResults = await Promise.all(chunkPromises);
      
      // Flatten and add results
      for (const batchResult of chunkResults) {
        results.push(...batchResult);
      }
      
      console.log(`✅ Completed fake detection chunk ${Math.floor(i/maxConcurrent) + 1}/${Math.ceil(batches.length/maxConcurrent)} (${results.length} reviews processed)`);
      
      // Small delay between parallel chunks
      if (i + maxConcurrent < batches.length) {
        await new Promise(resolve => setTimeout(resolve, 750));
      }
    }

    // Add fallback analyses for skipped reviews
    const skippedResults = skippedReviews.map(r => this.createFallbackFakeAnalysis(r));

    // Combine by original order using reviewId mapping
    const byId = new Map<string, FakeReviewAnalysis>();
    for (const r of [...results, ...skippedResults]) byId.set(r.reviewId, r);
    const combined: FakeReviewAnalysis[] = reviews.map(r => byId.get(r.id) || this.createFallbackFakeAnalysis(r));

    console.log(`🎉 Fake review detection complete: ${combined.length} reviews analyzed (${results.length} via OpenAI, ${skippedResults.length} fallback)`);
    return combined;
  }

  private async processFakeDetectionBatch(reviews: RawReview[]): Promise<FakeReviewAnalysis[]> {
    const maxRetries = 3;
    let attempt = 0;
    
    while (attempt < maxRetries) {
      try {
        const prompt = this.buildFakeDetectionPrompt(reviews);
        
        const response = await this.openai.chat.completions.create({
          model: this.modelName,
          messages: [
            {
              role: 'system',
              content: 'You are an expert at detecting fake, bot-generated, or suspicious reviews. Analyze language patterns, inconsistencies, and authenticity markers. Return ONLY valid JSON with no prose, no markdown, no code fences.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0,
          max_completion_tokens: 3000,
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new Error('No response content from OpenAI');
        }

        return this.parseFakeDetectionResponse(content, reviews);
      } catch (error: any) {
        attempt++;
        console.error(`Error in fake detection batch (attempt ${attempt}/${maxRetries}):`, error?.message || error);
        
        // Check if it's a rate limit error
        if (error?.status === 429 || error?.message?.includes('rate limit') || error?.message?.includes('Too many requests')) {
          if (attempt < maxRetries) {
            // Smart exponential backoff: 30s, 60s, 120s
            const baseDelay = Math.pow(2, attempt) * 30000; // 30s, 60s, 120s
            const jitter = Math.random() * 5000;
            const delayMs = baseDelay + jitter;
            
            console.log(`⏳ Rate limit hit in fake detection, waiting ${Math.round(delayMs/1000)}s before retry ${attempt}/${maxRetries}...`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
            continue;
          } else {
            throw new Error(`OpenAI rate limit exceeded during fake review detection. Please wait a few minutes and try again.`);
          }
        } else {
          // For 400 unsupported parameter or other client errors, do not keep retrying
          if (error?.status === 400 || /unsupported parameter|max_tokens/i.test(error?.message || '')) {
            break;
          }
          if (attempt < maxRetries) {
            console.log(`Non-rate-limit error in fake detection, retrying attempt ${attempt}/${maxRetries}...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
          }
        }
      }
    }
    
    // If all retries failed, return fallback analysis
    console.warn('All fake detection retry attempts failed, using fallback analysis');
    return reviews.map(review => this.createFallbackFakeAnalysis(review));
  }

  private buildFakeDetectionPrompt(reviews: RawReview[]): string {
    const reviewsText = reviews.map(r => `${r.id}|${r.author}|${r.rating}|${r.text}` ).join('\n');

    return `You will receive multiple reviews, one per line, in the format: ID|Author|Rating|Text.

Identify reviews that appear fake/bot-generated/suspicious using linguistic and behavioral cues: generic language with no specifics, repetitive/promotional tone, copy-paste patterns, unnatural phrasing, extreme sentiment with no details. Do not penalize brevity alone or language differences.

Return ONLY a JSON array with exactly the same number of elements and the same order as the input lines. No extra keys. No comments. No markdown. No code fences.
Schema of each element: {"reviewId":"<ID>","isFake":<boolean>,"confidence":<0..1>,"reasons":["string", ...]}
Constraints:
- Be very conservative: flag only obviously fake reviews with clear signals.
- For Hebrew and non-English texts, be extra conservative.
- Keep up to 3 short reasons focused on concrete signals when isFake=true; use [] when false.

Input:
${reviewsText}`;
  }

  private parseFakeDetectionResponse(content: string, reviews: RawReview[]): FakeReviewAnalysis[] {
    try {
      // Clean the response to extract JSON
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('No JSON array found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      if (!Array.isArray(parsed)) {
        throw new Error('Response is not an array');
      }

      // Build map from items by reviewId for robust alignment
      const itemById = new Map<string, any>();
      for (const item of parsed) {
        if (item && typeof item.reviewId === 'string') {
          itemById.set(String(item.reviewId), item);
        }
      }

      // Map back to expected order; fallback for missing items
      return reviews.map(review => {
        const item = itemById.get(review.id);
        let base: FakeReviewAnalysis;
        if (!item) {
          base = this.createFallbackFakeAnalysis(review);
        } else {
          base = {
            reviewId: review.id,
            isFake: Boolean(item.isFake),
            confidence: this.validateConfidence(item.confidence),
            reasons: this.validateReasons(item.reasons)
          };
        }

        // Post-process: sanitation hazard reports are unlikely to be bots; be conservative
        if (containsSanitationHazard(review.text)) {
          return {
            reviewId: base.reviewId,
            isFake: false,
            confidence: Math.max(base.confidence, 0.7),
            reasons: []
          };
        }

        return base;
      });
    } catch (error) {
      console.error('Error parsing fake detection response:', error);
      // Return fallback analysis
      return reviews.map(review => this.createFallbackFakeAnalysis(review));
    }
  }

  private validateReasons(reasons: any): string[] {
    if (!Array.isArray(reasons)) {
      return [];
    }
    
    return reasons
      .filter(reason => typeof reason === 'string' && reason.trim().length > 0)
      .map(reason => reason.trim())
      .slice(0, 5); // Limit to 5 reasons max
  }

  private createFallbackFakeAnalysis(review: RawReview): FakeReviewAnalysis {
    // More conservative rule-based fallback for fake detection
    const reasons: string[] = [];
    let isFake = false;
    let confidence = 0.15; // Lower base confidence - be more conservative

    // Strong authenticity bias for sanitation hazard reports
    const text = review.text.toLowerCase();
    if (containsSanitationHazard(text)) {
      return {
        reviewId: review.id,
        isFake: false,
        confidence: 0.7,
        reasons: []
      };
    }

    // Basic heuristics for fake detection
    const wordCount = review.text.split(/\s+/).length;

    // Check for overly generic language - be more restrictive
    const genericPhrases = [
      'highly recommend this place', 'amazing service and food', 'great experience overall', 
      'excellent quality and service', 'outstanding service perfect', 'perfect place to eat',
      'terrible service never coming back', 'worst experience of my life', 'never again waste of money'
    ];
    
    const genericCount = genericPhrases.filter(phrase => text.includes(phrase)).length;
    
    // Only flag if multiple generic phrases AND very short
    if (genericCount >= 2 && wordCount < 15) {
      reasons.push('Multiple generic phrases with minimal detail');
      isFake = true;
      confidence = 0.35;
    }

    // Check for extremely short reviews with extreme ratings - be more lenient
    if (wordCount < 3 && (review.rating === 1 || review.rating === 5)) {
      reasons.push('Extremely brief with extreme rating');
      isFake = true;
      confidence = 0.25;
    }

    // Check for promotional language patterns - require more evidence
    const promotionalWords = ['best ever', 'perfect amazing', 'incredible outstanding', 'absolutely perfect'];
    const promotionalCount = promotionalWords.filter(word => text.includes(word)).length;
    
    if (promotionalCount >= 2 && wordCount < 10) {
      reasons.push('Excessive promotional language in brief review');
      isFake = true;
      confidence = 0.3;
    }

    // Don't flag Hebrew reviews as easily - they may seem different due to language patterns
    const hasHebrew = /[\u0590-\u05FF]/.test(review.text);
    if (hasHebrew && isFake) {
      confidence = Math.max(0.1, confidence - 0.15); // Reduce confidence for Hebrew text
      if (confidence < 0.2) {
        isFake = false; // Don't flag Hebrew reviews with low confidence
        reasons.length = 0; // Clear the reasons array
      }
    }

    // Only flag as fake if confidence is above minimum threshold
    const minConfidenceThreshold = 0.3; // Require at least 30% confidence to flag as fake
    if (confidence < minConfidenceThreshold) {
      isFake = false;
      reasons.length = 0; // Clear reasons if not confident enough
    }

    return {
      reviewId: review.id,
      isFake,
      confidence,
      reasons
    };
  }
}