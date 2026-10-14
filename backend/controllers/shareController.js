/**
 * Share Controller
 * Handles creation and management of shareable card links
 * Uses PouchDB for platform-agnostic data storage
 */

const { SharedLink, TrelloConnection, User } = require('../db/pouchdb');
const { ensureWebhookForShare } = require('../services/trelloWebhookService');
const { normalizePagination } = require('../utils/pagination');

const TRELLO_API_BASE = 'https://api.trello.com/1';

// Resolve a card identifier (full 24-char id OR the 8-char shortLink found in
// trello.com/c/... URLs) to its canonical Trello card. Both forms point to the
// same card, so without this the duplicate check can be bypassed by creating
// one link via the card picker and another via a pasted URL.
async function resolveTrelloCard(userId, cardIdOrShortLink) {
  try {
    const connection = await TrelloConnection.findByUserId(userId);
    if (!connection?.trelloToken) return null;
    const url = `${TRELLO_API_BASE}/cards/${cardIdOrShortLink}?key=${process.env.TRELLO_API_KEY}&token=${connection.trelloToken}&fields=id,shortLink,name,idBoard`;
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

// Get all shares for user
exports.getShares = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const shares = await SharedLink.findByUserId(userId);

    // Sort by createdAt descending
    shares.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Keep large histories fast while ensuring every link is reachable.
    const { page, limit, skip, pages } = normalizePagination(req.query, shares.length);
    const paginatedShares = shares.slice(skip, skip + limit);

    res.json({
      success: true,
      data: paginatedShares,
      pagination: {
        total: shares.length,
        page,
        limit,
        pages
      }
    });
  } catch (error) {
    console.error('Get shares error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching shares'
    });
  }
};

// Create new share
exports.createShare = async (req, res) => {
  try {
    let { cardId, cardName, boardId, boardName, permissions, allowedEmails, expiresAt, password, guestTrelloToken } = req.body;
    const userId = req.user._id || req.user.id;

    // Canonicalize the card identifier so the duplicate check can't be bypassed
    // by referencing the same card via its URL shortLink vs its full id.
    const trelloCard = await resolveTrelloCard(userId, cardId);
    if (trelloCard) {
      cardId = trelloCard.id;
      if (!cardName || /trello\.com/i.test(cardName)) cardName = trelloCard.name;
      if (!boardId) boardId = trelloCard.idBoard;
    }

    // Prevent duplicate links: if an active link to this card already exists,
    // return it instead of creating a new one (no credit is spent).
    // Check both the canonical id and the shortLink to also catch links
    // created before identifiers were canonicalized.
    const idsToCheck = trelloCard
      ? [...new Set([trelloCard.id, trelloCard.shortLink])]
      : [cardId];
    for (const id of idsToCheck) {
      const existing = await SharedLink.findActiveByUserAndCard(userId, id);
      if (existing) {
        const creditsRemaining = await User.getCredits(userId);
        return res.status(200).json({
          success: true,
          duplicate: true,
          message: 'An active share link already exists for this card.',
          data: existing,
          creditsRemaining
        });
      }
    }

    let creditsRemaining;
    let creditWasDeducted = false;
    try {
      // The route has already checked the prepaid wallet in resource-billing mode.
      // Do not additionally consume the old per-share allowance.
      creditsRemaining = req.resourceBilling ? null : await User.deductCredit(userId);
      creditWasDeducted = !req.resourceBilling && creditsRemaining !== null;
    } catch (error) {
      if (error.message === 'Insufficient credits') {
        return res.status(402).json({
          success: false,
          message: 'Insufficient credits'
        });
      }
      throw error;
    }

    let share;
    try {
      share = await SharedLink.create({
        userId,
        cardId,
        cardName,
        boardId,
        boardName,
        permissions: permissions || {
          canView: true,
          canComment: false,
          canUpload: false,
          canDownload: true,
          canSetDueDate: false
        },
        allowedEmails: allowedEmails || [],
        password: password || null,
        expiresAt: expiresAt || null,
        guestTrelloToken: guestTrelloToken || null
      });
    } catch (error) {
      if (creditWasDeducted) {
        try {
          await User.addCredits(userId, 1);
        } catch (refundError) {
          console.error('Share creation failed and its credit refund also failed:', refundError);
        }
      }
      throw error;
    }

    let webhook = { enabled: false, reason: 'commenting-disabled' };
    if (share.permissions?.canComment) {
      try {
        webhook = await ensureWebhookForShare(share);
      } catch (error) {
        console.error('Share created with polling fallback because webhook setup failed:', error);
        webhook = { enabled: false, reason: 'registration-failed', error: error.message };
      }
    }

    res.status(201).json({
      success: true,
      data: share,
      webhook,
      creditsRemaining
    });
  } catch (error) {
    console.error('Create share error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating share'
    });
  }
};

