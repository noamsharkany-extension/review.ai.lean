import { Page } from 'puppeteer';

export interface MemoryUsage {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  timestamp: number;
}

export interface DiagnosticEntry {
  id: string;
  url: string;
  data: any;
  priority: 'low' | 'medium' | 'high' | 'critical';
  timestamp: number;
  dataSize: number;
  lastAccessed: number;
}

export interface DiagnosticStorageConfig {
  maxEntries: number;
  maxMemoryMB: number;
  retentionPolicyByPriority: {
    critical: number; // retention time in ms
    high: number;
    medium: number;
    low: number;
  };
}

export interface MemoryThresholds {
  heapWarning: number;    // MB - warn when heap usage exceeds this
  heapCritical: number;   // MB - force cleanup when heap usage exceeds this
  rssWarning: number;     // MB - warn when RSS exceeds this
  rssCritical: number;    // MB - force cleanup when RSS exceeds this
}

export interface MemoryCleanupResult {
  beforeCleanup: MemoryUsage;
  afterCleanup: MemoryUsage;
  memoryFreed: number;
  cleanupActions: string[];
  success: boolean;
}

/**
 * Memory management service for comprehensive review collection
 * Monitors memory usage and performs cleanup to prevent memory leaks during long-running operations
 */
export class MemoryManager {
  private memoryHistory: MemoryUsage[] = [];
  private cleanupCallbacks: Array<() => Promise<void>> = [];
  private debugMode: boolean;
  private thresholds: MemoryThresholds;
  private monitoringInterval?: NodeJS.Timeout;
  private lastCleanupTime: number = 0;
  private minCleanupInterval: number = 30000; // 30 seconds minimum between cleanups
  
  // Diagnostic data storage
  private diagnosticStorage: Map<string, DiagnosticEntry> = new Map();
  private diagnosticStorageConfig: DiagnosticStorageConfig;
  private diagnosticMemoryUsage: number = 0; // in bytes
  
  // Performance monitoring for diagnostic storage
  private diagnosticPerformanceMetrics = {
    totalOperations: 0,
    storageOperations: 0,
    retrievalOperations: 0,
    evictionOperations: 0,
    totalStorageTime: 0, // milliseconds
    totalRetrievalTime: 0, // milliseconds
    totalEvictionTime: 0, // milliseconds
    averageStorageTime: 0,
    averageRetrievalTime: 0,
    averageEvictionTime: 0,
    peakMemoryUsage: 0,
    operationsPerSecond: 0,
    lastPerformanceUpdate: Date.now()
  };

  constructor(
    debugMode: boolean = false,
    customThresholds?: Partial<MemoryThresholds>,
    diagnosticConfig?: Partial<DiagnosticStorageConfig>
  ) {
    this.debugMode = debugMode;
    this.thresholds = {
      heapWarning: 512,    // 512 MB
      heapCritical: 1024,  // 1 GB
      rssWarning: 1024,    // 1 GB
      rssCritical: 2048,   // 2 GB
      ...customThresholds
    };
    
    this.diagnosticStorageConfig = {
      maxEntries: 1000,
      maxMemoryMB: 100, // 100 MB for diagnostic data
      retentionPolicyByPriority: {
        critical: 24 * 60 * 60 * 1000, // 24 hours
        high: 12 * 60 * 60 * 1000,     // 12 hours
        medium: 6 * 60 * 60 * 1000,    // 6 hours
        low: 1 * 60 * 60 * 1000        // 1 hour
      },
      ...diagnosticConfig
    };
  }

  /**
   * Start monitoring memory usage at regular intervals
   */
  startMonitoring(intervalMs: number = 10000): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(() => {
      this.recordMemoryUsage();
      this.checkMemoryThresholds();
    }, intervalMs);

