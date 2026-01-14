// Rate Limiting Middleware
// Prevents abuse and ensures fair usage across users

import rateLimit from 'express-rate-limit';

// ============================================================================
// RATE LIMIT CONFIGURATIONS
// ============================================================================

/**
 * General API rate limiter
 * Applies to all routes
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // 500 requests per 15 minutes per IP
  message: {
    error: 'Too many requests',
    message: 'You have exceeded the rate limit. Please try again later.',
    retryAfter: 15 * 60, // seconds
  },
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false,
  // Skip rate limiting for health checks
  skip: (req) => req.path === '/health' || req.path === '/v1/health',
});

/**
 * AI-heavy endpoints rate limiter
 * More restrictive for expensive operations
 */
export const aiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // 10 AI requests per minute per IP
  message: {
    error: 'AI rate limit exceeded',
    message: 'AI operations are limited. Please wait before making more requests.',
    retryAfter: 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use userId if available, otherwise IP
    return req.headers['x-user-id'] || req.ip;
  },
});

/**
 * Character recognition rate limiter
 * Separate limit for recognition calls
 */
export const recognitionLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 15, // 15 recognition requests per minute
  message: {
    error: 'Recognition rate limit exceeded',
    message: 'Character recognition is limited. Please wait before trying again.',
    retryAfter: 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.headers['x-user-id'] || req.ip,
});

/**
 * Generation rate limiter
 * For narrative/relationship generation
 */
export const generationLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // 20 generation requests per 5 minutes
  message: {
    error: 'Generation rate limit exceeded',
    message: 'Generation operations are limited. Please wait before generating more content.',
    retryAfter: 5 * 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.headers['x-user-id'] || req.ip,
});

/**
 * Tone rendering rate limiter
 */
export const toneLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20, // 20 tone changes per minute
  message: {
    error: 'Tone change rate limit exceeded',
    message: 'Tone changes are limited. Please wait before changing tone again.',
    retryAfter: 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.headers['x-user-id'] || req.ip,
});

/**
 * Authentication rate limiter
 * Strict limit for login attempts
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 login attempts per 15 minutes
  message: {
    error: 'Too many login attempts',
    message: 'Too many login attempts. Please try again later.',
    retryAfter: 15 * 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================================================
// PER-USER RATE LIMITING (More granular)
// ============================================================================

// In-memory store for per-user rate limiting
// In production, use Redis for distributed rate limiting
const userRequestCounts = new Map();

/**
 * Clean up old entries periodically
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of userRequestCounts.entries()) {
    if (now - data.timestamp > 60 * 60 * 1000) { // 1 hour
      userRequestCounts.delete(key);
    }
  }
}, 5 * 60 * 1000); // Clean every 5 minutes

/**
 * Per-user rate limit middleware factory
 * @param {Object} options - Configuration options
 */
export function perUserLimit(options = {}) {
  const {
    windowMs = 60 * 1000,
    max = 30,
    keyPrefix = 'default',
    message = 'Rate limit exceeded',
  } = options;

  return (req, res, next) => {
    const userId = req.headers['x-user-id'];
    if (!userId) {
      return next(); // No user ID, skip per-user limiting
    }

    const key = `${keyPrefix}:${userId}`;
    const now = Date.now();
    
    let userData = userRequestCounts.get(key);
    
    if (!userData || now - userData.timestamp > windowMs) {
      // New window
      userData = { count: 1, timestamp: now };
    } else {
      userData.count++;
    }
    
    userRequestCounts.set(key, userData);

    if (userData.count > max) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message,
        retryAfter: Math.ceil((userData.timestamp + windowMs - now) / 1000),
      });
    }

    // Add headers
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - userData.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil((userData.timestamp + windowMs) / 1000));

    next();
  };
}

// ============================================================================
// COMBINED LIMITERS FOR SPECIFIC ROUTES
// ============================================================================

/**
 * Apply multiple limiters in sequence
 */
export function combinedLimiter(...limiters) {
  return (req, res, next) => {
    let index = 0;
    
    const runNext = (err) => {
      if (err) return next(err);
      if (index >= limiters.length) return next();
      
      const limiter = limiters[index++];
      limiter(req, res, runNext);
    };
    
    runNext();
  };
}
