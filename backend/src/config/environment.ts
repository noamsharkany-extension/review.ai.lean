import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables
dotenv.config();

// Environment validation schema
const envSchema = z.object({
  // Server Configuration
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3001'),
  
  // OpenAI Configuration
  OPENAI_API_KEY: z.string().min(1, 'OpenAI API key is required'),
  OPENAI_MODEL: z.string().default('gpt-5'),
  USE_FALLBACK_ANALYSIS: z.string().optional(),
  
  // Database Configuration
  DATABASE_URL: z.string().default('sqlite:./data/reviews.db'),
  
  // Cache Configuration
  REDIS_URL: z.string().optional(),
  
  // Rate Limiting Configuration
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default('900000'), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).default('10'),
  RATE_LIMIT_MAX_GENERAL: z.string().transform(Number).default('100'),
  
  // Security Configuration
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  SESSION_SECRET: z.string().min(32, 'Session secret must be at least 32 characters'),
  
  // Performance Configuration
  MAX_CONCURRENT_ANALYSES: z.string().transform(Number).default('5'),
  CACHE_TTL_SECONDS: z.string().transform(Number).default('3600'),
  CLEANUP_INTERVAL_HOURS: z.string().transform(Number).default('24'),
  
  // Logging Configuration
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FILE: z.string().default('./logs/app.log'),
  
  // Health Check Configuration
  HEALTH_CHECK_TIMEOUT: z.string().transform(Number).default('30000')
});

// Validate and parse environment variables
let config: z.infer<typeof envSchema>;

try {
  config = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('Environment validation failed:');
    error.errors.forEach(err => {
      console.error(`  ${err.path.join('.')}: ${err.message}`);
    });
    process.exit(1);
  }
  throw error;
}

// Export typed configuration
export const env = config;

// Helper functions
export const isDevelopment = () => env.NODE_ENV === 'development';
export const isProduction = () => env.NODE_ENV === 'production';
export const isTest = () => env.NODE_ENV === 'test';

// Database configuration
export const getDatabaseConfig = () => ({
  url: env.DATABASE_URL,
  isPostgreSQL: env.DATABASE_URL.startsWith('postgresql://') || env.DATABASE_URL.startsWith('postgres://'),
  isSQLite: env.DATABASE_URL.startsWith('sqlite:')
});

// Cache configuration
export const getCacheConfig = () => ({
  redisUrl: env.REDIS_URL,
  ttl: env.CACHE_TTL_SECONDS,
  useRedis: !!env.REDIS_URL && isProduction()
});

// Rate limiting configuration
export const getRateLimitConfig = () => ({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
  maxGeneral: env.RATE_LIMIT_MAX_GENERAL
});

// CORS configuration
export const getCorsConfig = () => ({
  origin: isProduction() 
    ? env.CORS_ORIGIN.split(',').map(origin => origin.trim())
    : ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true
});

// Logging configuration
export const getLogConfig = () => ({
  level: env.LOG_LEVEL,
  file: env.LOG_FILE,
  console: isDevelopment()
});

// Performance configuration
export const getPerformanceConfig = () => ({
  maxConcurrentAnalyses: env.MAX_CONCURRENT_ANALYSES,
  cleanupIntervalHours: env.CLEANUP_INTERVAL_HOURS,
  healthCheckTimeout: env.HEALTH_CHECK_TIMEOUT
});