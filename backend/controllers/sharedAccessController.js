/**
 * Shared Access Controller
 * Handles public access to shared cards (no auth required)
 * Uses PouchDB for platform-agnostic data storage
 * 
 * Fixes applied:
 * - #7: Multiple checklists support
 * - #10: Member visibility
 * - #11: Real attachment upload via multer
 * - #12: Exact ISO timestamps for comments
 * - #13: Full action history loading
 * - #14: Card-level links
 * - #15: Chronological attachment order
 * - #16: Full comment formatting (markdown passthrough)
 * - #17: Identity handling — no more [Via ShareT] prefix
 */

const { SharedLink, TrelloConnection, AccessLog, EmailVerification, ShareParticipant } = require('../db/pouchdb');
const { hasEmailTransport, sendVerificationCodeEmail } = require('../utils/notificationService');
const { processReplyNotificationsForShare } = require('../services/replyNotificationService');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const FormData = require('form-data');
const validator = require('validator');
const {
  authorizeShareRequest,
  signPasswordGrant
} = require('../utils/shareAccess');
const { safeFileName } = require('../utils/attachmentSecurity');
const { getSafeTrelloAttachmentUrl } = require('../utils/trelloAttachmentUrl');
const { encodeTrelloPathSegment } = require('../utils/trelloPath');
const { fetchTrelloApi } = require('../utils/trelloRequest');

const TRELLO_API_BASE = 'https://api.trello.com/1';

// Configure multer for memory storage (files stay in RAM, sent directly to Trello)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

// Helper function to fetch JSON
async function fetchJSON(url, options = {}) {
  const response = await fetchTrelloApi(url, options);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
}

// Helper: validate share and get Trello connection
function publicLinkInfo(share) {
  return {
    trelloCardName: share.cardName,
    trelloBoardName: share.boardName,
    requiresEmail: Boolean(share.allowedEmails?.length),
    requiresParticipantIdentity: Boolean(share.permissions?.canComment),
    emailNotificationsAvailable: hasEmailTransport(),
    verificationAvailable: hasEmailTransport() || process.env.NODE_ENV === 'development',
    verificationMode: hasEmailTransport() ? 'email' : (process.env.NODE_ENV === 'development' ? 'development-code' : 'unavailable'),
    requiresPassword: Boolean(share.password),
    expiresAt: share.expiresAt || null,
    permissions: share.permissions
  };
}

async function getShareAndConnection(req, options = {}) {
  const share = await SharedLink.findByShareId(req.params.shareId);
  if (!share) return { error: 'Share not found', status: 404 };
  if (!share.isActive) return { error: 'This share link is no longer active', status: 403 };
  if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
    return { error: 'This share link has expired', status: 403 };
  }

  if (options.permission && !share.permissions?.[options.permission]) {
    return { error: 'This action is not allowed by the share policy', status: 403 };
  }

  const access = await authorizeShareRequest(req, share, options);
  if (!access.allowed) {
    return {
      error: access.message,
      code: access.code,
      status: access.status,
      share,
      linkInfo: publicLinkInfo(share)
    };
  }

  const cardId = encodeTrelloPathSegment(share.cardId);
  if (!cardId) return { error: 'Shared card identity is unavailable', status: 502 };

  const connection = await TrelloConnection.findByUserId(share.userId);
  if (!connection) return { error: 'Owner not connected to Trello', status: 500 };

  return { share, connection, cardId, participant: access.participant };
}

