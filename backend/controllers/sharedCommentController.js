/**
 * Shared Comment Controller
 *
 * Trello always attributes a comment to the member that owns the API token.
 * ShareT therefore supports two relay modes for people who cannot use Trello:
 *
 * 1. A per-share relay account, whose Trello profile carries the freelancer's
 *    name. This is the only way to get a native Trello author row.
 * 2. A shared ShareT relay account. The real author is rendered prominently in
 *    the comment body while the relay account remains the technical author.
 *
 * Both modes mention the connected owner so Trello creates a normal unread
 * notification. Posting with the owner's own token remains a last-resort
 * delivery fallback, but Trello intentionally suppresses self-notifications.
 */

const { SharedLink, TrelloConnection, AccessLog, ShareParticipant, CommentThread, Notification } = require('../db/pouchdb');
const { authorizeShareRequest } = require('../utils/shareAccess');
const { sendShareTUpdateNotification } = require('../utils/notificationService');
const { ensureTrelloWebhook } = require('../services/trelloWebhookService');

const TRELLO_API_BASE = 'https://api.trello.com/1';
const MAX_AUTHOR_NAME_LENGTH = 80;

function normalizeTrelloUsername(username) {
  return (username || '').trim().replace(/^@+/, '');
}

function resolveNotifyUsername(connection) {
  return normalizeTrelloUsername(
    process.env.SHARET_TRELLO_NOTIFY_USERNAME ||
    process.env.TRELLO_NOTIFY_USERNAME ||
    connection?.trelloUsername
  );
}

function normalizeAuthorName(authorName) {
  const value = (authorName || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_AUTHOR_NAME_LENGTH);

  return value || 'External ShareT user';
}

function formatComment({ text, authorName, notifyUsername, nativeAuthor }) {
  const author = normalizeAuthorName(authorName);
  const message = (text || '').trim();
  const parts = [];

  // A shared relay cannot impersonate a Trello member. Keep the real person
  // unmistakable while preserving the compact conversation style.
  parts.push(nativeAuthor ? message : `**${author}**: ${message}`);

  // A direct username mention is what creates the normal unread Trello
  // notification. It must be authored by a different Trello member.
  if (notifyUsername) parts.push(`@${normalizeTrelloUsername(notifyUsername)}`);

  return parts.join('\n\n');
}

async function trelloApiRequest({ path, key, token, method = 'GET', params = {}, operation = 'request' }) {
  const query = new URLSearchParams({ key, token, ...params });
  const response = await fetch(`${TRELLO_API_BASE}${path}?${query}`, { method });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detail = data.message || data.error || response.statusText || 'Unknown Trello error';
    throw new Error(`Trello ${operation} failed (${response.status}): ${detail}`);
  }

  return data;
}

async function postTrelloComment({ cardId, text, key, token }) {
  return trelloApiRequest({
    path: `/cards/${cardId}/actions/comments`,
    key,
    token,
    method: 'POST',
    params: { text },
    operation: 'comment'
  });
}

// Automatically ensure the bot/relay is a member of the board (works for private boards too)
const botBoardMemberships = new Set();

async function ensureRelayMemberOfBoard({ cardId, boardId, key, ownerToken, botToken }) {
  if (!ownerToken || !botToken || !key) return { added: false, reason: 'missing-credentials' };

  try {
    const botMember = await trelloApiRequest({
      path: '/members/me',
      key,
      token: botToken,
      params: { fields: 'id,username' },
      operation: 'bot member lookup'
    });

    if (!botMember?.id) return { added: false, reason: 'no-bot-id' };

    let targetBoardId = boardId;
    if (!targetBoardId && cardId) {
      const card = await trelloApiRequest({
        path: `/cards/${cardId}`,
        key,
        token: ownerToken,
        params: { fields: 'idBoard' },
        operation: 'card board lookup'
      });
      targetBoardId = card?.idBoard;
    }

    if (!targetBoardId) return { added: false, reason: 'no-board-id' };

    const cacheKey = `${targetBoardId}:${botMember.id}`;
    if (botBoardMemberships.has(cacheKey)) {
      return { added: true, cached: true, memberId: botMember.id, boardId: targetBoardId };
    }

    // Use the board owner's token to automatically add the bot as a member of the board
    await trelloApiRequest({
      path: `/boards/${targetBoardId}/members/${botMember.id}`,
      key,
      token: ownerToken,
      method: 'PUT',
      params: { type: 'normal' },
      operation: 'board member invite'
    });

    botBoardMemberships.add(cacheKey);
    return { added: true, cached: false, memberId: botMember.id, boardId: targetBoardId };
  } catch (error) {
    console.warn(`[Trello Auto-Invite] Board membership check for bot: ${error.message}`);
    return { added: false, error: error.message };
  }
}

