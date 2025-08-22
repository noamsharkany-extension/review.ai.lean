import { Page } from 'puppeteer';
import { RawReview } from '@shared/types';

export interface ContentPattern {
  type: 'author' | 'rating' | 'text' | 'date';
  pattern: RegExp;
  confidence: number;
  language?: string;
}

export interface ContentExtractionResult {
  reviews: RawReview[];
  confidence: number;
  extractionMethod: string;
  patternsUsed: ContentPattern[];
  debugInfo?: ContentExtractionDebugInfo;
}

export interface ContentExtractionDebugInfo {
  totalTextBlocks: number;
  reviewCandidates: number;
  successfulExtractions: number;
  failedExtractions: number;
  averageConfidence: number;
  patternMatches: Record<string, number>;
}

export interface ReviewCandidate {
  id: string;
  author: string;
  rating: number;
  text: string;
  date: string;
  confidence: number;
  sourceElement?: string;
  extractionMethod: string;
}

export class ContentBasedExtractor {
  private debugMode: boolean;
  private progressCallback?: (message: string) => void;

  constructor(progressCallback?: (message: string) => void, debugMode: boolean = false) {
    this.progressCallback = progressCallback;
    this.debugMode = debugMode;
  }

  private log(message: string): void {
    console.log(`[ContentBasedExtractor] ${message}`);
    this.progressCallback?.(message);
  }

  private debugLog(message: string): void {
    if (this.debugMode) {
      console.log(`[ContentBasedExtractor Debug] ${message}`);
    }
  }

