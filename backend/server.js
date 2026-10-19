/**
 * ShareT Backend Server - Platform-Agnostic with PouchDB
 * 
 * Features:
 * - No database installation required (PouchDB stores data locally)
 * - Works on Windows, Mac, Linux
 * - Optional cloud sync via CouchDB
 * - Compressed static assets, structured logging, bounded caches, rate limits,
 *   and graceful shutdown
 */

const path = require('path');
const dotenv = require('dotenv');
// Existing OS/container variables always win. The backend file is the primary
// local configuration; the root file only fills values it did not provide.
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const helmet = require('helmet');
const compression = require('compression');
const sirv = require('sirv');

// Import PouchDB database layer
const { initDatabases, setupSync, closeAll, getStats, getMigrationState, pruneExpiredData } = require('./db/pouchdb');

// Import optimized utilities (GitHub Gems)
const { logger, httpLogger, loggers } = require('./utils/logger');
const { getStats: getCacheStats, clearAll: clearCache } = require('./utils/cache');
const { apiRateLimit } = require('./utils/rateLimiter');
const { errorResponseSchema, sendFastJSON } = require('./utils/jsonSerializer');

// Import routes
const authRoutes = require('./routes/authRoutes');
const trelloRoutes = require('./routes/trelloRoutes');
const sharedLinkRoutes = require('./routes/sharedLinkRoutes');
const sharedAccessRoutes = require('./routes/sharedAccessRoutes');
const adminRoutes = require('./routes/adminRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const trelloWebhookRoutes = require('./routes/trelloWebhookRoutes');
const connectorRoutes = require('./routes/connectorRoutes');
const { startReplyNotificationMonitor, stopReplyNotificationMonitor } = require('./services/replyNotificationService');
const { reconcileActiveTrelloWebhooks } = require('./services/trelloWebhookService');
const { inspectRuntimeEnvironment, validateRuntimeEnvironment } = require('./config/runtime');

// Create Express app
const app = express();

// Preserve Express 4's extended query-string parsing during the v5 migration.
app.set('query parser', 'extended');

// Trust proxy for Cloudflare Tunnel
app.set('trust proxy', 1);

// Structured HTTP logging
app.use(httpLogger);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://api.trello.com'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// Compression middleware with Brotli support
app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }
}));

// Initialize PouchDB databases
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
let dbInitialized = false;

const initDB = async () => {
  try {
    await initDatabases(dataDir);
    loggers.db.info({ dataDir }, 'PouchDB databases initialized');
    const retention = await pruneExpiredData();
    loggers.db.info({ retention }, 'Expired verification and access-log data pruned');
    const retentionTimer = setInterval(() => {
      pruneExpiredData().catch(error => loggers.db.error({ err: error }, 'Retention cleanup failed'));
    }, 24 * 60 * 60 * 1000);
    retentionTimer.unref();
    
    // Optional: Setup cloud sync if CouchDB URL is provided
    if (process.env.COUCHDB_URL) {
      await setupSync(process.env.COUCHDB_URL, {
        auth: process.env.COUCHDB_AUTH ? JSON.parse(process.env.COUCHDB_AUTH) : undefined
      });
      loggers.db.info('Cloud sync enabled');
    } else {
      loggers.db.info('Running in local-only mode (no cloud sync)');
    }
    
    dbInitialized = true;
    return true;
  } catch (err) {
    loggers.db.error({ err }, 'Failed to initialize PouchDB');
    throw err;
  }
};

// CORS configuration
// Build allowed origins from env (CORS_ORIGIN can be comma-separated) + dev fallbacks
const envOrigins = (process.env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
const developmentOrigins = process.env.NODE_ENV === 'production' ? [] : [
  'http://localhost:5005',
  'http://localhost:5173',
  'http://127.0.0.1:5005',
  'http://127.0.0.1:5173'
];
const allowedOrigins = [
  ...envOrigins,
  process.env.FRONTEND_URL,
  process.env.PUBLIC_URL,
  ...developmentOrigins
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Origin is not allowed by ShareT CORS policy'));
    }
  },
  credentials: true
}));