// Get shared card (public access)
exports.getSharedCard = async (req, res) => {
  try {
    const result = await getShareAndConnection(req, { permission: 'canView' });
    if (result.error) {
      if (result.code === 'PASSWORD_REQUIRED' || result.code === 'EMAIL_VERIFICATION_REQUIRED') {
        return res.json({
          success: true,
          accessGranted: false,
          accessRequired: result.code,
          linkInfo: result.linkInfo,
          data: null
        });
      }
      return res.status(result.status).json({ success: false, message: result.error });
    }

    const { share, connection, cardId } = result;

    // Update access count
    await SharedLink.incrementAccessCount(req.params.shareId);

    // Log access
    await AccessLog.create({
      shareId: req.params.shareId,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
      action: 'view'
    });

    // Fix #10: Include members with avatars; Fix #7: Include checklists; Fix #5: Include pluginData
    const url = `${TRELLO_API_BASE}/cards/${cardId}?key=${encodeURIComponent(process.env.TRELLO_API_KEY)}&token=${encodeURIComponent(connection.trelloToken)}&attachments=true&members=true&member_fields=fullName,username,avatarUrl&checklists=all&pluginData=true`;
    const card = await fetchJSON(url);

    res.json({
      success: true,
      accessGranted: true,
      linkInfo: publicLinkInfo(share),
      data: {
        card,
        permissions: share.permissions,
        cardName: share.cardName,
        boardName: share.boardName
      }
    });
  } catch (error) {
    console.error('Get shared card error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching shared card'
    });
  }
};

// Verify email for access
exports.verifyEmail = async (req, res) => {
  try {
    const { email } = req.body;
    const share = await SharedLink.findByShareId(req.params.shareId);

    if (!share) {
      return res.status(404).json({
        success: false,
        message: 'Share not found'
      });
    }

    if (!share.isActive || (share.expiresAt && new Date(share.expiresAt) <= new Date())) {
      return res.status(403).json({ success: false, message: 'This share is no longer available' });
    }

    // If no email restrictions, allow access
    if (!share.allowedEmails || share.allowedEmails.length === 0) {
      return res.json({
        success: true,
        verified: true
      });
    }

    // Check if email is allowed
    const isAllowed = share.allowedEmails.map(e => e.toLowerCase()).includes(email.toLowerCase());

    res.json({
      success: true,
      verified: isAllowed
    });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying email'
    });
  }
};

// Request email verification code
exports.requestVerification = async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const name = String(req.body.name || '').replace(/\s+/g, ' ').trim();
    const { shareId } = req.params;

    if (!email || !validator.isEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'A valid email address is required'
      });
    }

    if (!name || name.length > 80) {
      return res.status(400).json({ success: false, message: 'Your name is required' });
    }

    const share = await SharedLink.findByShareId(shareId);
    if (!share) {
      return res.status(404).json({
        success: false,
        message: 'Share not found'
      });
    }

    if (!share.isActive || (share.expiresAt && new Date(share.expiresAt) <= new Date())) {
      return res.status(403).json({ success: false, message: 'This share is no longer available' });
    }

    // Check if email is in allowed list
    if (share.allowedEmails && share.allowedEmails.length > 0) {
      if (!share.allowedEmails.map(e => e.toLowerCase()).includes(email.toLowerCase())) {
        return res.status(403).json({
          success: false,
          message: 'Email not authorized'
        });
      }
    }

    // Create verification
    const verification = await EmailVerification.create({ shareId, email });
    const delivery = await sendVerificationCodeEmail({
      to: email,
      code: verification.code,
      share
    });

    if (!delivery.sent && process.env.NODE_ENV !== 'development') {
      return res.status(503).json({
        success: false,
        message: delivery.skipped
          ? 'Email delivery is not configured for this ShareT server'
          : 'Unable to send the verification email right now'
      });
    }

    res.json({
      success: true,
      message: 'Verification code sent',
      delivery: delivery.sent ? 'email' : 'development-code',
      ...(process.env.NODE_ENV === 'development' && { code: verification.code })
    });
  } catch (error) {
    console.error('Request verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending verification'
    });
  }
};

// Confirm email verification
exports.confirmVerification = async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const name = String(req.body.name || '').replace(/\s+/g, ' ').trim();
    const { code } = req.body;
    const { shareId } = req.params;

    if (!email || !validator.isEmail(email) || !name || name.length > 80) {
      return res.status(400).json({ success: false, message: 'Name and a valid email are required' });
    }

    const share = await SharedLink.findByShareId(shareId);
    if (!share || !share.isActive || (share.expiresAt && new Date(share.expiresAt) <= new Date())) {
      return res.status(403).json({ success: false, message: 'This share is no longer available' });
    }
    if (share.allowedEmails?.length && !share.allowedEmails.map(value => value.toLowerCase()).includes(email)) {
      return res.status(403).json({ success: false, message: 'Email not authorized' });
    }

    const verification = await EmailVerification.verify(shareId, email, code);

    if (!verification) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired code'
      });
    }

    const verifiedParticipant = await ShareParticipant.createVerified({ shareId, email, name });

    res.json({
      success: true,
      message: 'Email verified',
      participantToken: verifiedParticipant.accessToken,
      participant: verifiedParticipant.participant
    });
  } catch (error) {
    console.error('Confirm verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying'
    });
  }
};

