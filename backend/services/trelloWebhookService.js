const crypto = require('crypto');
const { SharedLink, TrelloConnection, TrelloWebhook } = require('../db/pouchdb');

const TRELLO_API_BASE = 'https://api.trello.com/1';
const CALLBACK_PATH = '/api/trello-webhooks/callback';

function getWebhookCallbackUrl() {
  if (process.env.TRELLO_WEBHOOK_CALLBACK_URL) {
    return process.env.TRELLO_WEBHOOK_CALLBACK_URL.trim();
  }
  const publicUrl = (process.env.PUBLIC_URL || '').trim().replace(/\/$/, '');
  return publicUrl ? `${publicUrl}${CALLBACK_PATH}` : '';
}

function getWebhookReadiness() {
  const callbackUrl = getWebhookCallbackUrl();
  return {
    configured: Boolean(
      callbackUrl && process.env.TRELLO_API_KEY && process.env.TRELLO_API_SECRET
    ),
    callbackUrl: callbackUrl || null,
    signatureSecretConfigured: Boolean(process.env.TRELLO_API_SECRET)
  };
}

function verifyWebhookSignature(rawBody, signature, callbackUrl = getWebhookCallbackUrl()) {
  if (!rawBody || !signature || !callbackUrl || !process.env.TRELLO_API_SECRET) return false;
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody));
  const expected = crypto
    .createHmac('sha1', process.env.TRELLO_API_SECRET)
    .update(Buffer.concat([body, Buffer.from(callbackUrl)]))
    .digest('base64');
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(String(signature));
  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

async function ensureTrelloWebhook({ share, connection }) {
  const readiness = getWebhookReadiness();
  if (!readiness.configured) {
    return { enabled: false, reason: 'webhook-not-configured', ...readiness };
  }
  if (!share?.cardId || !share?.userId || !connection?.trelloToken) {
    return { enabled: false, reason: 'trello-connection-missing', ...readiness };
  }

  const existing = await TrelloWebhook.findByUserAndCard(share.userId, share.cardId);
  if (existing?.active && existing.webhookId && existing.callbackUrl === readiness.callbackUrl) {
    return { enabled: true, created: false, webhookId: existing.webhookId };
  }

  const response = await fetch(
    `${TRELLO_API_BASE}/tokens/${connection.trelloToken}/webhooks/?key=${process.env.TRELLO_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: `ShareT mobile replies for ${share.cardName || share.cardId}`.slice(0, 160),
        callbackURL: readiness.callbackUrl,
        idModel: share.cardId
      })
    }
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.id) {
    const message = payload.message || payload.error || `Trello webhook creation failed (${response.status})`;
    await TrelloWebhook.upsert({
      userId: share.userId,
      cardId: share.cardId,
      callbackUrl: readiness.callbackUrl,
      active: false,
      lastError: message
    });
    throw new Error(message);
  }

  const webhook = await TrelloWebhook.upsert({
    userId: share.userId,
    cardId: share.cardId,
    webhookId: payload.id,
    callbackUrl: readiness.callbackUrl,
    active: true
  });
  return { enabled: true, created: true, webhookId: webhook.webhookId };
}

async function ensureWebhookForShare(share) {
  if (share?.userId && !require('../billing/access').canUseResources(share.userId)) {
    return { enabled: false, reason: 'resource-balance-required' };
  }
  if (!share?.isActive || !share.permissions?.canComment) {
    return { enabled: false, reason: 'commenting-disabled' };
  }
  const connection = await TrelloConnection.findByUserId(share.userId);
  return ensureTrelloWebhook({ share, connection });
}

async function reconcileActiveTrelloWebhooks() {
  const readiness = getWebhookReadiness();
  if (!readiness.configured) return { skipped: true, reason: 'webhook-not-configured' };

  const shares = (await SharedLink.findAll()).filter(
    share => share.isActive && share.permissions?.canComment
  );
  const uniqueCards = new Map();
  for (const share of shares) uniqueCards.set(`${share.userId}:${share.cardId}`, share);

  const result = { checked: uniqueCards.size, enabled: 0, failed: 0 };
  for (const share of uniqueCards.values()) {
    try {
      const webhook = await ensureWebhookForShare(share);
      if (webhook.enabled) result.enabled += 1;
    } catch (error) {
      console.error(`Unable to reconcile Trello webhook for ${share.cardId}:`, error);
      result.failed += 1;
    }
  }
  return result;
}

module.exports = {
  CALLBACK_PATH,
  getWebhookCallbackUrl,
  getWebhookReadiness,
  verifyWebhookSignature,
  ensureTrelloWebhook,
  ensureWebhookForShare,
  reconcileActiveTrelloWebhooks
};