// Get single share
exports.getShare = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const share = await SharedLink.findById(req.params.shareId);

    if (!share || share.userId !== userId) {
      return res.status(404).json({
        success: false,
        message: 'Share not found'
      });
    }

    res.json({
      success: true,
      data: share
    });
  } catch (error) {
    console.error('Get share error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching share'
    });
  }
};

// Update share
exports.updateShare = async (req, res) => {
  try {
    const { permissions, allowedEmails, expiresAt, isActive, guestTrelloToken } = req.body;
    const userId = req.user._id || req.user.id;

    const share = await SharedLink.findById(req.params.shareId);

    if (!share || share.userId !== userId) {
      return res.status(404).json({
        success: false,
        message: 'Share not found'
      });
    }

    const updates = {};
    if (permissions !== undefined) updates.permissions = permissions;
    if (allowedEmails !== undefined) updates.allowedEmails = allowedEmails;
    if (expiresAt !== undefined) updates.expiresAt = expiresAt;
    if (isActive !== undefined) updates.isActive = isActive;
    if (guestTrelloToken !== undefined) updates.guestTrelloToken = guestTrelloToken;

    const updatedShare = await SharedLink.updateById(req.params.shareId, updates);

    let webhook = null;
    if (updatedShare.isActive && updatedShare.permissions?.canComment) {
      try {
        webhook = await ensureWebhookForShare(updatedShare);
      } catch (error) {
        console.error('Updated share is using polling fallback because webhook setup failed:', error);
        webhook = { enabled: false, reason: 'registration-failed', error: error.message };
      }
    }

    res.json({
      success: true,
      data: updatedShare,
      webhook
    });
  } catch (error) {
    console.error('Update share error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating share'
    });
  }
};

// Delete share
exports.deleteShare = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const share = await SharedLink.findById(req.params.shareId);

    if (!share || share.userId !== userId) {
      return res.status(404).json({
        success: false,
        message: 'Share not found'
      });
    }

    await SharedLink.deleteById(req.params.shareId);

    res.json({
      success: true,
      message: 'Share deleted'
    });
  } catch (error) {
    console.error('Delete share error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting share'
    });
  }
};

// Toggle active status
exports.toggleActive = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const share = await SharedLink.findById(req.params.shareId);

    if (!share || share.userId !== userId) {
      return res.status(404).json({
        success: false,
        message: 'Share not found'
      });
    }

    const updatedShare = await SharedLink.updateById(req.params.shareId, {
      isActive: !share.isActive
    });

    res.json({
      success: true,
      data: updatedShare
    });
  } catch (error) {
    console.error('Toggle active error:', error);
    res.status(500).json({
      success: false,
      message: 'Error toggling share status'
    });
  }
};

// Get share statistics
exports.getShareStats = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const share = await SharedLink.findById(req.params.shareId);

    if (!share || share.userId !== userId) {
      return res.status(404).json({
        success: false,
        message: 'Share not found'
      });
    }

    res.json({
      success: true,
      data: {
        accessCount: share.accessCount || 0,
        lastAccessedAt: share.lastAccessedAt,
        createdAt: share.createdAt
      }
    });
  } catch (error) {
    console.error('Get share stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching stats'
    });
  }
};
