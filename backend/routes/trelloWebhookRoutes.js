const express = require('express');
const { standardApiRateLimit } = require('../utils/rateLimiter');
const { ReplyEvent } = require('../db/pouchdb');
const {
  getWebhookCallbackUrl,
  verifyWebhookSignature
} = require('../services/trelloWebhookService');
const { processReplyEvent } = require('../services/replyNotificationService');

const router = express.Router();

// Trello validates callback URLs with a HEAD request before creating a webhook.
router.head('/callback', (req, res) => res.sendStatus(200));

router.post('/callback', standardApiRateLimit, async (req, res) => {
  const signature = req.get('x-trello-webhook');
  if (!verifyWebhookSignature(req.rawBody, signature, getWebhookCallbackUrl())) {
    return res.status(401).json({ success: false, message: 'Invalid Trello webhook signature' });
  }

  const action = req.body?.action;
  if (!action?.id || action.type !== 'commentCard') {
    return res.status(200).json({ success: true, accepted: false });
  }

  try {
    const event = await ReplyEvent.createOrGet(
      action,
      req.body?.model?.id || action.data?.card?.id,
      'webhook'
    );
    res.status(200).json({ success: true, accepted: true });

    setImmediate(() => {
      processReplyEvent(event._id).catch(error => {
        console.error('Trello webhook reply processing failed:', error);
      });
    });
  } catch (error) {
    console.error('Unable to persist Trello webhook event:', error);
    res.status(500).json({ success: false, message: 'Unable to persist webhook event' });
  }
});

module.exports = router;
