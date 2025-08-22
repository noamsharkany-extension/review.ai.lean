import NodeCache from 'node-cache';
import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';

// In-memory cache for development, Redis for production
const cache = new NodeCache({
  stdTTL: 3600, // 1 hour default TTL
  checkperiod: 600, // Check for expired keys every 10 minutes
  useClones: false // Don't clone objects for better performance
});

// Cache key generator for analysis results
export function generateCacheKey(url: string): string {
  // Normalize URL and create hash for consistent caching
  const normalizedUrl = url.toLowerCase().trim();
  return `analysis:${createHash('sha256').update(normalizedUrl).digest('hex')}`;
}

// Middleware to cache analysis results
export function cacheAnalysisResults(ttl: number = 3600) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Only cache successful GET requests for analysis status
    if (req.method !== 'GET' || !req.params.id) {
      return next();
    }

    const cacheKey = `session:${req.params.id}`;
    const cachedResult = cache.get(cacheKey);

    if (cachedResult) {
      console.log(`Cache hit for session: ${req.params.id}`);
      return res.json(cachedResult);
    }

    // Store original res.json to intercept response
    const originalJson = res.json;
    res.json = function(body: any) {
      // Only cache successful responses with completed analysis
      if (res.statusCode === 200 && body.session?.status === 'complete') {
        console.log(`Caching result for session: ${req.params.id}`);
        cache.set(cacheKey, body, ttl);
      }
      return originalJson.call(this, body);
    };

    next();
  };
}

// Middleware to cache URL validation results
export function cacheUrlValidation(ttl: number = 1800) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'POST' || !req.body.googleUrl) {
      return next();
    }

    const cacheKey = `url_validation:${generateCacheKey(req.body.googleUrl)}`;
    const cachedResult = cache.get(cacheKey);

    if (cachedResult) {
      console.log(`Cache hit for URL validation: ${req.body.googleUrl}`);
      if (cachedResult === 'invalid') {
        return res.status(400).json({
          sessionId: '',
          status: 'error',
          error: 'Invalid Google URL (cached result)',
          errorType: 'validation'
        });
      }
    }

    // Store validation result
    const originalNext = next;
    next = function(error?: any) {
      if (!error) {
        // URL is valid, cache the result
        cache.set(cacheKey, 'valid', ttl);
      }
      return originalNext(error);
    };

    next();
  };
}

// Middleware to cache comprehensive collection results
export function cacheComprehensiveResults(ttl: number = 7200) { // 2 hours for comprehensive results
  return (req: Request, res: Response, next: NextFunction) => {
    // Only cache successful GET requests for comprehensive collection status
    if (req.method !== 'GET' || !req.params.id) {
      return next();
    }

    const cacheKey = `comprehensive:${req.params.id}`;
    const cachedResult = cache.get(cacheKey);

    if (cachedResult) {
      console.log(`Cache hit for comprehensive collection: ${req.params.id}`);
      return res.json(cachedResult);
    }

    // Store original res.json to intercept response
    const originalJson = res.json;
    res.json = function(body: any) {
      // Only cache successful responses with completed comprehensive collection
      if (res.statusCode === 200 && body.session?.status === 'complete') {
        console.log(`Caching comprehensive collection result for session: ${req.params.id}`);
        cache.set(cacheKey, body, ttl);
      }
      return originalJson.call(this, body);
    };

    next();
  };
}

// Cache management functions
export const cacheManager = {
  // Get cache statistics
  getStats() {
    return {
      keys: cache.keys().length,
      hits: cache.getStats().hits,
      misses: cache.getStats().misses,
      ksize: cache.getStats().ksize,
      vsize: cache.getStats().vsize
    };
  },

  // Clear all cache
  clear() {
    cache.flushAll();
    console.log('Cache cleared');
  },

  // Clear specific cache entry
  delete(key: string) {
    return cache.del(key);
  },

  // Get cache entry
  get(key: string) {
    return cache.get(key);
  },

  // Set cache entry
  set(key: string, value: any, ttl?: number) {
    return cache.set(key, value, ttl || 3600);
  },

  // Check if key exists
  has(key: string) {
    return cache.has(key);
  },

  // Clear comprehensive collection cache entries
  clearComprehensive() {
    const keys = cache.keys();
    const comprehensiveKeys = keys.filter(key => key.startsWith('comprehensive:'));
    comprehensiveKeys.forEach(key => cache.del(key));
    console.log(`Cleared ${comprehensiveKeys.length} comprehensive collection cache entries`);
    return comprehensiveKeys.length;
  }
};

// Cleanup function for graceful shutdown
export function closeCacheConnections() {
  cache.close();
  console.log('Cache connections closed');
}