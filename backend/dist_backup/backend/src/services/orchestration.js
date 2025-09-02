import { EventEmitter } from 'events';
import { GoogleReviewScraperService } from './scraper.js';
import { IntelligentSamplingEngine } from './sampling.js';
import { OpenAIAnalysisEngine } from './analysis.js';
import { ReviewVerdictGenerator } from './verdict.js';
export class ReviewAnalysisOrchestrator extends EventEmitter {
    constructor() {
        super();
        this.sessions = new Map();
        this.scraper = new GoogleReviewScraperService((message) => {
            for (const [sessionId, session] of this.sessions.entries()) {
                if (session.status === 'scraping') {
                    this.emit('progress', sessionId, {
                        phase: 'scraping',
                        progress: session.progress.progress,
                        message
                    });
                    break;
                }
            }
        });
        this.samplingEngine = new IntelligentSamplingEngine();
        this.analysisEngine = new OpenAIAnalysisEngine();
        this.verdictGenerator = new ReviewVerdictGenerator();
    }
    async startAnalysis(googleUrl) {
        const sessionId = this.generateSessionId();
        const session = {
            id: sessionId,
            googleUrl,
            status: 'pending',
            progress: {
                phase: 'scraping',
                progress: 0,
                message: 'Initializing analysis...'
            },
            createdAt: new Date()
        };
        this.sessions.set(sessionId, session);
        this.runAnalysisWorkflow(sessionId).catch(error => {
            this.handleAnalysisError(sessionId, error);
        });
        return sessionId;
    }
    getAnalysisStatus(sessionId) {
        return this.sessions.get(sessionId) || null;
    }
    async retryFailedStep(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error('Analysis session not found');
        }
        if (session.status !== 'error') {
            throw new Error(`Cannot retry analysis in '${session.status}' state. Only failed analyses can be retried.`);
        }
        const errorDetails = session.errorDetails;
        if (errorDetails && !errorDetails.retryable) {
            throw new Error(`This error cannot be retried: ${errorDetails.message}`);
        }
        const failedPhase = session.progress.phase;
        session.status = failedPhase;
        session.progress = {
            phase: failedPhase,
            progress: 0,
            message: `Retrying ${failedPhase} phase...`
        };
        delete session.errorDetails;
        this.sessions.set(sessionId, session);
        this.emit('progress', sessionId, session.progress);
        try {
            await this.runAnalysisWorkflowFromPhase(sessionId, failedPhase);
        }
        catch (error) {
            this.handleAnalysisError(sessionId, error);
        }
    }
    async runAnalysisWorkflowFromPhase(sessionId, startPhase) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error('Session not found');
        }
        try {
            let reviews = [];
            let sampledReviews = { reviews: [], breakdown: { recent: 0, fivestar: 0, onestar: 0 }, samplingUsed: false };
            let sentimentAnalysis = [];
            let fakeAnalysis = [];
            switch (startPhase) {
                case 'scraping':
                    reviews = await this.executeScrapingPhase(sessionId);
                    if (startPhase === 'scraping') {
                        sampledReviews = await this.executeSamplingPhase(sessionId, reviews);
                        sentimentAnalysis = await this.executeSentimentAnalysisPhase(sessionId, sampledReviews.reviews);
                        fakeAnalysis = await this.executeFakeDetectionPhase(sessionId, sampledReviews.reviews);
                    }
                    break;
                case 'sampling':
                    reviews = await this.executeScrapingPhase(sessionId);
                    sampledReviews = await this.executeSamplingPhase(sessionId, reviews);
                    if (startPhase === 'sampling') {
                        sentimentAnalysis = await this.executeSentimentAnalysisPhase(sessionId, sampledReviews.reviews);
                        fakeAnalysis = await this.executeFakeDetectionPhase(sessionId, sampledReviews.reviews);
                    }
                    break;
                case 'sentiment':
                    reviews = await this.executeScrapingPhase(sessionId);
                    sampledReviews = await this.executeSamplingPhase(sessionId, reviews);
                    sentimentAnalysis = await this.executeSentimentAnalysisPhase(sessionId, sampledReviews.reviews);
                    if (startPhase === 'sentiment') {
                        fakeAnalysis = await this.executeFakeDetectionPhase(sessionId, sampledReviews.reviews);
                    }
                    break;
                case 'fake-detection':
                    reviews = await this.executeScrapingPhase(sessionId);
                    sampledReviews = await this.executeSamplingPhase(sessionId, reviews);
                    sentimentAnalysis = await this.executeSentimentAnalysisPhase(sessionId, sampledReviews.reviews);
                    fakeAnalysis = await this.executeFakeDetectionPhase(sessionId, sampledReviews.reviews);
                    break;
                case 'verdict':
                    if (startPhase === 'verdict') {
                        reviews = await this.executeScrapingPhase(sessionId);
                        sampledReviews = await this.executeSamplingPhase(sessionId, reviews);
                        sentimentAnalysis = await this.executeSentimentAnalysisPhase(sessionId, sampledReviews.reviews);
                        fakeAnalysis = await this.executeFakeDetectionPhase(sessionId, sampledReviews.reviews);
                    }
                    const results = await this.executeVerdictPhase(sessionId, reviews, sampledReviews, sentimentAnalysis, fakeAnalysis);
                    this.completeAnalysis(sessionId, results);
                    break;
            }
        }
        catch (error) {
            throw error;
        }
    }
    async runAnalysisWorkflow(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error('Session not found');
        }
        try {
            const reviews = await this.executeScrapingPhase(sessionId);
            const sampledReviews = await this.executeSamplingPhase(sessionId, reviews);
            const sentimentAnalysis = await this.executeSentimentAnalysisPhase(sessionId, sampledReviews.reviews);
            const fakeAnalysis = await this.executeFakeDetectionPhase(sessionId, sampledReviews.reviews);
            const results = await this.executeVerdictPhase(sessionId, reviews, sampledReviews, sentimentAnalysis, fakeAnalysis);
            this.completeAnalysis(sessionId, results);
        }
        catch (error) {
            this.handleAnalysisError(sessionId, error);
        }
    }
    async executeScrapingPhase(sessionId) {
        const session = this.sessions.get(sessionId);
        this.updateProgress(sessionId, {
            phase: 'scraping',
            progress: 5,
            message: 'Validating Google URL...'
        });
        if (!this.scraper.validateUrl(session.googleUrl)) {
            throw new Error('Invalid Google URL provided. Please provide a valid Google Maps, Google Search, or other Google URL that shows reviews.');
        }
        this.updateProgress(sessionId, {
            phase: 'scraping',
            progress: 15,
            message: 'Starting browser and navigation...'
        });
        const reviews = await this.executeWithRetry(async () => {
            return await Promise.race([
                this.scraper.scrapeReviews(session.googleUrl),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Scraping operation timeout after 300 seconds')), 300000))
            ]);
        }, 3, 'Failed to scrape reviews after multiple attempts');
        if (!reviews || reviews.length === 0) {
            throw new Error('No reviews found on this page. Please verify the URL contains reviews and try again.');
        }
        this.updateProgress(sessionId, {
            phase: 'scraping',
            progress: 100,
            message: `Successfully scraped ${reviews.length} reviews`
        });
        return reviews;
    }
    async executeSamplingPhase(sessionId, reviews) {
        this.updateProgress(sessionId, {
            phase: 'sampling',
            progress: 20,
            message: 'Analyzing review dataset...'
        });
        const sampledReviews = this.samplingEngine.sampleReviews(reviews);
        this.updateProgress(sessionId, {
            phase: 'sampling',
            progress: 100,
            message: sampledReviews.samplingUsed
                ? `Applied intelligent sampling: ${sampledReviews.reviews.length} reviews selected`
                : `No sampling needed: analyzing all ${reviews.length} reviews`
        });
        return sampledReviews;
    }
    async executeSentimentAnalysisPhase(sessionId, reviews) {
        this.updateProgress(sessionId, {
            phase: 'sentiment',
            progress: 10,
            message: 'Starting sentiment analysis with OpenAI...'
        });
        const sentimentAnalysis = await this.executeWithRetry(async () => {
            const results = await this.analysisEngine.analyzeSentiment(reviews);
            this.updateProgress(sessionId, {
                phase: 'sentiment',
                progress: 75,
                message: 'Processing sentiment analysis results...'
            });
            return results;
        }, 2, 'Failed to complete sentiment analysis after multiple attempts');
        this.updateProgress(sessionId, {
            phase: 'sentiment',
            progress: 100,
            message: `Sentiment analysis complete: ${sentimentAnalysis.filter(s => s.mismatchDetected).length} mismatches detected`
        });
        return sentimentAnalysis;
    }
    async executeFakeDetectionPhase(sessionId, reviews) {
        this.updateProgress(sessionId, {
            phase: 'fake-detection',
            progress: 10,
            message: 'Starting fake review detection with OpenAI...'
        });
        const fakeAnalysis = await this.executeWithRetry(async () => {
            const results = await this.analysisEngine.detectFakeReviews(reviews);
            this.updateProgress(sessionId, {
                phase: 'fake-detection',
                progress: 75,
                message: 'Processing fake review detection results...'
            });
            return results;
        }, 2, 'Failed to complete fake review detection after multiple attempts');
        this.updateProgress(sessionId, {
            phase: 'fake-detection',
            progress: 100,
            message: `Fake review detection complete: ${fakeAnalysis.filter(f => f.isFake).length} suspicious reviews identified`
        });
        return fakeAnalysis;
    }
    async executeVerdictPhase(sessionId, originalReviews, sampledReviews, sentimentAnalysis, fakeAnalysis) {
        this.updateProgress(sessionId, {
            phase: 'verdict',
            progress: 25,
            message: 'Calculating verdict scores...'
        });
        const results = this.verdictGenerator.generateVerdict(sampledReviews.reviews, sentimentAnalysis, fakeAnalysis, sampledReviews, originalReviews.length);
        this.updateProgress(sessionId, {
            phase: 'verdict',
            progress: 75,
            message: 'Generating citations and transparency report...'
        });
        this.updateProgress(sessionId, {
            phase: 'verdict',
            progress: 100,
            message: 'Analysis complete!'
        });
        return results;
    }
    async executeWithRetry(operation, maxRetries, errorMessage) {
        let lastError;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`Executing operation attempt ${attempt}/${maxRetries}`);
                const result = await operation();
                if (attempt > 1) {
                    console.log(`Operation succeeded on attempt ${attempt}`);
                }
                return result;
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                console.log(`Operation failed on attempt ${attempt}: ${lastError.message}`);
                if (attempt < maxRetries) {
                    const baseDelay = Math.min(2000 * Math.pow(1.5, attempt - 1), 15000);
                    const jitter = Math.random() * 1000;
                    const delay = baseDelay + jitter;
                    console.log(`Retrying in ${Math.round(delay)}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        console.error(`Operation failed after ${maxRetries} attempts: ${lastError.message}`);
        throw new Error(`${errorMessage}: ${lastError.message}`);
    }
    updateProgress(sessionId, progress) {
        const session = this.sessions.get(sessionId);
        if (!session)
            return;
        session.progress = progress;
        session.status = progress.phase;
        this.sessions.set(sessionId, session);
        this.emit('progress', sessionId, progress);
    }
    completeAnalysis(sessionId, results) {
        const session = this.sessions.get(sessionId);
        if (!session)
            return;
        session.status = 'complete';
        session.results = results;
        session.completedAt = new Date();
        session.progress = {
            phase: 'verdict',
            progress: 100,
            message: 'Analysis complete!'
        };
        this.sessions.set(sessionId, session);
        this.emit('complete', sessionId, results);
    }
    handleAnalysisError(sessionId, error) {
        const session = this.sessions.get(sessionId);
        if (!session)
            return;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error(`Analysis error in session ${sessionId}:`, errorMessage);
        console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
        let errorType = 'unknown';
        let retryable = true;
        let userFriendlyMessage = errorMessage;
        if (error instanceof Error) {
            const msg = error.message.toLowerCase();
            if (msg.includes('invalid google url') || msg.includes('validation')) {
                errorType = 'validation';
                retryable = false;
                userFriendlyMessage = 'The provided URL is not a valid Google URL with reviews. Please check the URL and try again.';
            }
            else if (msg.includes('no reviews found') || msg.includes('unable to find reviews section')) {
                errorType = 'no_reviews';
                retryable = false;
                userFriendlyMessage = 'No reviews were found on this page. Please verify the URL shows reviews and try again.';
            }
            else if (msg.includes('browser launch') || msg.includes('failed to launch browser')) {
                errorType = 'browser_launch';
                retryable = true;
                userFriendlyMessage = 'Failed to start the browser. This may be a temporary issue - please try again.';
            }
            else if (msg.includes('navigation') || msg.includes('page navigation') || msg.includes('net::err')) {
                errorType = 'navigation';
                retryable = true;
                userFriendlyMessage = 'Failed to load the Google page. Please check your internet connection and try again.';
            }
            else if (msg.includes('timeout') || msg.includes('etimedout') || msg.includes('scraping operation timeout')) {
                errorType = 'timeout';
                retryable = true;
                userFriendlyMessage = 'The operation took too long to complete (over 5 minutes). This may be due to slow internet, heavy page content, or a large number of reviews. Please try again.';
            }
            else if (msg.includes('scraping') || msg.includes('scrape') || msg.includes('puppeteer') || msg.includes('extraction')) {
                errorType = 'scraping';
                retryable = true;
                userFriendlyMessage = 'Failed to extract reviews from the page. The page structure may have changed. Please try again.';
            }
            else if (msg.includes('openai') || msg.includes('api') || msg.includes('rate limit')) {
                errorType = 'api';
                retryable = true;
                userFriendlyMessage = 'AI analysis service is temporarily unavailable. Please try again in a few moments.';
            }
            else if (msg.includes('network') || msg.includes('fetch') || msg.includes('enotfound') || msg.includes('econnrefused')) {
                errorType = 'network';
                retryable = true;
                userFriendlyMessage = 'Network connection error. Please check your internet connection and try again.';
            }
        }
        session.status = 'error';
        session.progress = {
            phase: session.progress.phase,
            progress: session.progress.progress,
            message: `Error: ${userFriendlyMessage}`
        };
        session.errorDetails = {
            type: errorType,
            message: errorMessage,
            userFriendlyMessage,
            retryable,
            timestamp: new Date(),
            phase: session.progress.phase,
            stack: error instanceof Error ? error.stack : undefined,
            url: session.googleUrl,
            sessionDuration: Date.now() - session.createdAt.getTime()
        };
        this.sessions.set(sessionId, session);
        this.emit('error', sessionId, {
            error: userFriendlyMessage,
            originalError: errorMessage,
            type: errorType,
            retryable,
            phase: session.progress.phase,
            timestamp: new Date().toISOString()
        });
        console.error(`[Analysis Error] Session: ${sessionId}, Type: ${errorType}, Phase: ${session.progress.phase}, Retryable: ${retryable}`);
    }
    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    cleanupOldSessions(maxAgeHours = 24) {
        const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
        for (const [sessionId, session] of this.sessions.entries()) {
            if (session.createdAt < cutoffTime) {
                this.sessions.delete(sessionId);
            }
        }
    }
    getActiveSessions() {
        return Array.from(this.sessions.values());
    }
    async shutdown() {
        await this.scraper.close();
        this.sessions.clear();
        this.removeAllListeners();
    }
}
//# sourceMappingURL=orchestration.js.map