const {
  CommentThread,
  ReplyEvent,
  SharedLink,
  TrelloConnection
} = require('../db/pouchdb');
const { sendFreelancerReplyNotification } = require('../utils/notificationService');
const { canUseResources } = require('../billing/access');

const TRELLO_API_BASE = 'https://api.trello.com/1';
let monitorTimer = null;
let monitorRunning = false;

function isOwnerComment(comment, connection) {
  if (comment?.type !== 'commentCard') return false;
  const creator = comment.memberCreator || comment.data?.memberCreator;
  if (!creator) return false;
  if (connection.trelloMemberId && creator.id) return connection.trelloMemberId === creator.id;
  return Boolean(
    connection.trelloUsername && creator.username &&
    connection.trelloUsername.toLowerCase() === creator.username.toLowerCase()
  );
}

function findOwnerReply(thread, comments, connection) {
  const commentTime = new Date(thread.commentDate).getTime();
  return [...(comments || [])]
    .filter(comment => {
      if (comment.id === thread.trelloCommentId || !isOwnerComment(comment, connection)) return false;
      const replyTime = new Date(comment.date).getTime();
      return Number.isFinite(replyTime) && replyTime > commentTime;
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0] || null;
}

function normalizeWords(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function groupThreadsByParticipant(threads) {
  const groups = new Map();
  for (const thread of threads) {
    const key = String(thread.participantEmail || '').trim().toLowerCase();
    if (!key) continue;
    const existing = groups.get(key) || {
      participantEmail: key,
      participantName: thread.participantName || key,
      threads: []
    };
    existing.threads.push(thread);
    groups.set(key, existing);
  }

  return [...groups.values()].map(group => ({
    ...group,
    threads: group.threads.sort((a, b) => new Date(a.commentDate) - new Date(b.commentDate))
  }));
}

/**
 * Selects a recipient without requiring special Trello syntax:
 * one waiting freelancer is automatic; otherwise a full or unique first-name
 * mention selects the recipient. Anything else is deliberately ambiguous.
 */
function matchReplyTarget(threads, ownerReplyText) {
  const groups = groupThreadsByParticipant(threads);
  if (groups.length === 0) return { status: 'none', reason: 'no-pending-participants', groups };
  if (groups.length === 1) {
    return { status: 'matched', reason: 'single-pending-participant', group: groups[0], groups };
  }

  const normalizedText = normalizeWords(ownerReplyText);
  const paddedText = ` ${normalizedText} `;
  const fullNameMatches = groups.filter(group => {
    const fullName = normalizeWords(group.participantName);
    return fullName && paddedText.includes(` ${fullName} `);
  });
  if (fullNameMatches.length === 1) {
    return { status: 'matched', reason: 'full-name-match', group: fullNameMatches[0], groups };
  }

  const textWords = normalizedText.split(' ').filter(Boolean);
  const greetingWords = new Set(['hi', 'hello', 'hey']);
  const salutationName = greetingWords.has(textWords[0]) ? textWords[1] : textWords[0];
  const firstNameMatches = groups.filter(group => {
    const firstName = normalizeWords(group.participantName).split(' ')[0];
    return firstName && firstName === salutationName;
  });
  if (firstNameMatches.length === 1) {
    return { status: 'matched', reason: 'unique-first-name-match', group: firstNameMatches[0], groups };
  }

  return { status: 'ambiguous', reason: 'multiple-pending-participants', groups };
}

function actionText(action) {
  return action?.text || action?.data?.text || '';
}

function actionCardId(action) {
  return action?.cardId || action?.data?.card?.id || null;
}

function candidateSummary(group) {
  const latest = group.threads[group.threads.length - 1];
  return {
    participantEmail: group.participantEmail,
    participantName: group.participantName,
    threadIds: group.threads.map(thread => thread._id),
    latestComment: latest?.commentText || '',
    latestCommentDate: latest?.commentDate || null,
    shareId: latest?.shareId || null,
    cardName: latest?.share?.cardName || null
  };
}

async function hydrateThreads(threads) {
  const shareCache = new Map();
  const connectionCache = new Map();
  const hydrated = [];

  for (const thread of threads) {
    let share = shareCache.get(thread.shareId);
    if (share === undefined) {
      share = await SharedLink.findByShareId(thread.shareId);
      shareCache.set(thread.shareId, share || null);
    }
    if (!share?.isActive) continue;

    let connection = connectionCache.get(share.userId);
    if (connection === undefined) {
      connection = await TrelloConnection.findByUserId(share.userId);
      connectionCache.set(share.userId, connection || null);
    }
    if (!connection) continue;
    hydrated.push({ ...thread, share, connection });
  }
  return hydrated;
}

async function deliverMatchedReply(event, group, reason) {
  const latest = group.threads[group.threads.length - 1];
  if (!latest?.share || !latest?.connection) throw new Error('Reply target is missing ShareT context');

  if (!event.deliverySentAt) {
    // Throw into the existing retry path; never discard an unpaid owner's reply.
    if (!canUseResources(latest.share.userId)) throw new Error('Reply delivery paused for resource balance');
    const delivery = await sendFreelancerReplyNotification({
      thread: latest,
      threads: group.threads,
      reply: event.action,
      share: latest.share,
      ownerName: event.action?.memberCreator?.fullName || latest.connection.trelloFullName
    });
    if (!delivery.sent) {
      throw new Error(delivery.reason || delivery.error || 'Freelancer reply email was not sent');
    }
    event = await ReplyEvent.markEmailSent(event._id, {
      participantEmail: group.participantEmail,
      participantName: group.participantName,
      matchReason: reason
    });
  }

  for (const thread of group.threads) {
    if (thread.status === 'awaiting_reply') await CommentThread.markNotified(thread, event.action);
  }

  return ReplyEvent.markCompleted(event._id, {
    participantEmail: group.participantEmail,
    participantName: group.participantName,
    matchReason: reason,
    threadIds: group.threads.map(thread => thread._id)
  });
}

async function processReplyEvent(eventId, { participantEmail } = {}) {
  const claimed = await ReplyEvent.claim(eventId, { allowAmbiguous: Boolean(participantEmail) });
  if (!claimed) return { skipped: true, reason: 'already-processed-or-claimed' };

  try {
    const replyDate = new Date(claimed.action?.date).getTime();
    const pending = await CommentThread.findPendingByCardId(claimed.cardId || actionCardId(claimed.action));
    const eligibleByDate = pending.filter(thread => {
      const time = new Date(thread.commentDate).getTime();
      return Number.isFinite(time) && Number.isFinite(replyDate) && time < replyDate;
    });
    const hydrated = await hydrateThreads(eligibleByDate);
    const ownerThreads = hydrated.filter(thread => isOwnerComment(claimed.action, thread.connection));

    if (ownerThreads.length === 0) {
      await ReplyEvent.markIgnored(claimed._id, 'not-a-connected-owner-reply');
      return { ignored: true, reason: 'not-a-connected-owner-reply' };
    }

    let match;
    if (participantEmail) {
      const group = groupThreadsByParticipant(ownerThreads).find(
        candidate => candidate.participantEmail === participantEmail.toLowerCase()
      );
      match = group
        ? { status: 'matched', reason: 'admin-resolved', group, groups: [group] }
        : { status: 'none', reason: 'resolved-participant-no-longer-pending', groups: [] };
    } else {
      match = matchReplyTarget(ownerThreads, actionText(claimed.action));
    }

    if (match.status === 'none') {
      await ReplyEvent.markIgnored(claimed._id, match.reason);
      return { ignored: true, reason: match.reason };
    }

    if (match.status === 'ambiguous') {
      const candidates = match.groups.map(candidateSummary);
      const context = {
        replyText: actionText(claimed.action),
        replyDate: claimed.action?.date || null,
        ownerName: claimed.action?.memberCreator?.fullName || 'Trello owner',
        cardName: candidates.find(candidate => candidate.cardName)?.cardName || null
      };
      await ReplyEvent.markAmbiguous(claimed._id, candidates, context);
      return { ambiguous: true, candidates };
    }

    await deliverMatchedReply(claimed, match.group, match.reason);
    return {
      sent: true,
      participantEmail: match.group.participantEmail,
      reason: match.reason,
      threadCount: match.group.threads.length
    };
  } catch (error) {
    await ReplyEvent.markFailed(claimed._id, error);
    throw error;
  }
}

async function resolveAmbiguousReply(eventId, participantEmail) {
  if (!participantEmail) throw new Error('A freelancer email is required');
  const event = await ReplyEvent.findById(eventId);
  if (!event || event.status !== 'ambiguous') throw new Error('Ambiguous reply event not found');
  return processReplyEvent(eventId, { participantEmail });
}

async function processReplyNotificationsForShare({ share, connection, comments }) {
  const threads = await CommentThread.findPendingByShareId(share.shareId);
  if (threads.length === 0) return { checked: 0, sent: 0, pending: 0, failed: 0, ambiguous: 0 };
  const earliest = Math.min(...threads.map(thread => new Date(thread.commentDate).getTime()));
  const ownerComments = [...(comments || [])]
    .filter(comment => isOwnerComment(comment, connection))
    .filter(comment => new Date(comment.date).getTime() > earliest)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const result = { checked: ownerComments.length, sent: 0, pending: threads.length, failed: 0, ambiguous: 0 };
  for (const comment of ownerComments) {
    try {
      const event = await ReplyEvent.createOrGet(comment, share.cardId, 'polling');
      const outcome = await processReplyEvent(event._id);
      if (outcome.sent) result.sent += 1;
      if (outcome.ambiguous) result.ambiguous += 1;
    } catch (error) {
      console.error('ShareT polled reply processing failed:', error);
      result.failed += 1;
    }
  }
  result.pending = (await CommentThread.findPendingByShareId(share.shareId)).length;
  return result;
}

async function fetchTrelloComments(share, connection) {
  const query = new URLSearchParams({
    key: process.env.TRELLO_API_KEY,
    token: connection.trelloToken,
    filter: 'commentCard',
    limit: '1000'
  });
  const response = await fetch(`${TRELLO_API_BASE}/cards/${share.cardId}/actions?${query}`);
  const data = await response.json().catch(() => []);
  if (!response.ok) throw new Error(`Trello reply scan failed (${response.status})`);
  return data;
}

async function processPendingReplyNotifications() {
  if (monitorRunning) return { skipped: true, reason: 'monitor-already-running' };
  monitorRunning = true;
  const totals = { events: 0, cards: 0, sent: 0, failed: 0, ambiguous: 0 };

  try {
    const actionable = await ReplyEvent.findActionable();
    for (const event of actionable) {
      try {
        const outcome = await processReplyEvent(event._id);
        totals.events += 1;
        if (outcome.sent) totals.sent += 1;
        if (outcome.ambiguous) totals.ambiguous += 1;
      } catch {
        totals.failed += 1;
      }
    }

    if (!process.env.TRELLO_API_KEY) return totals;
    const pending = await CommentThread.findAllPending();
    const cards = new Map();
    for (const thread of pending) {
      if (!cards.has(thread.cardId)) cards.set(thread.cardId, thread);
    }
    totals.cards = cards.size;

    for (const thread of cards.values()) {
      try {
        const share = await SharedLink.findByShareId(thread.shareId);
        if (!share?.isActive) continue;
        if (!canUseResources(share.userId)) continue;
        const connection = await TrelloConnection.findByUserId(share.userId);
        if (!connection?.trelloToken) continue;
        const comments = await fetchTrelloComments(share, connection);
        const result = await processReplyNotificationsForShare({ share, connection, comments });
        totals.sent += result.sent;
        totals.failed += result.failed;
        totals.ambiguous += result.ambiguous;
      } catch (error) {
        console.error(`ShareT reply scan failed for ${thread.cardId}:`, error);
        totals.failed += 1;
      }
    }
    return totals;
  } finally {
    monitorRunning = false;
  }
}

function startReplyNotificationMonitor() {
  if (monitorTimer) return monitorTimer;
  const requestedInterval = Number(process.env.SHARET_REPLY_POLL_INTERVAL_MS || 60 * 1000);
  const interval = Math.max(15 * 1000, requestedInterval);
  monitorTimer = setInterval(() => {
    processPendingReplyNotifications().catch(error => {
      console.error('ShareT background reply monitor failed:', error);
    });
  }, interval);
  monitorTimer.unref?.();
  return monitorTimer;
}

function stopReplyNotificationMonitor() {
  if (monitorTimer) clearInterval(monitorTimer);
  monitorTimer = null;
}

module.exports = {
  isOwnerComment,
  findOwnerReply,
  matchReplyTarget,
  processReplyEvent,
  resolveAmbiguousReply,
  processReplyNotificationsForShare,
  processPendingReplyNotifications,
  startReplyNotificationMonitor,
  stopReplyNotificationMonitor
};
