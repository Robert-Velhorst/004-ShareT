/**
 * ShareT Backend Server - Platform-Agnostic with PouchDB
 * 
 * Features:
 * - No database installation required (PouchDB stores data locally)
 * - Works on Windows, Mac, Linux
 * - Optional cloud sync via CouchDB
 * - All GitHub optimizations included
 * 
 * Optimizations Applied:
 * 1. PouchDB - Platform-agnostic database (16k+ ⭐)
 * 2. Sirv - 40% faster static file serving (1.2k+ ⭐)
 * 3. Pino Logger - 10x faster logging (14k+ ⭐)
 * 4. LRU Cache - In-memory caching (5k+ ⭐)
 * 5. fast-json-stringify - 2x faster JSON (3.5k+ ⭐)
 * 6. rate-limiter-flexible - Memory-efficient rate limiting (3.1k+ ⭐)
 */

const express = require('express');
const cors = require('cors');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const compression = require('compression');
const sirv = require('sirv');

// Import PouchDB database layer
const { initDatabases, setupSync, closeAll, getStats } = require('./db/pouchdb');

// Import optimized utilities (GitHub Gems)
const { logger, httpLogger, loggers } = require('./utils/logger');
const { getStats: getCacheStats, clearAll: clearCache } = require('./utils/cache');
const { apiRateLimit, authRateLimit, sharedLinkRateLimit } = require('./utils/rateLimiter');
const { errorResponseSchema, sendFastJSON } = require('./utils/jsonSerializer');

// Import routes
const authRoutes = require('./routes/authRoutes');
const trelloRoutes = require('./routes/trelloRoutes');
const sharedLinkRoutes = require('./routes/sharedLinkRoutes');
const sharedAccessRoutes = require('./routes/sharedAccessRoutes');
const resourceRoutes = require('./routes/resourceRoutes');
const billingRoutes = require('./routes/billingRoutes');
const adminRoutes = require('./routes/adminRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const trelloWebhookRoutes = require('./routes/trelloWebhookRoutes');
const { startReplyNotificationMonitor, stopReplyNotificationMonitor } = require('./services/replyNotificationService');
const { reconcileActiveTrelloWebhooks } = require('./services/trelloWebhookService');
const { getBilling, closeBilling } = require('./billing/runtime');
const { createWebhookHandler } = require('./billing/routes');

// Create Express app
const app = express();

// Trust proxy for Cloudflare Tunnel
app.set('trust proxy', 1);

// Pino HTTP Logger (10x faster than Morgan)
app.use(httpLogger);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
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
const allowedOrigins = [
  ...envOrigins,
  process.env.FRONTEND_URL,
  process.env.PUBLIC_URL,
  'http://localhost:5005',
  'http://localhost:5173',
  'http://127.0.0.1:5005',
  'http://127.0.0.1:5173'
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Origin is not allowed by ShareT CORS policy'));
    }
  },
  credentials: true
}));

// Stripe must receive the exact raw bytes, before any JSON parser or user auth.
app.post('/api/billing/webhook', express.raw({ type: 'application/json', limit: '1mb' }), (req, res) =>
  createWebhookHandler(getBilling())(req, res));

