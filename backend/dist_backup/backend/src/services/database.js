import { getDatabase } from '../database/connection.js';
export class DatabaseService {
    constructor() {
        this.db = getDatabase();
    }
    async createSession(session) {
        const sql = `
      INSERT INTO analysis_sessions (
        id, google_url, status, progress_phase, progress_percentage, 
        progress_message, error_message, error_type, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
        await this.db.run(sql, [
            session.id,
            session.googleUrl,
            session.status,
            session.progress?.phase || null,
            session.progress?.progress || 0,
            session.progress?.message || null,
            session.error?.message || null,
            session.error?.type || null,
            session.createdAt.toISOString()
        ]);
    }
    async updateSession(sessionId, updates) {
        const fields = [];
        const values = [];
        if (updates.status !== undefined) {
            fields.push('status = ?');
            values.push(updates.status);
        }
        if (updates.progress !== undefined) {
            fields.push('progress_phase = ?', 'progress_percentage = ?', 'progress_message = ?');
            values.push(updates.progress.phase, updates.progress.progress, updates.progress.message);
        }
        if (updates.error !== undefined) {
            fields.push('error_message = ?', 'error_type = ?');
            values.push(updates.error.message, updates.error.type);
        }
        if (updates.completedAt !== undefined) {
            fields.push('completed_at = ?');
            values.push(updates.completedAt.toISOString());
        }
        if (fields.length === 0)
            return;
        values.push(sessionId);
        const sql = `UPDATE analysis_sessions SET ${fields.join(', ')} WHERE id = ?`;
        await this.db.run(sql, values);
    }
    async getSession(sessionId) {
        const sql = `
      SELECT * FROM analysis_sessions WHERE id = ?
    `;
        const row = await this.db.get(sql, [sessionId]);
        if (!row)
            return null;
        return {
            id: row.id,
            googleUrl: row.google_url,
            status: row.status,
            progress: row.progress_phase ? {
                phase: row.progress_phase,
                progress: row.progress_percentage,
                message: row.progress_message
            } : { phase: 'scraping', progress: 0, message: 'Starting...' },
            error: row.error_message ? {
                message: row.error_message,
                type: row.error_type
            } : undefined,
            createdAt: new Date(row.created_at),
            completedAt: row.completed_at ? new Date(row.completed_at) : undefined
        };
    }
    async getActiveSessions() {
        const sql = `
      SELECT * FROM analysis_sessions 
      WHERE status IN ('pending', 'scraping', 'sampling', 'analyzing')
      ORDER BY created_at DESC
    `;
        const rows = await this.db.query(sql);
        return rows.map(row => ({
            id: row.id,
            googleUrl: row.google_url,
            status: row.status,
            progress: row.progress_phase ? {
                phase: row.progress_phase,
                progress: row.progress_percentage,
                message: row.progress_message
            } : { phase: 'scraping', progress: 0, message: 'Starting...' },
            error: row.error_message ? {
                message: row.error_message,
                type: row.error_type
            } : undefined,
            createdAt: new Date(row.created_at),
            completedAt: row.completed_at ? new Date(row.completed_at) : undefined
        }));
    }
    async saveResults(sessionId, results) {
        await this.db.transaction(async () => {
            const resultsSql = `
        INSERT OR REPLACE INTO analysis_results (
          session_id, overall_score, trustworthiness_score, red_flags_score,
          total_reviews, sampling_used, recent_sample_count, fivestar_sample_count,
          onestar_sample_count, fake_review_ratio, sentiment_mismatch_ratio, confidence_score
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
            await this.db.run(resultsSql, [
                sessionId,
                results.verdict.overallScore,
                results.verdict.trustworthiness,
                results.verdict.redFlags,
                results.sampling.totalReviews,
                results.sampling.samplingUsed,
                results.sampling.sampleBreakdown?.recent || null,
                results.sampling.sampleBreakdown?.fivestar || null,
                results.sampling.sampleBreakdown?.onestar || null,
                results.analysis.fakeReviewRatio,
                results.analysis.sentimentMismatchRatio,
                results.analysis.confidenceScore
            ]);
            if (results.citations && results.citations.length > 0) {
                const citationsSql = `
          INSERT INTO citations (session_id, review_id, citation_text, analysis_notes)
          VALUES (?, ?, ?, ?)
        `;
                for (const citation of results.citations) {
                    await this.db.run(citationsSql, [
                        sessionId,
                        citation.reviewId,
                        citation.text,
                        citation.analysis
                    ]);
                }
            }
        });
    }
    async getResults(sessionId) {
        const resultsSql = `
      SELECT * FROM analysis_results WHERE session_id = ?
    `;
        const resultsRow = await this.db.get(resultsSql, [sessionId]);
        if (!resultsRow)
            return null;
        const citationsSql = `
      SELECT * FROM citations WHERE session_id = ? ORDER BY id
    `;
        const citationRows = await this.db.query(citationsSql, [sessionId]);
        return {
            verdict: {
                overallScore: resultsRow.overall_score,
                trustworthiness: resultsRow.trustworthiness_score,
                redFlags: resultsRow.red_flags_score
            },
            sampling: {
                totalReviews: resultsRow.total_reviews,
                samplingUsed: resultsRow.sampling_used,
                sampleBreakdown: resultsRow.sampling_used ? {
                    recent: resultsRow.recent_sample_count,
                    fivestar: resultsRow.fivestar_sample_count,
                    onestar: resultsRow.onestar_sample_count
                } : undefined
            },
            analysis: {
                fakeReviewRatio: resultsRow.fake_review_ratio,
                sentimentMismatchRatio: resultsRow.sentiment_mismatch_ratio,
                confidenceScore: resultsRow.confidence_score
            },
            citations: citationRows.map(row => ({
                reviewId: row.review_id,
                author: row.author || 'Unknown',
                rating: row.rating || 0,
                text: row.citation_text,
                date: new Date(row.date || Date.now()),
                originalUrl: row.original_url || '',
                sentiment: {
                    reviewId: row.review_id,
                    sentiment: row.sentiment || 'neutral',
                    confidence: row.sentiment_confidence || 0,
                    mismatchDetected: false
                },
                fakeAnalysis: {
                    reviewId: row.review_id,
                    isFake: row.is_fake || false,
                    confidence: row.fake_confidence || 0,
                    reasons: row.fake_reasons ? JSON.parse(row.fake_reasons) : []
                },
                analysis: row.analysis_notes,
                link: `#review-${row.review_id}`
            })),
            transparencyReport: {
                samplingBreakdown: {
                    totalOriginalReviews: resultsRow.total_reviews,
                    samplingUsed: resultsRow.sampling_used,
                    sampleBreakdown: resultsRow.sampling_used ? {
                        recent: resultsRow.recent_sample_count,
                        fivestar: resultsRow.fivestar_sample_count,
                        onestar: resultsRow.onestar_sample_count
                    } : undefined,
                    samplingMethodology: resultsRow.sampling_used ? 'Stratified sampling with recent, 5-star, and 1-star reviews' : 'No sampling applied'
                },
                analysisBreakdown: {
                    totalAnalyzed: citationRows.length,
                    fakeReviewCount: Math.round(citationRows.length * resultsRow.fake_review_ratio),
                    fakeReviewRatio: resultsRow.fake_review_ratio,
                    sentimentMismatchCount: Math.round(citationRows.length * resultsRow.sentiment_mismatch_ratio),
                    sentimentMismatchRatio: resultsRow.sentiment_mismatch_ratio,
                    averageConfidenceScore: resultsRow.confidence_score
                },
                qualityMetrics: {
                    citationAccuracy: 0.95,
                    linkValidityRatio: 1.0,
                    analysisCompleteness: citationRows.length > 0 ? 1.0 : 0.0
                }
            }
        };
    }
    async saveReviews(sessionId, reviews) {
        if (reviews.length === 0)
            return;
        const sql = `
      INSERT OR REPLACE INTO reviews (
        id, session_id, author, rating, text, date, original_url,
        sentiment, sentiment_confidence, is_fake, fake_confidence, fake_reasons
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
        await this.db.transaction(async () => {
            for (const review of reviews) {
                await this.db.run(sql, [
                    review.id,
                    sessionId,
                    review.author,
                    review.rating,
                    review.text,
                    review.date.toISOString(),
                    review.originalUrl,
                    review.sentiment?.sentiment || null,
                    review.sentiment?.confidence || null,
                    review.fakeAnalysis?.isFake || false,
                    review.fakeAnalysis?.confidence || null,
                    review.fakeAnalysis?.reasons ? JSON.stringify(review.fakeAnalysis.reasons) : null
                ]);
            }
        });
    }
    async getReviews(sessionId) {
        const sql = `
      SELECT * FROM reviews WHERE session_id = ? ORDER BY date DESC
    `;
        const rows = await this.db.query(sql, [sessionId]);
        return rows.map(row => ({
            id: row.id,
            author: row.author,
            rating: row.rating,
            text: row.text,
            date: new Date(row.date),
            originalUrl: row.original_url,
            sentiment: row.sentiment ? {
                reviewId: row.id,
                sentiment: row.sentiment,
                confidence: row.sentiment_confidence,
                mismatchDetected: false
            } : undefined,
            fakeAnalysis: row.is_fake !== null ? {
                reviewId: row.id,
                isFake: row.is_fake,
                confidence: row.fake_confidence,
                reasons: row.fake_reasons ? JSON.parse(row.fake_reasons) : []
            } : undefined
        }));
    }
    async cleanupOldSessions(olderThanDays = 30) {
        const sql = `
      DELETE FROM analysis_sessions 
      WHERE created_at < datetime('now', '-${olderThanDays} days')
    `;
        const result = await this.db.run(sql);
        return result.changes;
    }
    async getStats() {
        const sql = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status IN ('pending', 'scraping', 'sampling', 'analyzing') THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error
      FROM analysis_sessions
    `;
        const row = await this.db.get(sql);
        return {
            totalSessions: row.total,
            completedSessions: row.completed,
            activeSessions: row.active,
            errorSessions: row.error
        };
    }
}
//# sourceMappingURL=database.js.map