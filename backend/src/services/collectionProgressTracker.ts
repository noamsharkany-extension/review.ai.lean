/**
 * Collection Progress Tracker Service
 * 
 * Provides real-time progress updates and performance monitoring for long-running
 * comprehensive review collections. Tracks progress across multiple phases and
 * provides time estimation capabilities.
 */

export interface CollectionProgress {
  currentPhase: 'recent' | 'worst' | 'best' | 'deduplication' | 'complete';
  phaseProgress: {
    current: number;
    target: number;
    percentage: number;
  };
  overallProgress: {
    reviewsCollected: number;
    totalTarget: number;
    percentage: number;
  };
  timeElapsed: number;
  estimatedTimeRemaining: number;
  sessionId: string;
}

export interface CollectionPhaseMetrics {
  phase: string;
  startTime: number;
  endTime?: number;
  reviewsCollected: number;
  target: number;
  completed: boolean;
}

export interface CollectionSession {
  sessionId: string;
  startTime: number;
  config: {
    targetCounts: {
      recent: number;
      worst: number;
      best: number;
    };
  };
  progress: CollectionProgress;
  phaseMetrics: Map<string, CollectionPhaseMetrics>;
  results?: any;
}

export type ProgressCallback = (sessionId: string, progress: CollectionProgress) => void;

export class CollectionProgressTracker {
  private sessions: Map<string, CollectionSession> = new Map();
  private progressCallbacks: Map<string, ProgressCallback[]> = new Map();
  private debugMode: boolean;

  constructor(debugMode: boolean = false) {
    this.debugMode = debugMode;
  }

  /**
   * Creates a new collection session and initializes progress tracking
   */
  createSession(sessionId: string, config: { targetCounts: { recent: number; worst: number; best: number } }): CollectionSession {
    const totalTarget = config.targetCounts.recent + config.targetCounts.worst + config.targetCounts.best;
    
    const session: CollectionSession = {
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

  /**
   * Updates progress for a specific phase
   */
  updateProgress(sessionId: string, phase: 'recent' | 'worst' | 'best' | 'deduplication', current: number, target: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Update phase metrics
    if (!session.phaseMetrics.has(phase)) {
      session.phaseMetrics.set(phase, {
        phase,
        startTime: Date.now(),
        reviewsCollected: 0,
        target,
        completed: false
      });
    }

    const phaseMetric = session.phaseMetrics.get(phase)!;
    phaseMetric.reviewsCollected = current;

    // Update session progress
    session.progress.currentPhase = phase;
    session.progress.phaseProgress = {
      current,
      target,
      percentage: target > 0 ? Math.round((current / target) * 100) : 0
    };

    // Calculate overall progress
    const totalCollected = this.calculateTotalCollected(session);
    session.progress.overallProgress = {
      reviewsCollected: totalCollected,
      totalTarget: session.progress.overallProgress.totalTarget,
      percentage: Math.round((totalCollected / session.progress.overallProgress.totalTarget) * 100)
    };

    // Update time tracking
    session.progress.timeElapsed = Date.now() - session.startTime;
    session.progress.estimatedTimeRemaining = this.estimateTimeRemaining(session);

    this.log(`Progress update [${sessionId}] ${phase}: ${current}/${target} (${session.progress.phaseProgress.percentage}%) - Overall: ${session.progress.overallProgress.percentage}%`);

    // Notify callbacks
    this.notifyProgressCallbacks(sessionId, session.progress);
  }

  /**
   * Marks a phase as complete
   */
  completePhase(sessionId: string, phase: 'recent' | 'worst' | 'best' | 'deduplication'): void {
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

  /**
   * Marks the entire collection as complete
   */
  completeCollection(sessionId: string, results: any): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.progress.currentPhase = 'complete';
    session.progress.overallProgress.percentage = 100;
    session.results = results;

    const totalDuration = Date.now() - session.startTime;
    this.log(`Collection completed [${sessionId}]: ${session.progress.overallProgress.reviewsCollected} reviews in ${totalDuration}ms`);

    // Final callback notification
    this.notifyProgressCallbacks(sessionId, session.progress);
  }

  /**
   * Gets current progress for a session
   */
  getProgress(sessionId: string): CollectionProgress | null {
    const session = this.sessions.get(sessionId);
    return session ? { ...session.progress } : null;
  }

  /**
   * Gets detailed session information
   */
  getSession(sessionId: string): CollectionSession | null {
    const session = this.sessions.get(sessionId);
    return session ? { ...session } : null;
  }

  /**
   * Registers a progress callback for a session
   */
  onProgress(sessionId: string, callback: ProgressCallback): void {
    if (!this.progressCallbacks.has(sessionId)) {
      this.progressCallbacks.set(sessionId, []);
    }
    this.progressCallbacks.get(sessionId)!.push(callback);
  }

  /**
   * Removes all callbacks for a session
   */
  removeCallbacks(sessionId: string): void {
    this.progressCallbacks.delete(sessionId);
  }

  /**
   * Cleans up a completed session
   */
  cleanupSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    this.progressCallbacks.delete(sessionId);
    this.log(`Cleaned up session: ${sessionId}`);
  }

  /**
   * Gets performance metrics for a session
   */
  getPerformanceMetrics(sessionId: string): {
    totalDuration: number;
    averageReviewsPerSecond: number;
    phaseBreakdown: Array<{
      phase: string;
      duration: number;
      reviewsCollected: number;
      reviewsPerSecond: number;
    }>;
  } | null {
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

  /**
   * Estimates time remaining based on current progress and historical performance
   */
  private estimateTimeRemaining(session: CollectionSession): number {
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

  /**
   * Calculates total reviews collected across all phases
   */
  private calculateTotalCollected(session: CollectionSession): number {
    let total = 0;
    for (const metric of session.phaseMetrics.values()) {
      if (metric.phase !== 'deduplication') {
        total += metric.reviewsCollected;
      }
    }
    return total;
  }

  /**
   * Notifies all registered callbacks for a session
   */
  private notifyProgressCallbacks(sessionId: string, progress: CollectionProgress): void {
    const callbacks = this.progressCallbacks.get(sessionId);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(sessionId, progress);
        } catch (error) {
          this.log(`Error in progress callback: ${error}`);
        }
      });
    }
  }

  /**
   * Logs debug information if debug mode is enabled
   */
  private log(message: string): void {
    if (this.debugMode) {
      console.log(`[CollectionProgressTracker] ${message}`);
    }
  }
}