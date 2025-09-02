export class CollectionProgressTracker {
    constructor(debugMode = false) {
        this.sessions = new Map();
        this.progressCallbacks = new Map();
        this.debugMode = debugMode;
    }
    createSession(sessionId, config) {
        const totalTarget = config.targetCounts.recent + config.targetCounts.worst + config.targetCounts.best;
        const session = {
            sessionId,
            startTime: Date.now(),
            config,
            progress: {
                currentPhase: 'recent',
                phaseProgress: {
                    current: 0,
                    target: config.targetCounts.recent,
                    percentage: 0
                },
                overallProgress: {
                    reviewsCollected: 0,
                    totalTarget,
                    percentage: 0
                },
                timeElapsed: 0,
                estimatedTimeRemaining: 0,
                sessionId
            },
            phaseMetrics: new Map()
        };
        this.sessions.set(sessionId, session);
        this.log(`Created collection session: ${sessionId} (target: ${totalTarget} reviews)`);
        return session;
    }
    updateProgress(sessionId, phase, current, target) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }
        if (!session.phaseMetrics.has(phase)) {
            session.phaseMetrics.set(phase, {
                phase,
                startTime: Date.now(),
                reviewsCollected: 0,
                target,
                completed: false
            });
        }
        const phaseMetric = session.phaseMetrics.get(phase);
        phaseMetric.reviewsCollected = current;
        session.progress.currentPhase = phase;
        session.progress.phaseProgress = {
            current,
            target,
            percentage: target > 0 ? Math.round((current / target) * 100) : 0
        };
        const totalCollected = this.calculateTotalCollected(session);
        session.progress.overallProgress = {
            reviewsCollected: totalCollected,
            totalTarget: session.progress.overallProgress.totalTarget,
            percentage: Math.round((totalCollected / session.progress.overallProgress.totalTarget) * 100)
        };
        session.progress.timeElapsed = Date.now() - session.startTime;
        session.progress.estimatedTimeRemaining = this.estimateTimeRemaining(session);
        this.log(`Progress update [${sessionId}] ${phase}: ${current}/${target} (${session.progress.phaseProgress.percentage}%) - Overall: ${session.progress.overallProgress.percentage}%`);
        this.notifyProgressCallbacks(sessionId, session.progress);
    }
    completePhase(sessionId, phase) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }
        const phaseMetric = session.phaseMetrics.get(phase);
        if (phaseMetric) {
            phaseMetric.endTime = Date.now();
            phaseMetric.completed = true;
            const duration = phaseMetric.endTime - phaseMetric.startTime;
            this.log(`Phase completed [${sessionId}] ${phase}: ${phaseMetric.reviewsCollected} reviews in ${duration}ms`);
        }
    }
    completeCollection(sessionId, results) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }
        session.progress.currentPhase = 'complete';
        session.progress.overallProgress.percentage = 100;
        session.results = results;
        const totalDuration = Date.now() - session.startTime;
        this.log(`Collection completed [${sessionId}]: ${session.progress.overallProgress.reviewsCollected} reviews in ${totalDuration}ms`);
        this.notifyProgressCallbacks(sessionId, session.progress);
    }
    getProgress(sessionId) {
        const session = this.sessions.get(sessionId);
        return session ? { ...session.progress } : null;
    }
    getSession(sessionId) {
        const session = this.sessions.get(sessionId);
        return session ? { ...session } : null;
    }
    onProgress(sessionId, callback) {
        if (!this.progressCallbacks.has(sessionId)) {
            this.progressCallbacks.set(sessionId, []);
        }
        this.progressCallbacks.get(sessionId).push(callback);
    }
    removeCallbacks(sessionId) {
        this.progressCallbacks.delete(sessionId);
    }
    cleanupSession(sessionId) {
        this.sessions.delete(sessionId);
        this.progressCallbacks.delete(sessionId);
        this.log(`Cleaned up session: ${sessionId}`);
    }
    getPerformanceMetrics(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return null;
        }
        const totalDuration = Date.now() - session.startTime;
        const totalReviews = this.calculateTotalCollected(session);
        const averageReviewsPerSecond = totalDuration > 0 ? totalReviews / (totalDuration / 1000) : 0;
        const phaseBreakdown = Array.from(session.phaseMetrics.values()).map(metric => {
            const duration = (metric.endTime || Date.now()) - metric.startTime;
            return {
                phase: metric.phase,
                duration,
                reviewsCollected: metric.reviewsCollected,
                reviewsPerSecond: duration > 0 ? metric.reviewsCollected / (duration / 1000) : 0
            };
        });
        return {
            totalDuration,
            averageReviewsPerSecond,
            phaseBreakdown
        };
    }
    estimateTimeRemaining(session) {
        const totalTarget = session.progress.overallProgress.totalTarget;
        const totalCollected = session.progress.overallProgress.reviewsCollected;
        const timeElapsed = session.progress.timeElapsed;
        if (totalCollected === 0 || timeElapsed === 0) {
            return 0;
        }
        const reviewsPerMs = totalCollected / timeElapsed;
        const remainingReviews = totalTarget - totalCollected;
        return Math.round(remainingReviews / reviewsPerMs);
    }
    calculateTotalCollected(session) {
        let total = 0;
        for (const metric of session.phaseMetrics.values()) {
            if (metric.phase !== 'deduplication') {
                total += metric.reviewsCollected;
            }
        }
        return total;
    }
    notifyProgressCallbacks(sessionId, progress) {
        const callbacks = this.progressCallbacks.get(sessionId);
        if (callbacks) {
            callbacks.forEach(callback => {
                try {
                    callback(sessionId, progress);
                }
                catch (error) {
                    this.log(`Error in progress callback: ${error}`);
                }
            });
        }
    }
    log(message) {
        if (this.debugMode) {
            console.log(`[CollectionProgressTracker] ${message}`);
        }
    }
}
//# sourceMappingURL=collectionProgressTracker.js.map