async function ensureRelayAssignedToCard({ cardId, key, token }) {
  const member = await trelloApiRequest({
    path: '/members/me',
    key,
    token,
    params: { fields: 'id,username,fullName' },
    operation: 'relay identity lookup'
  });

  if (!member?.id) {
    throw new Error('Trello relay identity lookup returned no member ID');
  }

  const card = await trelloApiRequest({
    path: `/cards/${cardId}`,
    key,
    token,
    params: { fields: 'idMembers' },
    operation: 'card membership lookup'
  });
  const memberIds = Array.isArray(card?.idMembers) ? card.idMembers : [];
  const alreadyAssigned = memberIds.includes(member.id);

  if (!alreadyAssigned) {
    await trelloApiRequest({
      path: `/cards/${cardId}/idMembers`,
      key,
      token,
      method: 'POST',
      params: { value: member.id },
      operation: 'relay card assignment'
    });
  }

  return {
    member: {
      id: member.id,
      username: member.username,
      fullName: member.fullName
    },
    assigned: true,
    added: !alreadyAssigned,
    alreadyAssigned
  };
}

// Subscribing the owner to the card is a second, independent delivery path for
// the bell. The @mention above only reaches a configured username; watching the
// card notifies the owner about every comment by another member, even when
// SHARET_TRELLO_NOTIFY_USERNAME is unset or the mention text is stripped.
// Never throws — a failure here must not block the comment itself.
const subscribedCards = new Set();

async function ensureOwnerSubscribedToCard({ cardId, key, token, force = false }) {
  if (process.env.SHARET_AUTO_WATCH_CARDS === 'false') {
    return { subscribed: false, reason: 'auto-watch-disabled' };
  }
  if (!cardId || !token || !key) {
    return { subscribed: false, reason: 'trello-connection-missing' };
  }
  if (!force && subscribedCards.has(cardId)) {
    return { subscribed: true, cached: true };
  }

  try {
    await trelloApiRequest({
      path: `/cards/${cardId}/subscribed`,
      key,
      token,
      method: 'PUT',
      params: { value: 'true' },
      operation: 'owner card subscription'
    });
    subscribedCards.add(cardId);
    return { subscribed: true, cached: false };
  } catch (error) {
    console.error(`Unable to subscribe the owner to card ${cardId}:`, error.message);
    return { subscribed: false, reason: 'subscription-failed' };
  }
}

function buildTokenCandidates(share, connection) {
  const candidates = [];

  // A dedicated, admin-managed relay identity can have the freelancer's name
  // without requiring the freelancer to log in to or even access Trello.
  if (share?.guestTrelloToken) {
    candidates.push({
      label: 'freelancer-relay',
      token: share.guestTrelloToken,
      nativeAuthor: true,
      autoAssignToCard: true
    });
  }

  if (process.env.TRELLO_BOT_TOKEN) {
    candidates.push({
      label: 'shared-relay',
      token: process.env.TRELLO_BOT_TOKEN,
      nativeAuthor: false,
      autoAssignToCard: true
    });
  }

  const allowOwnerFallback = process.env.SHARET_ALLOW_OWNER_COMMENT_FALLBACK !== 'false';
  if (allowOwnerFallback && connection?.trelloToken) {
    candidates.push({
      label: 'owner-fallback',
      token: connection.trelloToken,
      nativeAuthor: false,
      autoAssignToCard: false
    });
  }

  // Do not retry the same token under multiple labels.
  return candidates.filter((candidate, index, all) =>
    all.findIndex(item => item.token === candidate.token) === index
  );
}

function getPostingMember(comment) {
  return comment?.memberCreator || comment?.data?.memberCreator || null;
}