    this.log('Memory monitoring started');
  }

  /**
   * Stop memory monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
    this.log('Memory monitoring stopped');
  }

  /**
   * Record current memory usage
   */
  recordMemoryUsage(): MemoryUsage {
    const memUsage = process.memoryUsage();
    const usage: MemoryUsage = {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // Convert to MB
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024),
      rss: Math.round(memUsage.rss / 1024 / 1024),
      timestamp: Date.now()
    };

    this.memoryHistory.push(usage);
    
    // Keep only last 100 measurements to prevent memory leak in monitoring itself
    if (this.memoryHistory.length > 100) {
      this.memoryHistory = this.memoryHistory.slice(-100);
    }

    return usage;
  }

  /**
   * Get current memory usage
   */
  getCurrentMemoryUsage(): MemoryUsage {
    return this.recordMemoryUsage();
  }

  /**
   * Get memory usage history
   */
  getMemoryHistory(): MemoryUsage[] {
    return [...this.memoryHistory];
  }

  /**
   * Check if memory usage exceeds thresholds and trigger cleanup if needed
   */
  private async checkMemoryThresholds(): Promise<void> {
    const current = this.getCurrentMemoryUsage();
    const now = Date.now();

    // Check if we're within minimum cleanup interval
    if (now - this.lastCleanupTime < this.minCleanupInterval) {
      return;
    }

    let shouldCleanup = false;
    let cleanupReason = '';

    if (current.heapUsed > this.thresholds.heapCritical) {
      shouldCleanup = true;
      cleanupReason = `Heap usage critical: ${current.heapUsed}MB > ${this.thresholds.heapCritical}MB`;
    } else if (current.rss > this.thresholds.rssCritical) {
      shouldCleanup = true;
      cleanupReason = `RSS usage critical: ${current.rss}MB > ${this.thresholds.rssCritical}MB`;
    } else if (current.heapUsed > this.thresholds.heapWarning) {
      this.log(`Memory warning: Heap usage ${current.heapUsed}MB exceeds warning threshold ${this.thresholds.heapWarning}MB`);
    } else if (current.rss > this.thresholds.rssWarning) {
      this.log(`Memory warning: RSS usage ${current.rss}MB exceeds warning threshold ${this.thresholds.rssWarning}MB`);
    }

    if (shouldCleanup) {
      this.log(`Triggering automatic cleanup: ${cleanupReason}`);
      await this.performCleanup();
    }
  }

  /**
   * Register a cleanup callback that will be called during memory cleanup
   */
  registerCleanupCallback(callback: () => Promise<void>): void {
    this.cleanupCallbacks.push(callback);
  }

  /**
   * Perform comprehensive memory cleanup
   */
  async performCleanup(): Promise<MemoryCleanupResult> {
    const beforeCleanup = this.getCurrentMemoryUsage();
    const cleanupActions: string[] = [];
    let success = true;

    try {
      this.log('Starting memory cleanup...');

      // 1. Run registered cleanup callbacks
      for (let i = 0; i < this.cleanupCallbacks.length; i++) {
        try {
          await this.cleanupCallbacks[i]();
          cleanupActions.push(`Cleanup callback ${i + 1} executed`);
        } catch (error) {
          this.log(`Cleanup callback ${i + 1} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
          success = false;
        }
      }

      // 2. Force garbage collection if available
      if (global.gc) {
        global.gc();
        cleanupActions.push('Forced garbage collection');
      } else {
        cleanupActions.push('Garbage collection not available (run with --expose-gc)');
      }

      // 3. Clean up diagnostic storage
      const cleanedDiagnosticEntries = this.cleanupExpiredDiagnosticData();
      if (cleanedDiagnosticEntries > 0) {
        cleanupActions.push(`Cleaned ${cleanedDiagnosticEntries} expired diagnostic entries`);
      }

      // 4. Clear memory history except recent entries
      if (this.memoryHistory.length > 10) {
        this.memoryHistory = this.memoryHistory.slice(-10);
        cleanupActions.push('Cleared memory history');
      }

      // 5. Wait a moment for cleanup to take effect
      await new Promise(resolve => setTimeout(resolve, 1000));

      const afterCleanup = this.getCurrentMemoryUsage();
      const memoryFreed = beforeCleanup.heapUsed - afterCleanup.heapUsed;

      this.lastCleanupTime = Date.now();

      this.log(`Memory cleanup completed. Freed ${memoryFreed}MB (${beforeCleanup.heapUsed}MB -> ${afterCleanup.heapUsed}MB)`);

      return {
        beforeCleanup,
        afterCleanup,
        memoryFreed,
        cleanupActions,
        success
      };

    } catch (error) {
      this.log(`Memory cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      return {
        beforeCleanup,
        afterCleanup: this.getCurrentMemoryUsage(),
        memoryFreed: 0,
        cleanupActions,
        success: false
      };
    }
  }

  /**
   * Clean up page-specific resources
   */
  async cleanupPageResources(page: Page): Promise<void> {
    try {
      // Clear browser cache
      await page.evaluate(() => {
        // Clear any cached data in the page
        if ('caches' in window) {
          caches.keys().then(names => {
            names.forEach(name => caches.delete(name));
          });
        }
      });

      // Remove event listeners and clear intervals/timeouts
      await page.evaluate(() => {
        // Clear any intervals or timeouts that might be running
        const highestTimeoutId = setTimeout(() => {}, 0);
        clearTimeout(highestTimeoutId);
        // Note: We can't reliably clear all timeouts/intervals without tracking them
      });

      this.log('Page resources cleaned up');
    } catch (error) {
      this.log(`Page cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get memory usage statistics
   */
  getMemoryStats(): {
    current: MemoryUsage;
    peak: MemoryUsage;
    average: MemoryUsage;
    trend: 'increasing' | 'decreasing' | 'stable';
  } {
    const current = this.getCurrentMemoryUsage();
    
    if (this.memoryHistory.length === 0) {
      return {
        current,
        peak: current,
        average: current,
        trend: 'stable'
      };
    }

    const peak = this.memoryHistory.reduce((max, usage) => 
      usage.heapUsed > max.heapUsed ? usage : max
    );

    const totalHeap = this.memoryHistory.reduce((sum, usage) => sum + usage.heapUsed, 0);
    const totalRss = this.memoryHistory.reduce((sum, usage) => sum + usage.rss, 0);
    const count = this.memoryHistory.length;

    const average: MemoryUsage = {
      heapUsed: Math.round(totalHeap / count),
      heapTotal: Math.round(this.memoryHistory.reduce((sum, usage) => sum + usage.heapTotal, 0) / count),
      external: Math.round(this.memoryHistory.reduce((sum, usage) => sum + usage.external, 0) / count),
      rss: Math.round(totalRss / count),
      timestamp: current.timestamp
    };

    // Calculate trend based on recent measurements
    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (this.memoryHistory.length >= 5) {
      const recent = this.memoryHistory.slice(-5);
      const firstHalf = recent.slice(0, 2).reduce((sum, usage) => sum + usage.heapUsed, 0) / 2;
      const secondHalf = recent.slice(-2).reduce((sum, usage) => sum + usage.heapUsed, 0) / 2;
      
      const difference = secondHalf - firstHalf;
      const threshold = 10; // 10MB threshold for trend detection
      
      if (difference > threshold) {
        trend = 'increasing';
      } else if (difference < -threshold) {
        trend = 'decreasing';
      }
    }

    return { current, peak, average, trend };
  }

  /**
   * Check if memory usage is healthy
   */
  isMemoryHealthy(): boolean {
    const current = this.getCurrentMemoryUsage();
    return current.heapUsed < this.thresholds.heapWarning && 
           current.rss < this.thresholds.rssWarning;
  }

  /**
   * Get memory health status including diagnostic storage
   */
  getMemoryHealth(): {
    status: 'healthy' | 'warning' | 'critical';
    issues: string[];
    recommendations: string[];
    diagnosticStorage?: {
      totalEntries: number;
      memoryUsageMB: number;
      entriesByPriority: Record<string, number>;
    };
  } {
    const current = this.getCurrentMemoryUsage();
    const issues: string[] = [];
    const recommendations: string[] = [];
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';

    if (current.heapUsed > this.thresholds.heapCritical) {
      status = 'critical';
      issues.push(`Heap usage critical: ${current.heapUsed}MB > ${this.thresholds.heapCritical}MB`);
      recommendations.push('Immediate cleanup required');
    } else if (current.heapUsed > this.thresholds.heapWarning) {
      status = 'warning';
      issues.push(`Heap usage high: ${current.heapUsed}MB > ${this.thresholds.heapWarning}MB`);
      recommendations.push('Consider cleanup or reducing batch sizes');
    }

    if (current.rss > this.thresholds.rssCritical) {
      status = 'critical';
      issues.push(`RSS usage critical: ${current.rss}MB > ${this.thresholds.rssCritical}MB`);
      recommendations.push('Immediate cleanup required');
    } else if (current.rss > this.thresholds.rssWarning) {
      if (status !== 'critical') status = 'warning';
      issues.push(`RSS usage high: ${current.rss}MB > ${this.thresholds.rssWarning}MB`);
      recommendations.push('Consider cleanup or reducing batch sizes');
    }

    const stats = this.getMemoryStats();
    if (stats.trend === 'increasing') {
      if (status === 'healthy') status = 'warning';
      issues.push('Memory usage trending upward');
      recommendations.push('Monitor closely and consider proactive cleanup');
    }

    // Check diagnostic storage health
    const diagnosticStats = this.getDiagnosticStorageStats();
    const diagnosticMemoryMB = diagnosticStats.memoryUsageMB;
    
    if (diagnosticMemoryMB > this.diagnosticStorageConfig.maxMemoryMB * 0.9) {
      if (status === 'healthy') status = 'warning';
      issues.push(`Diagnostic storage near limit: ${diagnosticMemoryMB}MB`);
      recommendations.push('Diagnostic storage cleanup recommended');
    }

    return { 
      status, 
      issues, 
      recommendations,
      diagnosticStorage: diagnosticStats
    };
  }

  /**
   * Store diagnostic data with automatic memory management
   */
  storeDiagnosticData(id: string, url: string, data: any, priority: string = 'medium'): void {
    const startTime = performance.now();
    
    try {
      // Validate inputs
      if (!id || typeof id !== 'string') {
        throw new Error('Invalid id: must be a non-empty string');
      }
      if (!url || typeof url !== 'string') {
        throw new Error('Invalid url: must be a non-empty string');
      }
      if (data === null || data === undefined) {
        throw new Error('Invalid data: cannot be null or undefined');
      }

      // Normalize priority
      const normalizedPriority = this.normalizePriority(priority);
      
      // Calculate data size (rough estimate)
      const dataSize = this.calculateDataSize(data);
      
      const now = Date.now();
      const entry: DiagnosticEntry = {
        id,
        url,
        data,
        priority: normalizedPriority,
        timestamp: now,
        dataSize,
        lastAccessed: now
      };

      // Check if we need to make space
      this.ensureStorageCapacity(dataSize);

      // Store the entry
      const existingEntry = this.diagnosticStorage.get(id);
      if (existingEntry) {
        this.diagnosticMemoryUsage -= existingEntry.dataSize;
      }
      
      this.diagnosticStorage.set(id, entry);
      this.diagnosticMemoryUsage += dataSize;

      // Update performance metrics
      this.updatePerformanceMetrics('storage', performance.now() - startTime);
      
      // Track peak memory usage
      if (this.diagnosticMemoryUsage > this.diagnosticPerformanceMetrics.peakMemoryUsage) {
        this.diagnosticPerformanceMetrics.peakMemoryUsage = this.diagnosticMemoryUsage;
      }

      this.log(`Stored diagnostic data: ${id} (${this.formatBytes(dataSize)}, priority: ${normalizedPriority})`);
      
    } catch (error) {
      this.log(`Failed to store diagnostic data for ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      // Don't throw - graceful degradation
    }
  }

  /**
   * Retrieve diagnostic data by ID
   */
  getDiagnosticData(id: string): DiagnosticEntry | undefined {
    const startTime = performance.now();
    
    const entry = this.diagnosticStorage.get(id);
    if (entry) {
      entry.lastAccessed = Date.now();
      
      // Update performance metrics
      this.updatePerformanceMetrics('retrieval', performance.now() - startTime);
      
      return { ...entry }; // Return a copy to prevent external modification
    }
    
    // Still track performance for cache misses
    this.updatePerformanceMetrics('retrieval', performance.now() - startTime);
    return undefined;
  }

  /**
   * Retrieve diagnostic data by URL
   */
  getDiagnosticDataByUrl(url: string): DiagnosticEntry[] {
    const startTime = performance.now();
    
    const results: DiagnosticEntry[] = [];
    for (const entry of this.diagnosticStorage.values()) {
      if (entry.url === url) {
        entry.lastAccessed = Date.now();
        results.push({ ...entry });
      }
    }
    
    // Update performance metrics
    this.updatePerformanceMetrics('retrieval', performance.now() - startTime);
    
    return results;
  }

  /**
   * Retrieve diagnostic data by priority
   */
  getDiagnosticDataByPriority(priority: string): DiagnosticEntry[] {
    const startTime = performance.now();
    
    const normalizedPriority = this.normalizePriority(priority);
    const results: DiagnosticEntry[] = [];
    for (const entry of this.diagnosticStorage.values()) {
      if (entry.priority === normalizedPriority) {
        entry.lastAccessed = Date.now();
        results.push({ ...entry });
      }
    }
    
    // Update performance metrics
    this.updatePerformanceMetrics('retrieval', performance.now() - startTime);
    
    return results;
  }

  /**
   * Retrieve diagnostic data by time range
   */
  getDiagnosticDataByTimeRange(startTime: number, endTime: number): DiagnosticEntry[] {
    const perfStartTime = performance.now();
    
    const results: DiagnosticEntry[] = [];
    for (const entry of this.diagnosticStorage.values()) {
      if (entry.timestamp >= startTime && entry.timestamp <= endTime) {
        entry.lastAccessed = Date.now();
        results.push({ ...entry });
      }
    }
    
    // Update performance metrics
    this.updatePerformanceMetrics('retrieval', performance.now() - perfStartTime);
    
    return results;
  }

  /**
   * Get diagnostic storage statistics
   */
  getDiagnosticStorageStats(): {
    totalEntries: number;
    memoryUsageMB: number;
    entriesByPriority: Record<string, number>;
    oldestEntry?: { id: string; age: number };
    newestEntry?: { id: string; age: number };
  } {
    const entriesByPriority: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0
    };

    let oldestEntry: { id: string; age: number } | undefined;
    let newestEntry: { id: string; age: number } | undefined;
    const now = Date.now();

    for (const entry of this.diagnosticStorage.values()) {
      entriesByPriority[entry.priority]++;
      
      const age = now - entry.timestamp;
      if (!oldestEntry || age > oldestEntry.age) {
        oldestEntry = { id: entry.id, age };
      }
      if (!newestEntry || age < newestEntry.age) {
        newestEntry = { id: entry.id, age };
      }
    }

    return {
      totalEntries: this.diagnosticStorage.size,
      memoryUsageMB: Math.round(this.diagnosticMemoryUsage / 1024 / 1024 * 100) / 100,
      entriesByPriority,
      oldestEntry,
      newestEntry
    };
  }

  /**
   * Clean up expired diagnostic data
   */
  private cleanupExpiredDiagnosticData(): number {
    const now = Date.now();
    let cleanedCount = 0;
    let freedMemory = 0;

    for (const [id, entry] of this.diagnosticStorage.entries()) {
      const age = now - entry.timestamp;
      const maxAge = this.diagnosticStorageConfig.retentionPolicyByPriority[entry.priority];
      
      if (age > maxAge) {
        this.diagnosticStorage.delete(id);
        this.diagnosticMemoryUsage -= entry.dataSize;
        freedMemory += entry.dataSize;
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.log(`Cleaned up ${cleanedCount} expired diagnostic entries, freed ${this.formatBytes(freedMemory)}`);
    }

    return cleanedCount;
  }

  /**
   * Ensure storage capacity using LRU eviction
   */
  private ensureStorageCapacity(newDataSize: number): void {
    // First, clean up expired entries
    this.cleanupExpiredDiagnosticData();

    // Check if we exceed memory limit
    const maxMemoryBytes = this.diagnosticStorageConfig.maxMemoryMB * 1024 * 1024;
    const projectedMemoryUsage = this.diagnosticMemoryUsage + newDataSize;

    if (projectedMemoryUsage > maxMemoryBytes || this.diagnosticStorage.size >= this.diagnosticStorageConfig.maxEntries) {
      this.performLRUEviction(newDataSize);
    }
  }

  /**
   * Perform LRU eviction to make space
   */
  private performLRUEviction(newDataSize: number): void {
    const startTime = performance.now();
    
    const maxMemoryBytes = this.diagnosticStorageConfig.maxMemoryMB * 1024 * 1024;
    const targetMemoryUsage = maxMemoryBytes * 0.8; // Target 80% of max memory
    
    // Sort entries by last accessed time (oldest first)
    const sortedEntries = Array.from(this.diagnosticStorage.entries())
      .sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);

    let evictedCount = 0;
    let freedMemory = 0;

    for (const [id, entry] of sortedEntries) {
      // Don't evict critical priority items unless absolutely necessary
      if (entry.priority === 'critical' && this.diagnosticMemoryUsage + newDataSize < maxMemoryBytes) {
        continue;
      }

      this.diagnosticStorage.delete(id);
      this.diagnosticMemoryUsage -= entry.dataSize;
      freedMemory += entry.dataSize;
      evictedCount++;

      // Stop if we've freed enough space
      if (this.diagnosticMemoryUsage + newDataSize <= targetMemoryUsage && 
          this.diagnosticStorage.size < this.diagnosticStorageConfig.maxEntries) {
        break;
      }
    }

    // Update performance metrics
    this.updatePerformanceMetrics('eviction', performance.now() - startTime);

    if (evictedCount > 0) {
      this.log(`LRU evicted ${evictedCount} diagnostic entries, freed ${this.formatBytes(freedMemory)}`);
    }
  }

  /**
   * Normalize priority to valid values
   */
  private normalizePriority(priority: string): 'low' | 'medium' | 'high' | 'critical' {
    const normalized = priority.toLowerCase();
    switch (normalized) {
      case 'critical':
      case 'high':
      case 'medium':
      case 'low':
        return normalized as 'low' | 'medium' | 'high' | 'critical';
      default:
        return 'medium'; // Default fallback
    }
  }

  /**
   * Calculate rough data size in bytes
   */
  private calculateDataSize(data: any): number {
    try {
      return JSON.stringify(data).length * 2; // Rough estimate (UTF-16)
    } catch {
      return 1024; // Default estimate for non-serializable data
    }
  }

  /**
   * Update performance metrics for diagnostic storage operations
   */
  private updatePerformanceMetrics(operation: 'storage' | 'retrieval' | 'eviction', duration: number): void {
    this.diagnosticPerformanceMetrics.totalOperations++;
    
    switch (operation) {
      case 'storage':
        this.diagnosticPerformanceMetrics.storageOperations++;
        this.diagnosticPerformanceMetrics.totalStorageTime += duration;
        this.diagnosticPerformanceMetrics.averageStorageTime = 
          this.diagnosticPerformanceMetrics.totalStorageTime / this.diagnosticPerformanceMetrics.storageOperations;
        break;
      case 'retrieval':
        this.diagnosticPerformanceMetrics.retrievalOperations++;
        this.diagnosticPerformanceMetrics.totalRetrievalTime += duration;
        this.diagnosticPerformanceMetrics.averageRetrievalTime = 
          this.diagnosticPerformanceMetrics.totalRetrievalTime / this.diagnosticPerformanceMetrics.retrievalOperations;
        break;
      case 'eviction':
        this.diagnosticPerformanceMetrics.evictionOperations++;
        this.diagnosticPerformanceMetrics.totalEvictionTime += duration;
        this.diagnosticPerformanceMetrics.averageEvictionTime = 
          this.diagnosticPerformanceMetrics.totalEvictionTime / this.diagnosticPerformanceMetrics.evictionOperations;
        break;
    }
    
    // Update operations per second (calculate over last minute)
    const now = Date.now();
    const timeSinceLastUpdate = now - this.diagnosticPerformanceMetrics.lastPerformanceUpdate;
    if (timeSinceLastUpdate >= 60000) { // Update every minute
      this.diagnosticPerformanceMetrics.operationsPerSecond = 
        this.diagnosticPerformanceMetrics.totalOperations / (timeSinceLastUpdate / 1000);
      this.diagnosticPerformanceMetrics.lastPerformanceUpdate = now;
    }
  }

  /**
   * Get diagnostic storage performance metrics
   */
  getDiagnosticStoragePerformanceMetrics(): {
    operations: {
      total: number;
      storage: number;
      retrieval: number;
      eviction: number;
      operationsPerSecond: number;
    };
    timing: {
      averageStorageTime: number;
      averageRetrievalTime: number;
      averageEvictionTime: number;
      totalStorageTime: number;
      totalRetrievalTime: number;
      totalEvictionTime: number;
    };
    memory: {
      currentUsageMB: number;
      peakUsageMB: number;
      maxConfiguredMB: number;
      utilizationPercentage: number;
    };
    storage: {
      totalEntries: number;
      maxConfiguredEntries: number;
      storageUtilizationPercentage: number;
    };
    recommendations: string[];
  } {
    const currentUsageMB = this.diagnosticMemoryUsage / 1024 / 1024;
    const peakUsageMB = this.diagnosticPerformanceMetrics.peakMemoryUsage / 1024 / 1024;
    const maxConfiguredMB = this.diagnosticStorageConfig.maxMemoryMB;
    const utilizationPercentage = (currentUsageMB / maxConfiguredMB) * 100;
    const storageUtilizationPercentage = (this.diagnosticStorage.size / this.diagnosticStorageConfig.maxEntries) * 100;
    
    const recommendations: string[] = [];
    
    // Performance recommendations
    if (this.diagnosticPerformanceMetrics.averageStorageTime > 10) {
      recommendations.push('Storage operations are slow (>10ms average). Consider optimizing data serialization.');
    }
    if (this.diagnosticPerformanceMetrics.averageRetrievalTime > 5) {
      recommendations.push('Retrieval operations are slow (>5ms average). Consider adding indexing for frequent queries.');
    }
    if (utilizationPercentage > 80) {
      recommendations.push('Memory utilization is high (>80%). Consider increasing memory limits or reducing retention time.');
    }
    if (storageUtilizationPercentage > 90) {
      recommendations.push('Storage utilization is very high (>90%). Consider increasing max entries or implementing more aggressive eviction.');
    }
    if (this.diagnosticPerformanceMetrics.evictionOperations > this.diagnosticPerformanceMetrics.storageOperations * 0.1) {
      recommendations.push('High eviction rate detected. Consider increasing storage limits or optimizing data size.');
    }
    if (this.diagnosticPerformanceMetrics.operationsPerSecond > 100) {
      recommendations.push('High operation rate detected. Monitor for performance impact on main application.');
    }
    
    return {
      operations: {
        total: this.diagnosticPerformanceMetrics.totalOperations,
        storage: this.diagnosticPerformanceMetrics.storageOperations,
        retrieval: this.diagnosticPerformanceMetrics.retrievalOperations,
        eviction: this.diagnosticPerformanceMetrics.evictionOperations,
        operationsPerSecond: this.diagnosticPerformanceMetrics.operationsPerSecond
      },
      timing: {
        averageStorageTime: Math.round(this.diagnosticPerformanceMetrics.averageStorageTime * 100) / 100,
        averageRetrievalTime: Math.round(this.diagnosticPerformanceMetrics.averageRetrievalTime * 100) / 100,
        averageEvictionTime: Math.round(this.diagnosticPerformanceMetrics.averageEvictionTime * 100) / 100,
        totalStorageTime: Math.round(this.diagnosticPerformanceMetrics.totalStorageTime * 100) / 100,
        totalRetrievalTime: Math.round(this.diagnosticPerformanceMetrics.totalRetrievalTime * 100) / 100,
        totalEvictionTime: Math.round(this.diagnosticPerformanceMetrics.totalEvictionTime * 100) / 100
      },
      memory: {
        currentUsageMB: Math.round(currentUsageMB * 100) / 100,
        peakUsageMB: Math.round(peakUsageMB * 100) / 100,
        maxConfiguredMB,
        utilizationPercentage: Math.round(utilizationPercentage * 100) / 100
      },
      storage: {
        totalEntries: this.diagnosticStorage.size,
        maxConfiguredEntries: this.diagnosticStorageConfig.maxEntries,
        storageUtilizationPercentage: Math.round(storageUtilizationPercentage * 100) / 100
      },
      recommendations
    };
  }

  /**
   * Get optimized configuration suggestions based on performance metrics
   */
  getOptimizedConfigurationSuggestions(): {
    currentConfig: DiagnosticStorageConfig;
    suggestedConfig: DiagnosticStorageConfig;
    reasoning: string[];
  } {
    const currentConfig = { ...this.diagnosticStorageConfig };
    const suggestedConfig = { ...this.diagnosticStorageConfig };
    const reasoning: string[] = [];
    
    const metrics = this.getDiagnosticStoragePerformanceMetrics();
    
    // Optimize memory limits based on usage patterns
    if (metrics.memory.utilizationPercentage > 90) {
      suggestedConfig.maxMemoryMB = Math.ceil(currentConfig.maxMemoryMB * 1.5);
      reasoning.push(`Increase memory limit to ${suggestedConfig.maxMemoryMB}MB due to high utilization (${metrics.memory.utilizationPercentage}%)`);
    } else if (metrics.memory.utilizationPercentage < 30 && currentConfig.maxMemoryMB > 25) {
      suggestedConfig.maxMemoryMB = Math.max(25, Math.ceil(currentConfig.maxMemoryMB * 0.8));
      reasoning.push(`Decrease memory limit to ${suggestedConfig.maxMemoryMB}MB due to low utilization (${metrics.memory.utilizationPercentage}%)`);
    }
    
    // Optimize entry limits based on storage patterns
    if (metrics.storage.storageUtilizationPercentage > 90) {
      suggestedConfig.maxEntries = Math.ceil(currentConfig.maxEntries * 1.3);
      reasoning.push(`Increase max entries to ${suggestedConfig.maxEntries} due to high storage utilization (${metrics.storage.storageUtilizationPercentage}%)`);
    }
    
    // Optimize retention policies based on eviction patterns
    if (metrics.operations.eviction > metrics.operations.storage * 0.2) {
      // High eviction rate - reduce retention times
      suggestedConfig.retentionPolicyByPriority = {
        critical: Math.max(currentConfig.retentionPolicyByPriority.critical * 0.8, 60 * 60 * 1000),
        high: Math.max(currentConfig.retentionPolicyByPriority.high * 0.8, 30 * 60 * 1000),
        medium: Math.max(currentConfig.retentionPolicyByPriority.medium * 0.8, 15 * 60 * 1000),
        low: Math.max(currentConfig.retentionPolicyByPriority.low * 0.8, 5 * 60 * 1000)
      };
      reasoning.push('Reduced retention times due to high eviction rate to improve performance');
    }
    
    return {
      currentConfig,
      suggestedConfig,
      reasoning
    };
  }

  /**
   * Format bytes for human-readable output
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  private log(message: string): void {
    if (this.debugMode) {
      console.log(`[MemoryManager] ${message}`);
    }
  }
}