app.use(express.json({
  limit: '1mb',
  verify: (req, res, buffer) => {
    if (req.originalUrl.startsWith('/api/trello-webhooks/')) {
      req.rawBody = Buffer.from(buffer);
    }
  }
}));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Express 5 leaves unparsed request bodies undefined.
app.use((req, res, next) => {
  if (req.body === undefined) req.body = {};
  next();
});

// Emergency controls are explicit and fail closed without stopping read-only diagnostics.
app.use('/api', (req, res, next) => {
  const readOnly = req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS';
  if (process.env.MAINTENANCE_MODE === 'true' && !readOnly) {
    return res.status(503).json({
      success: false,
      code: 'MAINTENANCE_MODE',
      message: 'ShareT is temporarily read-only while maintenance is in progress'
    });
  }
  next();
});

// Cheap liveness endpoint for process/container supervision.
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime())
  });
});

// Readiness includes database and configuration state without exposing secrets.
app.get('/ready', async (req, res) => {
  const cacheStats = getCacheStats();
  let dbStats = {};
  
  try {
    dbStats = await getStats();
  } catch (err) {
    dbStats = { error: err.message };
  }
  
  const runtime = inspectRuntimeEnvironment();
  const maintenanceMode = process.env.MAINTENANCE_MODE === 'true';
  const ready = dbInitialized && runtime.ok && !maintenanceMode;
  const health = {
    status: ready ? 'ready' : 'not-ready',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: {
      type: 'PouchDB',
      status: dbInitialized ? 'connected' : 'initializing',
      cloudSync: process.env.COUCHDB_URL ? 'enabled' : 'disabled',
      schema: getMigrationState(),
      stats: dbStats
    },
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB'
    },
    cache: cacheStats,
    runtime: {
      capabilities: runtime.capabilities,
      warnings: runtime.warnings,
      errors: runtime.errors
    },
    maintenanceMode
  };
  
  res.status(ready ? 200 : 503).json(health);
});

// API Routes with rate limiting
app.use('/api/auth', authRoutes);
app.use('/api/trello', apiRateLimit, trelloRoutes);
app.use('/api/shared-links', apiRateLimit, sharedLinkRoutes);
app.use('/api/shared-access', (req, res, next) => {
  if (process.env.SHARET_DISABLE_PUBLIC_ACCESS === 'true') {
    return res.status(503).json({
      success: false,
      code: 'PUBLIC_ACCESS_DISABLED',
      message: 'Public ShareT links are temporarily disabled by the operator'
    });
  }
  next();
}, sharedAccessRoutes);
app.use('/api/admin', apiRateLimit, adminRoutes);
app.use('/api/notifications', apiRateLimit, notificationRoutes);
app.use('/api/trello-webhooks', trelloWebhookRoutes);
app.use('/api/connector', apiRateLimit, connectorRoutes);