function assessTrelloNotification({ comment, candidate, connection, notifyUsername, subscription }) {
  const postingMember = getPostingMember(comment);
  const postingUsername = normalizeTrelloUsername(postingMember?.username);
  const targetUsername = normalizeTrelloUsername(notifyUsername);
  const ownerUsername = normalizeTrelloUsername(connection?.trelloUsername);
  const sameMemberId = Boolean(
    postingMember?.id && connection?.trelloMemberId &&
    postingMember.id === connection.trelloMemberId &&
    (!targetUsername || targetUsername === ownerUsername)
  );
  const sameUsername = Boolean(
    postingUsername && targetUsername &&
    postingUsername.toLowerCase() === targetUsername.toLowerCase()
  );
  const ownerPostingForOwner = candidate.label === 'owner-fallback' &&
    (!targetUsername || targetUsername === ownerUsername);

  // A comment authored by the owner can never notify the owner, whatever the
  // mention text says or whether the card is watched.
  if (sameMemberId || sameUsername || ownerPostingForOwner) {
    return {
      bellExpected: false,
      warning: 'Trello does not notify a member about a comment posted by that same member. Configure a distinct relay token.'
    };
  }

  // Watching the card delivers the bell on its own, so a missing mention target
  // is no longer fatal — it just removes the second delivery path.
  if (!targetUsername) {
    return subscription?.subscribed
      ? {
          bellExpected: true,
          warning: 'No Trello notification username is configured. The bell relies on the owner watching this card.'
        }
      : {
          bellExpected: false,
          warning: 'No Trello notification username is configured and the owner is not watching this card.'
        };
  }

  return { bellExpected: true, warning: null };
}

function buildNotificationStatus() {
  const hasSharedRelay = Boolean(process.env.TRELLO_BOT_TOKEN);
  const hasExplicitTarget = Boolean(normalizeTrelloUsername(
    process.env.SHARET_TRELLO_NOTIFY_USERNAME || process.env.TRELLO_NOTIFY_USERNAME
  ));

  return {
    sharedRelayConfigured: hasSharedRelay,
    targetMode: hasExplicitTarget ? 'explicit-username' : 'connected-owner',
    ownerFallbackEnabled: process.env.SHARET_ALLOW_OWNER_COMMENT_FALLBACK !== 'false',
    autoAssignRelayToCards: true,
    autoWatchCards: process.env.SHARET_AUTO_WATCH_CARDS !== 'false',
    nativeAuthorMode: 'per-share-relay-token'
  };
}