exports.getParticipantStatus = async (req, res) => {
  try {
    const { participantToken } = req.body;
    const participant = await ShareParticipant.findByAccessToken(req.params.shareId, participantToken);

    if (!participant) {
      return res.status(401).json({ success: false, message: 'Email verification is required' });
    }

    const publicParticipant = await ShareParticipant.touch(participant);
    res.json({ success: true, participant: publicParticipant });
  } catch (error) {
    console.error('Participant status error:', error);
    res.status(500).json({ success: false, message: 'Unable to verify participant session' });
  }
};

// Get attachments — Fix #15: Chronological order
exports.getAttachments = async (req, res) => {
  try {
    const result = await getShareAndConnection(req, { permission: 'canDownload' });
    if (result.error) {
      return res.status(result.status).json({ success: false, code: result.code, message: result.error });
    }
    const { connection, cardId } = result;

    const url = `${TRELLO_API_BASE}/cards/${cardId}/attachments?key=${encodeURIComponent(process.env.TRELLO_API_KEY)}&token=${encodeURIComponent(connection.trelloToken)}`;
    const attachments = await fetchJSON(url);

    // Fix #15: Sort chronologically (oldest first) to match Trello
    attachments.sort((a, b) => new Date(a.date) - new Date(b.date));

    res.json({
      success: true,
      data: attachments,
      attachments
    });
  } catch (error) {
    console.error('Get attachments error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching attachments'
    });
  }
};

// Download attachment — proxy file through backend so non-Trello users can download
exports.downloadAttachment = async (req, res) => {
  try {
    const attachmentId = encodeTrelloPathSegment(req.params.attachmentId);
    if (!attachmentId) {
      return res.status(400).json({ success: false, message: 'Invalid Trello attachment identifier' });
    }
    const result = await getShareAndConnection(req, { permission: 'canDownload' });
    if (result.error) {
      return res.status(result.status).json({ success: false, code: result.code, message: result.error });
    }
    const { connection, cardId } = result;

    // Get attachment metadata (includes direct file URL)
    const metaUrl = `${TRELLO_API_BASE}/cards/${cardId}/attachments/${attachmentId}?key=${encodeURIComponent(process.env.TRELLO_API_KEY)}&token=${encodeURIComponent(connection.trelloToken)}`;
    const attachment = await fetchJSON(metaUrl);

    const attachmentUrl = getSafeTrelloAttachmentUrl(attachment, cardId, attachmentId);
    if (!attachmentUrl) {
      return res.status(400).json({
        success: false,
        message: 'Only uploaded Trello attachments can be downloaded'
      });
    }

    // Log download
    await AccessLog.create({
      shareId: req.params.shareId,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
      action: 'download'
    });

    // Fetch the actual file from Trello using the owner's token as auth header
    const fileResponse = await fetch(attachmentUrl, {
      redirect: 'error',
      headers: {
        'Authorization': `OAuth oauth_consumer_key="${encodeURIComponent(process.env.TRELLO_API_KEY)}", oauth_token="${encodeURIComponent(connection.trelloToken)}"`
      }
    });

    if (!fileResponse.ok) {
      return res.status(502).json({
        success: false,
        message: 'Failed to fetch file from Trello'
      });
    }

    // Pass content-type and force browser download with filename
    const contentType = fileResponse.headers.get('content-type') || 'application/octet-stream';
    const fileName = safeFileName(attachment.name);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    const contentLength = fileResponse.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);

    // Stream file bytes directly to client — no temp storage
    const { Readable } = require('stream');
    Readable.fromWeb(fileResponse.body).pipe(res);
  } catch (error) {
    console.error('Download attachment error:', error);
    res.status(500).json({
      success: false,
      message: 'Error downloading attachment'
    });
  }
};

