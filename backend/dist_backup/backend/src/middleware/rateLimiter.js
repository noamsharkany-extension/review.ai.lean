import rateLimit from 'express-rate-limit';
export const analysisRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    message: {
        error: 'Too many analysis requests from this IP, please try again later.',
        errorType: 'rate_limit',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).json({
            error: 'Too many analysis requests from this IP, please try again later.',
            errorType: 'rate_limit',
            retryAfter: '15 minutes'
        });
    }
});
export const generalRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: {
        error: 'Too many requests from this IP, please try again later.',
        errorType: 'rate_limit',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).json({
            error: 'Too many requests from this IP, please try again later.',
            errorType: 'rate_limit',
            retryAfter: '15 minutes'
        });
    }
});
export const retryRateLimit = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 3,
    message: {
        error: 'Too many retry requests from this IP, please try again later.',
        errorType: 'rate_limit',
        retryAfter: '5 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).json({
            error: 'Too many retry requests from this IP, please try again later.',
            errorType: 'rate_limit',
            retryAfter: '5 minutes'
        });
    }
});
//# sourceMappingURL=rateLimiter.js.map