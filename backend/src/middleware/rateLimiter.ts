import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

// Rate limiter for analysis endpoints
export const analysisRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Increased limit for development (was 10)
  message: {
    error: 'Too many analysis requests from this IP, please try again later.',
    errorType: 'rate_limit',
    retryAfter: '15 minutes'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too many analysis requests from this IP, please try again later.',
      errorType: 'rate_limit',
      retryAfter: '15 minutes'
    });
  }
});

// Rate limiter for general API endpoints
export const generalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Increased limit for development (was 100)
  message: {
    error: 'Too many requests from this IP, please try again later.',
    errorType: 'rate_limit',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too many requests from this IP, please try again later.',
      errorType: 'rate_limit',
      retryAfter: '15 minutes'
    });
  }
});

// Rate limiter for retry endpoints (more restrictive)
export const retryRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 3, // Limit each IP to 3 retry requests per windowMs
  message: {
    error: 'Too many retry requests from this IP, please try again later.',
    errorType: 'rate_limit',
    retryAfter: '5 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too many retry requests from this IP, please try again later.',
      errorType: 'rate_limit',
      retryAfter: '5 minutes'
    });
  }
});