// Fix #11: Upload attachment — Real file upload via multer → Trello API
exports.uploadAttachment = [
  upload.single('file'),
  async (req, res) => {
    try {
      const result = await getShareAndConnection(req, { permission: 'canUpload' });
      if (result.error) {
        return res.status(result.status).json({ success: false, code: result.code, message: result.error });
      }
      const { connection, cardId } = result;

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file provided'
        });
      }

      // Build multipart form data for Trello API
      const formData = new FormData();
      const fileName = safeFileName(req.file.originalname);
      formData.append('file', req.file.buffer, {
        filename: fileName,
        contentType: req.file.mimetype
      });
      formData.append('name', fileName);

      const trelloUrl = `${TRELLO_API_BASE}/cards/${cardId}/attachments?key=${encodeURIComponent(process.env.TRELLO_API_KEY)}&token=${encodeURIComponent(connection.trelloToken)}`;

      const response = await fetchTrelloApi(trelloUrl, {
        method: 'POST',
        body: formData,
        headers: formData.getHeaders()
      });

      if (!response.ok) {
        throw new Error(`Trello upload failed: ${response.status}`);
      }

      const attachment = await response.json();

      // Log upload
      await AccessLog.create({
        shareId: req.params.shareId,
        ipAddress: req.ip || req.connection?.remoteAddress,
        userAgent: req.headers['user-agent'],
        action: 'upload'
      });

      res.json({
        success: true,
        data: attachment,
        attachment
      });
    } catch (error) {
      console.error('Upload attachment error:', error);
      res.status(500).json({
        success: false,
        message: 'Error uploading attachment'
      });
    }
  }
];

// Set due date
exports.setDueDate = async (req, res) => {
  try {
    const { due } = req.body;
    if (due !== null && due !== '' && Number.isNaN(new Date(due).getTime())) {
      return res.status(400).json({ success: false, message: 'Due date must be a valid date or null' });
    }
    const result = await getShareAndConnection(req, { permission: 'canSetDueDate' });
    if (result.error) {
      return res.status(result.status).json({ success: false, code: result.code, message: result.error });
    }
    const { connection, cardId } = result;

    const query = new URLSearchParams({
      key: process.env.TRELLO_API_KEY,
      token: connection.trelloToken,
      due: due ? new Date(due).toISOString() : 'null'
    });
    const url = `${TRELLO_API_BASE}/cards/${cardId}?${query}`;
    const response = await fetchTrelloApi(url, { method: 'PUT' });
    if (!response.ok) throw new Error(`Trello due-date update failed (${response.status})`);
    const card = await response.json();

    // Log action
    await AccessLog.create({
      shareId: req.params.shareId,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
      action: 'set_due_date'
    });

    res.json({
      success: true,
      data: card,
      card
    });
  } catch (error) {
    console.error('Set due date error:', error);
    res.status(500).json({
      success: false,
      message: 'Error setting due date'
    });
  }
};

// Fix #12 & #13: Get comments for shared card with ISO timestamps and full history
exports.getSharedComments = async (req, res) => {
  try {
    const result = await getShareAndConnection(req, { permission: 'canView' });
    if (result.error) {
      return res.status(result.status).json({ success: false, message: result.error });
    }

    const { share, connection, cardId } = result;
    const url = `${TRELLO_API_BASE}/cards/${cardId}/actions?key=${encodeURIComponent(process.env.TRELLO_API_KEY)}&token=${encodeURIComponent(connection.trelloToken)}&filter=commentCard&limit=1000`;
    const comments = await fetchJSON(url);
    processReplyNotificationsForShare({ share, connection, comments }).catch(error => {
      console.error('Open ShareT reply notification check failed:', error);
    });

    res.json({ success: true, data: comments, comments, replyNotifications: { scheduled: true } });
  } catch (error) {
    console.error('Get shared comments error:', error);
    res.status(500).json({ success: false, message: 'Error fetching comments' });
  }
};

