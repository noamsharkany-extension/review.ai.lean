// Utility functions for handling review IDs consistently across the application

/**
 * Normalizes review IDs to handle special characters, newlines, and formatting issues
 * This ensures consistent matching between scraped reviews and analysis results
 */
export function normalizeReviewId(id: string): string {
  return id
    .replace(/[\r\n\t]/g, ' ')  // Replace newlines and tabs with spaces
    .replace(/\s+/g, ' ')       // Collapse multiple spaces into single space
    .trim()                     // Remove leading/trailing whitespace
    .substring(0, 200);         // Limit length to prevent extremely long IDs
}

/**
 * Creates a standardized review ID from review components
 * This ensures consistent ID generation across different scraping methods
 */
export function createReviewId(author: string | null, text: string | null, rating: number | null): string {
  const normalizedAuthor = (author || 'unknown').replace(/[\r\n\t]/g, ' ').trim();
  const normalizedText = (text || 'no-text').replace(/[\r\n\t]/g, ' ').trim().substring(0, 50);
  const normalizedRating = rating || 0;
  
  const rawId = `${normalizedAuthor}_${normalizedText}_${normalizedRating}`;
  return normalizeReviewId(rawId);
}

/**
 * Validates that a review ID is properly formatted
 */
export function isValidReviewId(id: string): boolean {
  return Boolean(id) && id.length > 0 && id.length <= 200 && !id.includes('\n') && !id.includes('\r');
}