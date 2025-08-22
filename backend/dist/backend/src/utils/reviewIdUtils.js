export function normalizeReviewId(id) {
    return id
        .replace(/[\r\n\t]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 200);
}
export function createReviewId(author, text, rating) {
    const normalizedAuthor = (author || 'unknown').replace(/[\r\n\t]/g, ' ').trim();
    const normalizedText = (text || 'no-text').replace(/[\r\n\t]/g, ' ').trim().substring(0, 50);
    const normalizedRating = rating || 0;
    const rawId = `${normalizedAuthor}_${normalizedText}_${normalizedRating}`;
    return normalizeReviewId(rawId);
}
export function isValidReviewId(id) {
    return id && id.length > 0 && id.length <= 200 && !id.includes('\n') && !id.includes('\r');
}
//# sourceMappingURL=reviewIdUtils.js.map