// Fix #13: Get full action history for shared card
exports.getSharedActions = async (req, res) => {
  try {
    const result = await getShareAndConnection(req, { permission: 'canView' });
    if (result.error) {
      return res.status(result.status).json({ success: false, message: result.error });
    }

    const { connection, cardId } = result;
    const url = `${TRELLO_API_BASE}/cards/${cardId}/actions?key=${encodeURIComponent(process.env.TRELLO_API_KEY)}&token=${encodeURIComponent(connection.trelloToken)}&limit=1000`;
    const actions = await fetchJSON(url);

    res.json({ success: true, data: actions, actions });
  } catch (error) {
    console.error('Get shared actions error:', error);
    res.status(500).json({ success: false, message: 'Error fetching actions' });
  }
};

// Fix #7: Get checklists for shared card
exports.getSharedChecklists = async (req, res) => {
  try {
    const result = await getShareAndConnection(req, { permission: 'canView' });
    if (result.error) {
      return res.status(result.status).json({ success: false, message: result.error });
    }

    const { connection, cardId } = result;
    const url = `${TRELLO_API_BASE}/cards/${cardId}/checklists?key=${encodeURIComponent(process.env.TRELLO_API_KEY)}&token=${encodeURIComponent(connection.trelloToken)}&checkItem_fields=name,state,pos`;
    const checklists = await fetchJSON(url);

    res.json({ success: true, data: checklists, checklists });
  } catch (error) {
    console.error('Get shared checklists error:', error);
    res.status(500).json({ success: false, message: 'Error fetching checklists' });
  }
};

// Fix #10: Get members for shared card
exports.getSharedMembers = async (req, res) => {
  try {
    const result = await getShareAndConnection(req, { permission: 'canView' });
    if (result.error) {
      return res.status(result.status).json({ success: false, message: result.error });
    }

    const { connection, cardId } = result;
    const url = `${TRELLO_API_BASE}/cards/${cardId}/members?key=${encodeURIComponent(process.env.TRELLO_API_KEY)}&token=${encodeURIComponent(connection.trelloToken)}&fields=fullName,username,avatarUrl`;
    const members = await fetchJSON(url);

    res.json({ success: true, data: members, members });
  } catch (error) {
    console.error('Get shared members error:', error);
    res.status(500).json({ success: false, message: 'Error fetching members' });
  }
};

// Fix #14: Get card-level links for shared card
exports.getSharedLinks = async (req, res) => {
  try {
    const result = await getShareAndConnection(req, { permission: 'canView' });
    if (result.error) {
      return res.status(result.status).json({ success: false, message: result.error });
    }

    const { connection, cardId } = result;
    const url = `${TRELLO_API_BASE}/cards/${cardId}/attachments?key=${encodeURIComponent(process.env.TRELLO_API_KEY)}&token=${encodeURIComponent(connection.trelloToken)}`;
    const attachments = await fetchJSON(url);

    const links = attachments.filter(a => !a.isUpload).map(a => ({
      id: a.id,
      name: a.name,
      url: a.url,
      date: a.date
    }));

    res.json({ success: true, data: links, links });
  } catch (error) {
    console.error('Get shared links error:', error);
    res.status(500).json({ success: false, message: 'Error fetching links' });
  }
};

// Verify password for password-protected shared links
exports.verifyPassword = async (req, res) => {
  try {
    const { password } = req.body;
    const share = await SharedLink.findByShareId(req.params.shareId);

    if (!share || !share.isActive || (share.expiresAt && new Date(share.expiresAt) <= new Date())) {
      return res.status(404).json({ success: false, message: 'Share not found' });
    }

    if (!share.password) {
      return res.json({ success: true, message: 'No password required', passwordToken: null });
    }

    const match = await bcrypt.compare(password || '', share.password);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Incorrect secret' });
    }

    res.json({
      success: true,
      message: 'Access granted',
      passwordToken: signPasswordGrant(share.shareId)
    });
  } catch (error) {
    console.error('Verify password error:', error);
    res.status(500).json({ success: false, message: 'Error verifying secret' });
  }
};
