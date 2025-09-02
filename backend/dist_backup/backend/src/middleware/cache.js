import NodeCache from 'node-cache';
import { createHash } from 'crypto';
const cache = new NodeCache({
    stdTTL: 3600,
    checkperiod: 600,
    useClones: false
});
export function generateCacheKey(url) {
    const normalizedUrl = url.toLowerCase().trim();
    return `analysis:${createHash('sha256').update(normalizedUrl).digest('hex')}`;
}
export function cacheAnalysisResults(ttl = 3600) {
    return (req, res, next) => {
        if (req.method !== 'GET' || !req.params.id) {
            return next();
        }
        const cacheKey = `session:${req.params.id}`;
        const cachedResult = cache.get(cacheKey);
        if (cachedResult) {
            console.log(`Cache hit for session: ${req.params.id}`);
            return res.json(cachedResult);
        }
        const originalJson = res.json;
        res.json = function (body) {
            if (res.statusCode === 200 && body.session?.status === 'complete') {
                console.log(`Caching result for session: ${req.params.id}`);
                cache.set(cacheKey, body, ttl);
            }
            return originalJson.call(this, body);
        };
        next();
    };
}
export function cacheUrlValidation(ttl = 1800) {
    return (req, res, next) => {
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
        const originalNext = next;
        next = function (error) {
            if (!error) {
                cache.set(cacheKey, 'valid', ttl);
            }
            return originalNext(error);
        };
        next();
    };
}
export function cacheComprehensiveResults(ttl = 7200) {
    return (req, res, next) => {
        if (req.method !== 'GET' || !req.params.id) {
            return next();
        }
        const cacheKey = `comprehensive:${req.params.id}`;
        const cachedResult = cache.get(cacheKey);
        if (cachedResult) {
            console.log(`Cache hit for comprehensive collection: ${req.params.id}`);
            return res.json(cachedResult);
        }
        const originalJson = res.json;
        res.json = function (body) {
            if (res.statusCode === 200 && body.session?.status === 'complete') {
                console.log(`Caching comprehensive collection result for session: ${req.params.id}`);
                cache.set(cacheKey, body, ttl);
            }
            return originalJson.call(this, body);
        };
        next();
    };
}
export const cacheManager = {
    getStats() {
        return {
            keys: cache.keys().length,
            hits: cache.getStats().hits,
            misses: cache.getStats().misses,
            ksize: cache.getStats().ksize,
            vsize: cache.getStats().vsize
        };
    },
    clear() {
        cache.flushAll();
        console.log('Cache cleared');
    },
    delete(key) {
        return cache.del(key);
    },
    get(key) {
        return cache.get(key);
    },
    set(key, value, ttl) {
        return cache.set(key, value, ttl || 3600);
    },
    has(key) {
        return cache.has(key);
    },
    clearComprehensive() {
        const keys = cache.keys();
        const comprehensiveKeys = keys.filter(key => key.startsWith('comprehensive:'));
        comprehensiveKeys.forEach(key => cache.del(key));
        console.log(`Cleared ${comprehensiveKeys.length} comprehensive collection cache entries`);
        return comprehensiveKeys.length;
    }
};
export function closeCacheConnections() {
    cache.close();
    console.log('Cache connections closed');
}
//# sourceMappingURL=cache.js.map