// Maintenance page
const maintenancePath = path.join(__dirname, 'public', 'maintenance.html');
app.get('/maintenance', (req, res) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  res.sendFile(maintenancePath, (err) => {
    if (err) {
      res.status(200).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>ShareT - Maintenance</title>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding: 50px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; margin: 0; display: flex; align-items: center; justify-content: center; }
            .container { max-width: 500px; background: white; padding: 50px; border-radius: 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
            h1 { color: #333; margin-bottom: 20px; }
            p { color: #666; line-height: 1.8; }
            .spinner { border: 4px solid #f3f3f3; border-top: 4px solid #667eea; border-radius: 50%; width: 50px; height: 50px; animation: spin 1s linear infinite; margin: 30px auto; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🔧 Maintenance in Progress</h1>
            <div class="spinner"></div>
            <p>ShareT is currently being updated.<br>We'll be back shortly!</p>
            <p><small>This page will automatically refresh...</small></p>
          </div>
          <script>setTimeout(() => location.reload(), 5000);</script>
        </body>
        </html>
      `);
    }
  });
});

// Static serving with long-lived caching only for content-hashed assets.
let frontendPath = path.join(__dirname, 'frontend', 'dist');

// Fallback for local development
if (!fs.existsSync(frontendPath)) {
  frontendPath = path.join(__dirname, '..', 'dist');
}

// Read the SPA entry point once at startup so the catch-all route does not
// perform filesystem access for every page request.
const frontendIndexPath = path.join(frontendPath, 'index.html');
const frontendIndexHtml = fs.existsSync(frontendIndexPath)
  ? fs.readFileSync(frontendIndexPath, 'utf8')
  : null;

// Only setup sirv if the directory actually exists (e.g. after a build)
if (fs.existsSync(frontendPath)) {
  const sirvHandler = sirv(frontendPath, {
    maxAge: 0,
    immutable: false,
    gzip: true,            // Enable gzip
    brotli: true,          // Enable brotli (better compression)
    etag: true,            // Enable ETags
    dotfiles: 'ignore',    // Security: ignore dotfiles
    single: true,
    setHeaders: (res, pathname) => {
      if (pathname.startsWith('assets/') || pathname.startsWith('/assets/')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', 'no-cache');
      }
    }
  });

  // Use sirv for static files — skip API paths so they never get cached as HTML
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    sirvHandler(req, res, next);
  });
}

// SPA fallback for routes not handled by sirv (when in production mode)
app.get('/{*splat}', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return sendFastJSON(res, errorResponseSchema, {
      success: false,
      error: 'Not Found'
    }, 404);
  }
  
  // Return early if no frontend build exists
  if (frontendIndexHtml === null) {
    return res.status(200).send('ShareT Backend Running. Please start frontend dev server or run build.');
  }

  res.type('html').send(frontendIndexHtml);
});

// Error handling middleware with fast-json-stringify
app.use((err, req, res, _next) => {
  logger.error({ err, req: { method: req.method, url: req.url } }, 'Unhandled error');
  sendFastJSON(res, errorResponseSchema, {
    success: false,
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
    code: 'INTERNAL_ERROR'
  }, 500);
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  logger.info({ signal }, 'Received shutdown signal, closing gracefully...');
  
  clearCache();
  stopReplyNotificationMonitor();
  await closeAll(); // Close PouchDB databases
  
  logger.info('Shutdown complete');
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled rejection');
});

// Start server
const PORT = process.env.PORT || 5005;

let server;

const startServer = async () => {
  try {
    const runtime = validateRuntimeEnvironment();
    runtime.warnings.forEach(message => logger.warn({ capability: 'runtime' }, message));
    // Initialize PouchDB databases
    await initDB();
    startReplyNotificationMonitor();
    
    server = app.listen(PORT, '0.0.0.0', () => {
      reconcileActiveTrelloWebhooks().catch(error => {
        logger.error({ err: error }, 'Unable to reconcile Trello reply webhooks');
      });
      logger.info({
        port: PORT,
        env: process.env.NODE_ENV || 'development',
        local: `http://localhost:${PORT}`,
        health: `http://localhost:${PORT}/health`
      }, '🚀 ShareT Server started with PouchDB');
      
      console.log(`ShareT ready at http://localhost:${PORT}`);
      console.log(`Data directory: ${dataDir}`);
      console.log(`CouchDB sync: ${process.env.COUCHDB_URL ? 'enabled' : 'disabled'}`);

      // The one misconfiguration that silently disables the Trello bell for
      // every freelancer comment. Without a relay token the only remaining
      // candidate is the owner's own token, and Trello suppresses
      // self-notifications.
      if (!(process.env.TRELLO_BOT_TOKEN || '').trim()) {
        console.warn(
          '\n⚠️  TRELLO_BOT_TOKEN is not set.\n' +
          '    Freelancer comments will be posted with the owner\'s own Trello token,\n' +
          '    and Trello never notifies you about your own actions — so the owner\'s\n' +
          '    notification bell will NOT ring, whatever mention text is used.\n' +
          '    Fix: create a separate Trello account, add it to your boards, set\n' +
          '    TRELLO_BOT_TOKEN, and set SHARET_ALLOW_OWNER_COMMENT_FALLBACK=false.\n' +
          '    Check with GET /api/trello/notification-health.\n'
        );
      }
    });
  } catch (error) {
    logger.fatal({ err: error }, 'Failed to start server');
    process.exit(1);
  }
};

startServer();

// Export for testing
module.exports = { app, server };