// Public route: freelancers do not need a Trello login. ShareT posts through a
// relay token, directly mentions the owner, and can also send an email fallback.
exports.addComment = async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Comment text is required'
      });
    }

    const share = await SharedLink.findByShareId(req.params.shareId);

    if (!share || !share.permissions.canComment) {
      return res.status(403).json({
        success: false,
        message: 'Comments not allowed'
      });
    }

    if (!share.isActive || (share.expiresAt && new Date(share.expiresAt) < new Date())) {
      return res.status(403).json({ success: false, message: 'This share link is no longer active' });
    }

    const access = await authorizeShareRequest(req, share, { requireIdentity: true });
    if (!access.allowed) {
      return res.status(access.status).json({ success: false, code: access.code, message: access.message });
    }
    if (text.trim().length > 10000) {
      return res.status(400).json({ success: false, message: 'Comment is too long (maximum 10,000 characters)' });
    }
    const participant = access.participant;
    const authorName = participant.name;
    const authorEmail = participant.email;

    const connection = await TrelloConnection.findByUserId(share.userId);
    if (!connection) {
      return res.status(500).json({
        success: false,
        message: 'Owner not connected to Trello'
      });
    }

    const key = process.env.TRELLO_API_KEY;
    if (!key) {
      return res.status(500).json({
        success: false,
        message: 'Trello API key is not configured'
      });
    }

    const notifyUsername = resolveNotifyUsername(connection);
    const tokenCandidates = buildTokenCandidates(share, connection);

    if (tokenCandidates.length === 0) {
      return res.status(500).json({
        success: false,
        message: 'No Trello posting token is configured'
      });
    }

    // Must happen BEFORE the comment is posted — Trello only notifies watchers
    // about activity that occurs while they are subscribed.
    const subscription = await ensureOwnerSubscribedToCard({
      cardId: share.cardId,
      key,
      token: connection.trelloToken
    });

    let comment;
    let postedWith = null;
    const failures = [];

    for (const candidate of tokenCandidates) {
      try {
        if (candidate.autoAssignToCard && candidate.token !== connection.trelloToken) {
          // Auto-invite bot to the board using the owner's token if the board is private
          await ensureRelayMemberOfBoard({
            cardId: share.cardId,
            boardId: share.boardId,
            key,
            ownerToken: connection.trelloToken,
            botToken: candidate.token
          });
        }

        const relayAssignment = candidate.autoAssignToCard
          ? await ensureRelayAssignedToCard({
              cardId: share.cardId,
              key,
              token: candidate.token
            })
          : null;

        comment = await postTrelloComment({
          cardId: share.cardId,
          text: formatComment({
            text,
            authorName,
            notifyUsername,
            nativeAuthor: candidate.nativeAuthor
          }),
          key,
          token: candidate.token
        });
        postedWith = { ...candidate, relayAssignment };
        break;
      } catch (error) {
        failures.push(`${candidate.label}: ${error.message}`);
      }
    }

    if (!comment) {
      return res.status(502).json({
        success: false,
        message: 'Unable to post comment to Trello',
        errors: failures
      });
    }

    await AccessLog.create({
      shareId: req.params.shareId,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
      action: 'comment'
    });

    let replyTracking = { enabled: false, reason: 'comment-action-id-missing' };
    if (comment.id) {
      try {
        const thread = await CommentThread.create({
          shareId: req.params.shareId,
          cardId: share.cardId,
          trelloCommentId: comment.id,
          participant,
          commentText: text.trim(),
          commentDate: comment.date
        });
        replyTracking = { enabled: true, threadId: thread._id, email: participant.email };
      } catch (error) {
        console.error('Unable to create ShareT reply tracker:', error);
        replyTracking = { enabled: false, reason: 'tracking-storage-failed' };
      }
    }

    await ShareParticipant.touch(participant);

    let webhook = { enabled: false, reason: 'registration-not-attempted' };
    try {
      webhook = await ensureTrelloWebhook({ share, connection });
    } catch (error) {
      console.error('Unable to enable immediate Trello reply detection:', error);
      webhook = { enabled: false, reason: 'registration-failed' };
    }

    const trelloNotification = assessTrelloNotification({
      comment,
      candidate: postedWith,
      connection,
      notifyUsername,
      subscription
    });

    await sendShareTUpdateNotification({
      share,
      authorName: normalizeAuthorName(authorName),
      authorEmail,
      text: text.trim(),
      trelloCommentUrl: comment?.data?.card?.shortLink
        ? `https://trello.com/c/${comment.data.card.shortLink}`
        : undefined,
      postedBy: postedWith.label,
      bellExpected: trelloNotification.bellExpected
    });

    // Create in-app notification for the board owner / admin
    try {
      const cardName = share.cardTitle || share.cardName || share.boardName || 'Shared Card';
      await Notification.create({
        userId: share.userId,
        type: 'comment',
        title: `${normalizeAuthorName(authorName)} commented on ${cardName}`,
        message: text.trim(),
        authorName: normalizeAuthorName(authorName),
        authorEmail,
        shareId: req.params.shareId,
        cardId: share.cardId,
        cardTitle: cardName,
        linkUrl: `/shared/${req.params.shareId}/card`
      });
    } catch (notifErr) {
      console.error('Failed to create in-app notification:', notifErr.message);
    }

    const postingMember = getPostingMember(comment);
    res.json({
      success: true,
      data: comment,
      comment,
      notification: {
        trelloMention: notifyUsername ? `@${notifyUsername}` : null,
        postedBy: postedWith.label,
        identityMode: postedWith.nativeAuthor ? 'native-relay' : 'labelled-relay',
        trelloAuthor: postingMember ? {
          id: postingMember.id,
          username: postingMember.username,
          fullName: postingMember.fullName
        } : null,
        relayAssignment: postedWith.relayAssignment,
        ownerSubscription: subscription,
        bellExpected: trelloNotification.bellExpected,
        warning: trelloNotification.warning
      },
      replyTracking,
      webhook
    });
  } catch (error) {
    console.error('Shared comment error:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding comment'
    });
  }
};

exports.getNotificationStatus = buildNotificationStatus;

exports.__test = {
  assessTrelloNotification,
  buildNotificationStatus,
  buildTokenCandidates,
  ensureOwnerSubscribedToCard,
  ensureRelayAssignedToCard,
  formatComment,
  normalizeAuthorName,
  normalizeTrelloUsername,
  resolveNotifyUsername
};
