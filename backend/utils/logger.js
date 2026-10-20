/**
 * Pino Logger Utility
 * Structured JSON logging for production and readable output in development.
 */

const pino = require('pino');
const pinoHttp = require('pino-http');

// Determine if we're in development or production
const isDev = process.env.NODE_ENV !== 'production';

// Create the base logger
const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  
  // Use pino-pretty in development for readable logs
  transport: isDev ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  } : undefined,
  
  // Production: JSON format with timestamp
  ...(isDev ? {} : {
    timestamp: pino.stdTimeFunctions.isoTime,
  }),
  
  // Base context for all logs
  base: {
    app: 'sharet',
    version: '1.1.0',
  },
  
  // Redact sensitive fields
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'password',
      'token',
      'apiKey',
      'secret',
    ],
    censor: '[REDACTED]',
  },
});

// Create HTTP request logger middleware
const httpLogger = pinoHttp({
  logger,
  
  // Custom log level based on status code
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    if (res.statusCode >= 300) return 'silent'; // Don't log redirects
    return 'info';
  },
  
  // Custom success message
  customSuccessMessage: (req) => {
    return `${req.method} ${req.url} completed`;
  },
  
  // Custom error message
  customErrorMessage: (req, res, err) => {
    return `${req.method} ${req.url} failed: ${err.message}`;
  },
  
  // Custom attributes to add to each log
  customAttributeKeys: {
    req: 'request',
    res: 'response',
    err: 'error',
    responseTime: 'duration',
  },
  
  // Serialize request
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      query: req.query,
      params: req.params,
      // Don't log body in production (may contain sensitive data)
      ...(isDev && req.body ? { body: req.body } : {}),
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
  
  // Generate request ID
  genReqId: (req) => {
    return req.headers['x-request-id'] || req.id || require('crypto').randomUUID();
  },
  
  // Don't log health check requests
  autoLogging: {
    ignore: (req) => {
      return req.url === '/health' || req.url === '/favicon.ico';
    },
  },
});

// Child loggers for different modules
const createChildLogger = (module) => {
  return logger.child({ module });
};

// Pre-configured child loggers
const loggers = {
  auth: createChildLogger('auth'),
  trello: createChildLogger('trello'),
  share: createChildLogger('share'),
  db: createChildLogger('database'),
};

module.exports = {
  logger,
  httpLogger,
  createChildLogger,
  loggers,
};