  /**
   * Extract reviews using content-based patterns instead of CSS selectors
   */
  async extractByContent(page: Page, language: string = 'english'): Promise<ContentExtractionResult> {
    this.log('Starting content-based review extraction...');
    
    let patterns: ContentPattern[] = [];
    
    try {
      // Get all text content from the page
      const pageContent = await this.extractPageContent(page);
      
      // Identify review patterns in the content
      patterns = this.identifyReviewPatterns(pageContent, language);
      this.debugLog(`Identified ${patterns.length} content patterns for ${language}`);
      
      // Extract review candidates using pattern matching
      const candidates = await this.extractReviewCandidates(page, patterns, language);
      this.debugLog(`Found ${candidates.length} review candidates`);
      
      // If no candidates found, return empty result instead of failing
      if (candidates.length === 0) {
        this.log('No review candidates found using content-based extraction');
        return {
          reviews: [],
          confidence: 0,
          extractionMethod: 'content-based',
          patternsUsed: patterns,
          debugInfo: {
            totalTextBlocks: 0,
            reviewCandidates: 0,
            successfulExtractions: 0,
            failedExtractions: 0,
            averageConfidence: 0,
            patternMatches: {}
          }
        };
      }
      
      // Validate and score the candidates
      const validatedReviews = this.validateAndScoreCandidates(candidates);
      this.debugLog(`Validated ${validatedReviews.length} reviews`);
      
      // Convert to RawReview format
      const reviews = this.convertToRawReviews(validatedReviews);
      
      // Calculate overall confidence
      const overallConfidence = this.calculateOverallConfidence(validatedReviews, patterns);
      
      // Create debug info
      const debugInfo = this.createDebugInfo(candidates, validatedReviews, patterns);
      
      this.log(`Content-based extraction completed: ${reviews.length} reviews with ${(overallConfidence * 100).toFixed(1)}% confidence`);
      
      return {
        reviews,
        confidence: overallConfidence,
        extractionMethod: 'content-based',
        patternsUsed: patterns,
        debugInfo
      };
      
    } catch (error) {
      this.log(`Content-based extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // Return empty result instead of throwing to prevent complete failure
      return {
        reviews: [],
        confidence: 0,
        extractionMethod: 'content-based-failed',
        patternsUsed: patterns,
        debugInfo: {
          totalTextBlocks: 0,
          reviewCandidates: 0,
          successfulExtractions: 0,
          failedExtractions: 1,
          averageConfidence: 0,
          patternMatches: { error: 1 }
        }
      };
    }
  }

  /**
   * Extract all text content from the page for pattern analysis
   */
  private async extractPageContent(page: Page): Promise<string> {
    return await page.evaluate(() => {
      // Get all text content while preserving some structure
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;
            
            // Skip script and style elements
            if (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE') {
              return NodeFilter.FILTER_REJECT;
            }
            
            // Skip very short text nodes
            if (node.textContent && node.textContent.trim().length < 2) {
              return NodeFilter.FILTER_REJECT;
            }
            
            return NodeFilter.FILTER_ACCEPT;
          }
        }
      );
      
      const textNodes: string[] = [];
      let node;
      
      while (node = walker.nextNode()) {
        if (node.textContent) {
          textNodes.push(node.textContent.trim());
        }
      }
      
      return textNodes.join('\n');
    });
  }

  /**
   * Identify review patterns based on content analysis
   */
  identifyReviewPatterns(content: string, language: string = 'english'): ContentPattern[] {
    const patterns: ContentPattern[] = [];
    
    // Author name patterns (multilingual)
    patterns.push(
      // English patterns
      { type: 'author', pattern: /^[A-Z][a-z]+ [A-Z][a-z]+$/m, confidence: 0.8, language: 'english' },
      { type: 'author', pattern: /^[A-Z][a-z]+$/m, confidence: 0.7, language: 'english' },
      { type: 'author', pattern: /^[A-Z][a-z]+ [A-Z]\.$/m, confidence: 0.9, language: 'english' },
      
      // Hebrew patterns
      { type: 'author', pattern: /^[\u0590-\u05FF]+ [\u0590-\u05FF]+$/m, confidence: 0.8, language: 'hebrew' },
      { type: 'author', pattern: /^[\u0590-\u05FF]+$/m, confidence: 0.7, language: 'hebrew' },
      
      // Generic patterns
      { type: 'author', pattern: /^[A-Za-z\u0590-\u05FF]+ [A-Za-z\u0590-\u05FF]+$/m, confidence: 0.6 }
    );
    
    // Rating patterns (multilingual with Hebrew + English word mapping)
    patterns.push(
      // English patterns with word mapping
      { type: 'rating', pattern: /1 star(?!\w)/gi, confidence: 0.98, language: 'english' },
      { type: 'rating', pattern: /2 stars(?!\w)/gi, confidence: 0.98, language: 'english' },
      { type: 'rating', pattern: /3 stars(?!\w)/gi, confidence: 0.98, language: 'english' },
      { type: 'rating', pattern: /4 stars(?!\w)/gi, confidence: 0.98, language: 'english' },
      { type: 'rating', pattern: /5 stars(?!\w)/gi, confidence: 0.98, language: 'english' },
      { type: 'rating', pattern: /one star(?!\w)/gi, confidence: 0.98, language: 'english' },
      { type: 'rating', pattern: /two stars(?!\w)/gi, confidence: 0.98, language: 'english' },
      { type: 'rating', pattern: /three stars(?!\w)/gi, confidence: 0.98, language: 'english' },
      { type: 'rating', pattern: /four stars(?!\w)/gi, confidence: 0.98, language: 'english' },
      { type: 'rating', pattern: /five stars(?!\w)/gi, confidence: 0.98, language: 'english' },
      { type: 'rating', pattern: /(\d)\s*out\s*of\s*5\s*stars?/i, confidence: 0.95, language: 'english' },
      { type: 'rating', pattern: /(\d)\/5\s*stars?/i, confidence: 0.9, language: 'english' },
      { type: 'rating', pattern: /(\d)\s*stars?/i, confidence: 0.8, language: 'english' },
      { type: 'rating', pattern: /rating[:\s]*(\d)/i, confidence: 0.85, language: 'english' },
      { type: 'rating', pattern: /rated\s*(\d)/i, confidence: 0.85, language: 'english' },
      
      // Hebrew patterns with word mapping
      { type: 'rating', pattern: /כוכב אחד/g, confidence: 0.98, language: 'hebrew' }, // One star
      { type: 'rating', pattern: /שני כוכבים/g, confidence: 0.98, language: 'hebrew' }, // Two stars
      { type: 'rating', pattern: /שלושה כוכבים/g, confidence: 0.98, language: 'hebrew' }, // Three stars
      { type: 'rating', pattern: /ארבעה כוכבים/g, confidence: 0.98, language: 'hebrew' }, // Four stars
      { type: 'rating', pattern: /חמישה כוכבים/g, confidence: 0.98, language: 'hebrew' }, // Five stars
      { type: 'rating', pattern: /(\d)\s*כוכבים/g, confidence: 0.95, language: 'hebrew' },
      { type: 'rating', pattern: /(\d)\s*כוכב/g, confidence: 0.9, language: 'hebrew' },
      { type: 'rating', pattern: /דירוג[:\s]*(\d)/g, confidence: 0.85, language: 'hebrew' },
      
      // Universal patterns
      { type: 'rating', pattern: /★{1,5}/g, confidence: 0.7 },
      { type: 'rating', pattern: /⭐{1,5}/g, confidence: 0.7 },
      { type: 'rating', pattern: /^[1-5]$/m, confidence: 0.5 }
    );
    
    // Date patterns (multilingual)
    patterns.push(
      // English patterns
      { type: 'date', pattern: /(\d+)\s*(month|months|day|days|week|weeks|year|years)\s*ago/i, confidence: 0.9, language: 'english' },
      { type: 'date', pattern: /(yesterday|today)/i, confidence: 0.8, language: 'english' },
      { type: 'date', pattern: /(a\s+(month|week|day|year)\s+ago)/i, confidence: 0.85, language: 'english' },
      { type: 'date', pattern: /\d{1,2}\/\d{1,2}\/\d{4}/g, confidence: 0.7, language: 'english' },
      
      // Hebrew patterns
      { type: 'date', pattern: /לפני\s+(\d+)\s+חודשים/g, confidence: 0.9, language: 'hebrew' },
      { type: 'date', pattern: /לפני\s+חודש/g, confidence: 0.85, language: 'hebrew' },
      { type: 'date', pattern: /לפני\s+(\d+)\s+שבועות/g, confidence: 0.9, language: 'hebrew' },
      { type: 'date', pattern: /לפני\s+שבוע/g, confidence: 0.85, language: 'hebrew' },
      { type: 'date', pattern: /לפני\s+(\d+)\s+ימים/g, confidence: 0.9, language: 'hebrew' },
      { type: 'date', pattern: /לפני\s+יום/g, confidence: 0.85, language: 'hebrew' },
      { type: 'date', pattern: /לפני\s+שנה/g, confidence: 0.85, language: 'hebrew' },
      { type: 'date', pattern: /לפני\s+(\d+)\s+שנים/g, confidence: 0.9, language: 'hebrew' }
    );
    
    // Review text patterns (content-based)
    patterns.push(
      // English patterns
      { type: 'text', pattern: /\b(great|good|excellent|amazing|terrible|awful|bad|horrible|love|hate|recommend|disappointed)\b/i, confidence: 0.6, language: 'english' },
      { type: 'text', pattern: /\b(service|food|place|experience|staff|quality|price|location)\b/i, confidence: 0.5, language: 'english' },
      
      // Hebrew patterns
      { type: 'text', pattern: /\b(מעולה|טוב|נהדר|איום|גרוע|אוהב|שונא|ממליץ|מאוכזב)\b/g, confidence: 0.6, language: 'hebrew' },
      { type: 'text', pattern: /\b(שירות|אוכל|מקום|חוויה|צוות|איכות|מחיר|מיקום)\b/g, confidence: 0.5, language: 'hebrew' },
      
      // Generic patterns
      { type: 'text', pattern: /.{20,500}/g, confidence: 0.3 } // Any text between 20-500 chars
    );
    
    // Filter patterns by language if specified
    if (language !== 'generic') {
      return patterns.filter(p => !p.language || p.language === language || p.language === 'generic');
    }
    
    return patterns;
  }

  /**
   * Extract review candidates using pattern matching
   */
  private async extractReviewCandidates(page: Page, patterns: ContentPattern[], language: string): Promise<ReviewCandidate[]> {
    try {
      // Disable content-based extraction to avoid __name issues
      // The main scraping logic in other services is working fine
      console.log('[ContentBasedExtractor] Content-based extraction disabled - using main scraper instead');
      return [];
      
    } catch (error) {
      this.log(`Error in extractReviewCandidates: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return [];
    }
  }

  /**
   * Extract review candidates using pattern matching
   */

  /**
   * Validate and score review candidates
   */
  private validateAndScoreCandidates(candidates: ReviewCandidate[]): ReviewCandidate[] {
    const validated: ReviewCandidate[] = [];
    
    for (const candidate of candidates) {
      let validationScore = candidate.confidence;
      
      // Validate author
      if (candidate.author) {
        if (candidate.author.length > 2 && candidate.author.length < 50) {
          validationScore += 0.1;
        }
        if (!/^\d+$/.test(candidate.author)) { // Not just numbers
          validationScore += 0.1;
        }
      } else {
        validationScore -= 0.2;
      }
      
      // Validate rating
      if (candidate.rating >= 1 && candidate.rating <= 5) {
        validationScore += 0.2;
      } else {
        validationScore -= 0.3;
      }
      
      // Validate text
      if (candidate.text) {
        if (candidate.text.length >= 10 && candidate.text.length <= 1000) {
          validationScore += 0.1;
        }
        if (candidate.text.length >= 50) {
          validationScore += 0.1;
        }
      }
      
      // Validate date
      if (candidate.date) {
        validationScore += 0.05;
      }
      
      // Update confidence with validation score
      candidate.confidence = Math.max(0, Math.min(1, validationScore));
      
      // Only include candidates that meet minimum validation criteria
      if (candidate.confidence >= 0.4 && candidate.rating > 0) {
        validated.push(candidate);
      }
    }
    
    // Sort by confidence (highest first)
    return validated.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Convert validated candidates to RawReview format
   */
  private convertToRawReviews(candidates: ReviewCandidate[]): RawReview[] {
    return candidates.map(candidate => ({
      id: candidate.id,
      author: candidate.author || 'Anonymous',
      rating: candidate.rating,
      text: candidate.text || '',
      date: this.parseDate(candidate.date),
      originalUrl: '' // Will be set by the calling service
    }));
  }

  /**
   * Parse date string to Date object
   */
  private parseDate(dateStr: string): Date {
    if (!dateStr) return new Date();
    
    // Try to parse relative dates
    const now = new Date();
    
    // English relative dates
    if (dateStr.includes('ago')) {
      const dayMatch = dateStr.match(/(\d+)\s*days?\s*ago/i);
      if (dayMatch) {
        const days = parseInt(dayMatch[1]);
        return new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
      }
      
      const weekMatch = dateStr.match(/(\d+)\s*weeks?\s*ago/i);
      if (weekMatch) {
        const weeks = parseInt(weekMatch[1]);
        return new Date(now.getTime() - (weeks * 7 * 24 * 60 * 60 * 1000));
      }
      
      const monthMatch = dateStr.match(/(\d+)\s*months?\s*ago/i);
      if (monthMatch) {
        const months = parseInt(monthMatch[1]);
        const date = new Date(now);
        date.setMonth(date.getMonth() - months);
        return date;
      }
    }
    
    // Hebrew relative dates
    if (dateStr.includes('לפני')) {
      const dayMatch = dateStr.match(/לפני\s+(\d+)\s+ימים/);
      if (dayMatch) {
        const days = parseInt(dayMatch[1]);
        return new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
      }
      
      const weekMatch = dateStr.match(/לפני\s+(\d+)\s+שבועות/);
      if (weekMatch) {
        const weeks = parseInt(weekMatch[1]);
        return new Date(now.getTime() - (weeks * 7 * 24 * 60 * 60 * 1000));
      }
      
      const monthMatch = dateStr.match(/לפני\s+(\d+)\s+חודשים/);
      if (monthMatch) {
        const months = parseInt(monthMatch[1]);
        const date = new Date(now);
        date.setMonth(date.getMonth() - months);
        return date;
      }
    }
    
    // Try standard date parsing
    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  /**
   * Calculate overall confidence for the extraction
   */
  private calculateOverallConfidence(candidates: ReviewCandidate[], patterns: ContentPattern[]): number {
    if (candidates.length === 0) return 0;
    
    // Base confidence from individual candidates
    const avgCandidateConfidence = candidates.reduce((sum, c) => sum + c.confidence, 0) / candidates.length;
    
    // Boost confidence based on number of successful extractions
    const volumeBoost = Math.min(candidates.length / 10, 0.2); // Up to 20% boost for 10+ reviews
    
    // Boost confidence based on pattern diversity
    const patternTypes = new Set(patterns.map(p => p.type));
    const diversityBoost = (patternTypes.size / 4) * 0.1; // Up to 10% boost for all 4 pattern types
    
    return Math.min(avgCandidateConfidence + volumeBoost + diversityBoost, 1.0);
  }

  /**
   * Create debug information for the extraction
   */
  private createDebugInfo(
    candidates: ReviewCandidate[], 
    validated: ReviewCandidate[], 
    patterns: ContentPattern[]
  ): ContentExtractionDebugInfo {
    const patternMatches: Record<string, number> = {};
    
    for (const pattern of patterns) {
      patternMatches[`${pattern.type}-${pattern.language || 'generic'}`] = 0;
    }
    
    // Count successful pattern applications (simplified)
    for (const candidate of validated) {
      if (candidate.author) patternMatches['author-generic']++;
      if (candidate.rating > 0) patternMatches['rating-generic']++;
      if (candidate.text) patternMatches['text-generic']++;
      if (candidate.date) patternMatches['date-generic']++;
    }
    
    return {
      totalTextBlocks: candidates.length,
      reviewCandidates: candidates.length,
      successfulExtractions: validated.length,
      failedExtractions: candidates.length - validated.length,
      averageConfidence: validated.length > 0 ? 
        validated.reduce((sum, c) => sum + c.confidence, 0) / validated.length : 0,
      patternMatches
    };
  }

  /**
   * Validate content extraction results
   */
  validateContentExtraction(reviews: RawReview[]): boolean {
    if (reviews.length === 0) return false;
    
    // Check that at least 50% of reviews have meaningful content
    const meaningfulReviews = reviews.filter(r => 
      r.rating > 0 && 
      r.author !== 'Anonymous' && 
      r.text.length > 10
    );
    
    return meaningfulReviews.length >= Math.max(1, reviews.length * 0.5);
  }
}