import OpenAI from 'openai';
import { AnalysisEngine, RawReview, SentimentAnalysis, FakeReviewAnalysis } from '@shared/types';

export class OpenAIAnalysisEngine implements AnalysisEngine {
  private openai: OpenAI;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async analyzeSentiment(reviews: RawReview[]): Promise<SentimentAnalysis[]> {
    // Check if we should use fallback analysis only (for rate limit issues or testing)
    if (process.env.USE_FALLBACK_ANALYSIS === 'true') {
      console.log('Using fallback analysis instead of OpenAI due to USE_FALLBACK_ANALYSIS=true');
      return reviews.map(review => this.createFallbackSentimentAnalysis(review));
    }

    console.log(`🧠 Starting optimized sentiment analysis for ${reviews.length} reviews`);
    
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

    console.log(`🎉 Sentiment analysis complete: ${results.length} reviews analyzed`);
    return results;
  }

  private async processSentimentBatch(reviews: RawReview[]): Promise<SentimentAnalysis[]> {
    const maxRetries = 3;
    let attempt = 0;
    
    while (attempt < maxRetries) {
      try {
        const prompt = this.buildSentimentPrompt(reviews);
        
        const response = await this.openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: 'You are an expert sentiment analyzer. Analyze the sentiment of reviews and detect mismatches between star ratings and text sentiment. Return only valid JSON.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.1, // Low temperature for consistent results
          max_tokens: 2000,
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
    const reviewsText = reviews.map(r => 
      `${r.id}|${r.rating}|${r.text}`
    ).join('\n');

    return `Analyze sentiment and detect rating mismatches. Format: ID|Rating|Text

${reviewsText}

Return JSON: [{"reviewId":"id","sentiment":"positive|negative|neutral","confidence":0.85,"mismatchDetected":false}]

Mismatch rules: Only flag clear mismatches - 1-2★ with clearly positive text, 4-5★ with clearly negative text. Be conservative with Hebrew text analysis.`;
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

      // Validate and map results
      return parsed.map((item, index) => {
        const review = reviews[index];
        if (!review) {
          throw new Error(`No review found for index ${index}`);
        }

        return {
          reviewId: review.id,
          sentiment: this.validateSentiment(item.sentiment),
          confidence: this.validateConfidence(item.confidence),
          mismatchDetected: Boolean(item.mismatchDetected)
        };
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

    // Positive and negative keywords for better sentiment detection (English + Hebrew)
    const positiveWords = [
      // English
      'excellent', 'amazing', 'great', 'good', 'fantastic', 'wonderful', 'perfect', 'love', 'best', 'awesome', 'outstanding', 'superb', 'delicious', 'friendly', 'helpful', 'recommend',
      // Hebrew (lowercase equivalents)
      'מעולה', 'נהדר', 'טוב', 'מושלם', 'אוהב', 'הכי טוב', 'ממליץ', 'נחמד', 'יפה', 'טעים', 'מדהים', 'חמוד', 'מקסים'
    ];
    const negativeWords = [
      // English
      'terrible', 'awful', 'bad', 'horrible', 'worst', 'hate', 'disgusting', 'rude', 'poor', 'disappointing', 'waste', 'never', 'avoid', 'pathetic', 'useless',
      // Hebrew (lowercase equivalents)
      'גרוע', 'נורא', 'איום', 'רע', 'מאכזב', 'שונא', 'לא טוב', 'בזבוז', 'אל תבואו', 'חבל על הזמן', 'יבש'
    ];

    // Count positive and negative words
    const positiveCount = positiveWords.filter(word => text.includes(word)).length;
    const negativeCount = negativeWords.filter(word => text.includes(word)).length;

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
    // Only flag clear mismatches - be more conservative
    if ((review.rating <= 2 && sentiment === 'positive' && positiveCount >= 2) || 
        (review.rating >= 4 && sentiment === 'negative' && negativeCount >= 2)) {
      mismatchDetected = true;
      confidence = Math.min(confidence, 0.7); // Increased confidence threshold
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

    console.log(`🎉 Fake review detection complete: ${results.length} reviews analyzed`);
    return results;
  }

  private async processFakeDetectionBatch(reviews: RawReview[]): Promise<FakeReviewAnalysis[]> {
    const maxRetries = 3;
    let attempt = 0;
    
    while (attempt < maxRetries) {
      try {
        const prompt = this.buildFakeDetectionPrompt(reviews);
        
        const response = await this.openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: 'You are an expert at detecting fake, bot-generated, or suspicious reviews. Analyze language patterns, inconsistencies, and authenticity markers. Return only valid JSON.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.1, // Low temperature for consistent results
          max_tokens: 3000,
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
    const reviewsText = reviews.map(r => 
      `${r.id}|${r.author}|${r.rating}|${r.text}`
    ).join('\n');

    return `Detect fake reviews. Format: ID|Author|Rating|Text

${reviewsText}

Check: Generic language, no specifics, promotional tone, unnatural patterns, extreme sentiment.
Be especially careful with non-English text - different languages may have different natural patterns.

Return JSON: [{"reviewId":"id","isFake":false,"confidence":0.7,"reasons":[]}]

Be very conservative - flag only obviously fake reviews. Avoid flagging reviews just for being brief or in different languages.`;
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

      // Validate and map results
      return parsed.map((item, index) => {
        const review = reviews[index];
        if (!review) {
          throw new Error(`No review found for index ${index}`);
        }

        return {
          reviewId: review.id,
          isFake: Boolean(item.isFake),
          confidence: this.validateConfidence(item.confidence),
          reasons: this.validateReasons(item.reasons)
        };
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

    // Basic heuristics for fake detection
    const text = review.text.toLowerCase();
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
        reasons = [];
      }
    }

    return {
      reviewId: review.id,
      isFake,
      confidence,
      reasons
    };
  }
}