app.use(express.json({
  limit: '10mb',
  verify: (req, res, buffer) => {
    if (req.originalUrl.startsWith('/api/trello-webhooks/') || req.path === '/api/billing/usage') {
      req.rawBody = Buffer.from(buffer);
    }
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session configuration (using memory store for simplicity)
// For production with cloud sync, consider using a PouchDB-based session store
app.use(session({
  secret: process.env.SESSION_SECRET || 'sharet-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 14 * 24 * 60 * 60 * 1000,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  }
}));

// Health check endpoint
app.get('/health', async (req, res) => {
  const cacheStats = getCacheStats();
  let dbStats = {};
  
  try {
    dbStats = await getStats();
  } catch (err) {
    dbStats = { error: err.message };
  }
  
  const health = {
    status: dbInitialized ? 'healthy' : 'initializing',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: {
      type: 'PouchDB',
      status: dbInitialized ? 'connected' : 'initializing',
      cloudSync: process.env.COUCHDB_URL ? 'enabled' : 'disabled',
      stats: dbStats
    },
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB'
    },
    cache: cacheStats,
    features: [
      'No database installation required',
      'Local data storage',
      'Optional cloud sync',
      'Platform agnostic',
      'Offline capable'
    ],
    optimizations: [
      'PouchDB (16k+ ⭐)',
      'Sirv Static Server',
      'Pino Logger',
      'LRU Cache',
      'fast-json-stringify',
      'rate-limiter-flexible'
    ]
  };
  
  res.status(dbInitialized ? 200 : 503).json(health);
});

// API Routes with rate limiting
app.use('/api/auth', authRateLimit, authRoutes);
app.use('/api/trello', apiRateLimit, trelloRoutes);
app.use('/api/shared-links', apiRateLimit, sharedLinkRoutes);
app.use('/api/shared-access', sharedLinkRateLimit, sharedAccessRoutes);
app.use('/api/resources', apiRateLimit, resourceRoutes);
app.use('/api/billing', apiRateLimit, billingRoutes);
app.use('/api/admin', apiRateLimit, adminRoutes);
app.use('/api/notifications', apiRateLimit, notificationRoutes);
app.use('/api/trello-webhooks', trelloWebhookRoutes);

// Serve Trello Power-Up static files
const powerUpPath = path.join(__dirname, '..', 'power-up');
if (fs.existsSync(powerUpPath)) {
  app.use('/power-up', express.static(powerUpPath));
}

// Maintenance page
const maintenancePath = path.join(__dirname, 'public', 'maintenance.html');
app.get('/maintenance', (req, res) => {
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

// SIRV - 40% faster static file serving (GitHub: lukeed/sirv 1.2k+ ⭐)
let frontendPath = path.join(__dirname, 'frontend', 'dist');

// Fallback for local development
if (!fs.existsSync(frontendPath)) {
  frontendPath = path.join(__dirname, '..', 'dist');
}

// Only setup sirv if the directory actually exists (e.g. after a build)
if (fs.existsSync(frontendPath)) {
  const sirvHandler = sirv(frontendPath, {
    maxAge: 31536000,      // 1 year cache for assets
    immutable: true,       // Assets won't change
    gzip: true,            // Enable gzip
    brotli: true,          // Enable brotli (better compression)
    etag: true,            // Enable ETags
    dotfiles: 'ignore',    // Security: ignore dotfiles
    single: true           // SPA mode
  });

  // Use sirv for static files — skip API paths so they never get cached as HTML
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    sirvHandler(req, res, next);
  });
}

// SPA fallback for routes not handled by sirv (when in production mode)
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return sendFastJSON(res, errorResponseSchema, {
      success: false,
      error: 'Not Found'
    }, 404);
  }
  
  // Return early if no frontend build exists
  if (!fs.existsSync(frontendPath) || !fs.existsSync(path.join(frontendPath, 'index.html'))) {
    return res.status(200).send('ShareT Backend Running. Please start frontend dev server or run build.');
  }
  
  res.sendFile(path.join(frontendPath, 'index.html'));
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
  closeBilling();
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
    // Initialize PouchDB databases
    await initDB();
    getBilling(); // Fail startup on unsafe billing activation, before accepting traffic.
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
      
      console.log(`
╔════════════════════════════════════════════════════════════╗
║               ShareT Server Ready (PouchDB)                 ║
╠════════════════════════════════════════════════════════════╣
║  Local:    http://localhost:${PORT}                          ║
║  Health:   http://localhost:${PORT}/health                   ║
║  API:      http://localhost:${PORT}/api                      ║
╠════════════════════════════════════════════════════════════╣
║  Database: PouchDB (No installation required!)              ║
║  Data Dir: ${dataDir.substring(0, 40).padEnd(40)}   ║
║  Cloud:    ${(process.env.COUCHDB_URL ? 'Enabled' : 'Disabled (local only)').padEnd(40)}   ║
╠════════════════════════════════════════════════════════════╣
║  Features:                                                  ║
║  ✓ No database installation required                       ║
║  ✓ Works on Windows, Mac, Linux                            ║
║  ✓ Data stored locally in ./data                           ║
║  ✓ Optional cloud sync via CouchDB                         ║
║  ✓ Offline capable                                         ║
╠════════════════════════════════════════════════════════════╣
║  Optimizations Active:                                      ║
║  ✓ PouchDB (platform agnostic)                             ║
║  ✓ Sirv Static Server (40% faster)                         ║
║  ✓ Pino Logger (10x faster)                                ║
║  ✓ LRU Cache (reduced DB queries)                          ║
║  ✓ fast-json-stringify (2x faster)                         ║
║  ✓ rate-limiter-flexible (memory efficient)                ║
╚════════════════════════════════════════════════════════════╝
      `);

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
