const express = require('express');
const router = express.Router();
const os = require('os');
const { protect, adminOnly } = require('../middleware/auth');
const { getStats, User, SharedLink, CommentThread, ReplyEvent, TrelloWebhook } = require('../db/pouchdb');
const { getStats: getCacheStats, clearAll: clearCache } = require('../utils/cache');
const { getNotificationStatus } = require('../controllers/sharedCommentController');
const { hasEmailTransport } = require('../utils/notificationService');
const { getWebhookReadiness } = require('../services/trelloWebhookService');
const { resolveAmbiguousReply } = require('../services/replyNotificationService');
const { presentSharedLink } = require('../utils/sharePresentation');

router.use(protect);
router.use(adminOnly);

router.get('/db/stats', async (req, res) => {
  try {
    res.json({ success: true, stats: await getStats() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/cache/clear', (req, res) => {
  clearCache();
  res.json({ success: true, message: 'All caches cleared' });
});

// GET /api/admin/status
router.get('/status', async (req, res) => {
  try {
    const [dbStats, cacheStats, pendingThreads, ambiguousEvents, webhooks] = await Promise.all([
      getStats(),
      Promise.resolve(getCacheStats()),
      CommentThread.findAllPending(),
      ReplyEvent.findAmbiguous(),
      TrelloWebhook.findAll()
    ]);
    const mem = process.memoryUsage();
    res.json({
      success: true,
      data: {
        status: 'healthy',
        uptime: process.uptime(),
        nodeVersion: process.version,
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString(),
        publicUrl: process.env.PUBLIC_URL || null,
        trelloNotifications: getNotificationStatus(),
        freelancerReplies: {
          emailConfigured: hasEmailTransport(),
          backgroundPollIntervalMs: Math.max(15000, Number(process.env.SHARET_REPLY_POLL_INTERVAL_MS || 60000)),
          webhook: {
            ...getWebhookReadiness(),
            activeCards: webhooks.filter(webhook => webhook.active).length,
            failedCards: webhooks.filter(webhook => !webhook.active).length
          },
          pendingThreads: pendingThreads.length,
          ambiguousReplies: ambiguousEvents.length
        },
        memory: {
          processUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
          processTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
          rssMB: Math.round(mem.rss / 1024 / 1024)
        },
        system: {
          platform: os.platform(),
          arch: os.arch(),
          cpus: os.cpus().length,
          totalMemGB: (os.totalmem() / 1024 / 1024 / 1024).toFixed(1),
          freeMemGB: (os.freemem() / 1024 / 1024 / 1024).toFixed(1),
          loadAvg: os.loadavg()
        },
        database: dbStats,
        cache: cacheStats
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/freelancer-replies
router.get('/freelancer-replies', async (req, res) => {
  try {
    const [pendingThreads, ambiguousEvents, webhooks] = await Promise.all([
      CommentThread.findAllPending(),
      ReplyEvent.findAmbiguous(),
      TrelloWebhook.findAll()
    ]);
    res.json({
      success: true,
      data: {
        pendingThreads: pendingThreads.length,
        webhook: {
          ...getWebhookReadiness(),
          activeCards: webhooks.filter(webhook => webhook.active).length,
          failedCards: webhooks.filter(webhook => !webhook.active).length
        },
        ambiguous: ambiguousEvents.map(event => ({
          id: event._id,
          trelloActionId: event.trelloActionId,
          cardId: event.cardId,
          cardName: event.cardName,
          ownerName: event.ownerName,
          replyText: event.replyText,
          replyDate: event.replyDate,
          candidates: event.candidates || [],
          createdAt: event.createdAt
        }))
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/freelancer-replies/:eventId/resolve
router.post('/freelancer-replies/:eventId/resolve', async (req, res) => {
  try {
    const participantEmail = String(req.body.participantEmail || '').trim().toLowerCase();
    if (!participantEmail) {
      return res.status(400).json({ success: false, message: 'participantEmail is required' });
    }
    const result = await resolveAmbiguousReply(req.params.eventId, participantEmail);
    res.json({ success: true, data: result });
  } catch (err) {
    const status = /not found/i.test(err.message) ? 404 : 500;
    res.status(status).json({ success: false, message: err.message });
  }
});

// GET /api/admin/shares
router.get('/shares', async (req, res) => {
  try {
    const links = await SharedLink.findAll();
    const active = links.filter(l => l.isActive);
    res.json({
      success: true,
      data: {
        total: links.length,
        active: active.length,
        inactive: links.length - active.length,
        links: links.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 50).map(presentSharedLink)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const users = await User.findAll();
    res.json({
      success: true,
      data: users.map(u => ({
        id: u._id,
        email: u.email,
        name: u.name,
        role: u.role,
        credits: u.credits,
        createdAt: u.createdAt,
        isActive: u.isActive
      }))
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/credits/add  { userId, amount }
router.post('/credits/add', async (req, res) => {
  try {
    const { userId, amount } = req.body;
    if (!userId || !amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'userId and positive amount required' });
    }
    const newBalance = await User.addCredits(userId, parseInt(amount));
    res.json({ success: true, data: { credits: newBalance } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
