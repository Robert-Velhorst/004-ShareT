/**
 * Memory-Efficient Rate Limiting using rate-limiter-flexible
 * Atomic operations, no race conditions, very low memory footprint
 * GitHub: https://github.com/animir/node-rate-limiter-flexible (3.1k+ stars)
 */

const { RateLimiterMemory } = require('rate-limiter-flexible');
const { rateLimit } = require('express-rate-limit');

// Conventional transport limits complement the existing atomic/domain budgets.
// Keep both: route-scoped IP budgets also bound requests before user lookup.
const standardApiRateLimit = rateLimit({ windowMs: 60_000, limit: 100, standardHeaders: 'draft-8', legacyHeaders: false });
const standardSharedRateLimit = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false });


// General API rate limiter - 100 requests per minute
const apiLimiter = new RateLimiterMemory({
  points: 100,          // 100 requests
  duration: 60,         // per 60 seconds
  blockDuration: 60     // block for 60s if exceeded
});

// Auth endpoints rate limiter - stricter to prevent brute force
const authLimiter = new RateLimiterMemory({
  points: 10,           // 10 attempts
  duration: 60 * 15,    // per 15 minutes
  blockDuration: 60 * 30  // block for 30 minutes
});

// Trello API rate limiter - respect Trello's limits
const trelloLimiter = new RateLimiterMemory({
  points: 100,          // 100 requests
  duration: 10,         // per 10 seconds (Trello limit)
  blockDuration: 10     // block for 10s if exceeded
});

// Shared link access limiter - prevent abuse
const sharedLinkLimiter = new RateLimiterMemory({
  points: 30,           // 30 requests
  duration: 60,         // per minute
  blockDuration: 60     // block for 1 minute
});

// File upload limiter - prevent storage abuse
const uploadLimiter = new RateLimiterMemory({
  points: 10,           // 10 uploads
  duration: 60 * 5,     // per 5 minutes
  blockDuration: 60 * 5 // block for 5 minutes
});

const verificationLimiter = new RateLimiterMemory({
  points: 5,
  duration: 60 * 15,
  blockDuration: 60 * 15
});

const verificationRateLimit = async (req, res, next) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const key = `verify_${req.ip}_${req.params.shareId || ''}_${email}`;
  try {
    const result = await verificationLimiter.consume(key);
    res.set({
      'X-RateLimit-Limit': verificationLimiter.points,
      'X-RateLimit-Remaining': result.remainingPoints,
      'X-RateLimit-Reset': new Date(Date.now() + result.msBeforeNext).toISOString()
    });
    next();
  } catch (result) {
    const retryAfter = Math.round(result.msBeforeNext / 1000) || 1;
    res.set({ 'Retry-After': String(retryAfter), 'X-RateLimit-Remaining': 0 });
    res.status(429).json({
      success: false,
      message: `Too many verification emails. Please try again in ${retryAfter} seconds.`,
      retryAfter
    });
  }
};

/**
 * Create rate limiter middleware
 * @param {RateLimiterMemory} limiter - The rate limiter instance
 * @param {string} keyPrefix - Prefix for the rate limit key
 * @returns {Function} Express middleware
 */
function createRateLimiterMiddleware(limiter, keyPrefix = '') {
  return async (req, res, next) => {
    try {
      // Use IP + optional user ID as key
      const userId = req.user?.id || '';
      const key = `${keyPrefix}${req.ip}_${userId}`;
      
      const rateLimiterRes = await limiter.consume(key);
      
      // Add rate limit headers
      res.set({
        'X-RateLimit-Limit': limiter.points,
        'X-RateLimit-Remaining': rateLimiterRes.remainingPoints,
        'X-RateLimit-Reset': new Date(Date.now() + rateLimiterRes.msBeforeNext).toISOString()
      });
      
      next();
    } catch (rejRes) {
      const secs = Math.round(rejRes.msBeforeNext / 1000) || 1;
      res.set({
        'Retry-After': String(secs),
        'X-RateLimit-Limit': limiter.points,
        'X-RateLimit-Remaining': 0,
        'X-RateLimit-Reset': new Date(Date.now() + rejRes.msBeforeNext).toISOString()
      });
      
      res.status(429).json({
        success: false,
        error: 'Too many requests',
        message: `Please try again in ${secs} seconds`,
        retryAfter: secs
      });
    }
  };
}

// Export middleware instances
module.exports = {
  standardApiRateLimit,
  standardSharedRateLimit,
  // Middleware
  apiRateLimit: createRateLimiterMiddleware(apiLimiter, 'api_'),
  authRateLimit: createRateLimiterMiddleware(authLimiter, 'auth_'),
  trelloRateLimit: createRateLimiterMiddleware(trelloLimiter, 'trello_'),
  sharedLinkRateLimit: createRateLimiterMiddleware(sharedLinkLimiter, 'shared_'),
  uploadRateLimit: createRateLimiterMiddleware(uploadLimiter, 'upload_'),
  verificationRateLimit,
  
  // Raw limiters for custom use
  limiters: {
    api: apiLimiter,
    auth: authLimiter,
    trello: trelloLimiter,
    sharedLink: sharedLinkLimiter,
    upload: uploadLimiter,
    verification: verificationLimiter
  },
  
  // Factory function for custom limiters
  createRateLimiterMiddleware
};
