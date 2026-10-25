/**
 * Trello Controller
 * Handles Trello OAuth and API interactions
 * Uses PouchDB for platform-agnostic data storage
 */

const { TrelloConnection } = require('../db/pouchdb');
const { getNotificationStatus } = require('./sharedCommentController');
const { fetchTrelloApi } = require('../utils/trelloRequest');

const TRELLO_API_BASE = 'https://api.trello.com/1';

// Helper function to fetch JSON
async function fetchJSON(url, options = {}) {
  const response = await fetchTrelloApi(url, options);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
}

// Get Trello auth URL
exports.getAuthUrl = async (req, res) => {
  try {
    const configuredOrigins = [process.env.PUBLIC_URL, process.env.FRONTEND_URL, ...(process.env.CORS_ORIGIN || '').split(',')]
      .filter(Boolean)
      .map(value => String(value).trim().replace(/\/$/, ''));
    const fallbackOrigin = process.env.PUBLIC_URL || process.env.FRONTEND_URL || `http://localhost:${process.env.PORT || 5005}`;
    const requestedOrigin = String(req.query.origin || '').replace(/\/$/, '');
    const developmentOrigin = process.env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(requestedOrigin);
    const appOrigin = configuredOrigins.includes(requestedOrigin) || developmentOrigin ? requestedOrigin : fallbackOrigin;
    const callbackUrl = `${appOrigin.replace(/\/$/, '')}/api/trello/callback`;
    const authUrl = `https://trello.com/1/authorize?expiration=never&name=ShareT&scope=read,write,account&response_type=token&key=${encodeURIComponent(process.env.TRELLO_API_KEY)}&return_url=${encodeURIComponent(callbackUrl)}&callback_method=fragment`;
    
    res.json({
      success: true,
      url: authUrl,
      authUrl // Also include as authUrl for compatibility
    });
  } catch (error) {
    console.error('Get auth URL error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating auth URL'
    });
  }
};

// Handle OAuth callback - serves HTML that connects Trello and closes popup
exports.handleCallback = async (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head><title>Connecting Trello...</title></head>
<body><p>Connecting to Trello, please wait...</p>
<script src="/api/trello/callback.js" defer></script>
</body></html>`);
};

exports.handleCallbackScript = (req, res) => {
  res.type('application/javascript').send(`
(async function() {
  const showError = function(message) {
    const paragraph = document.createElement('p');
    paragraph.textContent = 'Error: ' + message + '. Close this window and try again.';
    document.body.replaceChildren(paragraph);
  };
  const params = new URLSearchParams(window.location.hash.substring(1));
  const trelloToken = params.get('token');
  if (!trelloToken) return showError('No token from Trello');
  try {
    const response = await fetch('/api/trello/connect', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trelloToken })
    });
    if (!response.ok) {
      const data = await response.json();
      return showError(data.message || 'Failed to connect');
    }
    const data = await response.json();
    if (window.opener) {
      window.opener.postMessage(JSON.stringify({ type: 'trello-connected', member: data.member }), window.location.origin);
    }
    window.close();
  } catch (error) {
    showError(error.message);
  }
})();`);
};

// Connect Trello with token
exports.connect = async (req, res) => {
  try {
    const token = req.body.token || req.body.trelloToken;
    const userId = req.user._id || req.user.id;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Trello token is required'
      });
    }

    // Verify token by getting member info
    const memberUrl = `${TRELLO_API_BASE}/members/me?key=${encodeURIComponent(process.env.TRELLO_API_KEY)}&token=${encodeURIComponent(token)}`;
    const member = await fetchJSON(memberUrl);

    // Save or update connection
    const existing = await TrelloConnection.findByUserId(userId);
    if (existing) {
      await TrelloConnection.updateByUserId(userId, {
        trelloToken: token,
        trelloMemberId: member.id,
        trelloUsername: member.username,
        trelloFullName: member.fullName
      });
    } else {
      await TrelloConnection.create({
        userId,
        trelloToken: token,
        trelloMemberId: member.id,
        trelloUsername: member.username,
        trelloFullName: member.fullName
      });
    }

    res.json({
      success: true,
      message: 'Trello connected successfully',
      member: {
        id: member.id,
        username: member.username,
        fullName: member.fullName
      }
    });
  } catch (error) {
    console.error('Connect Trello error:', error);
    res.status(500).json({
      success: false,
      message: 'Error connecting Trello'
    });
  }
};

// Get all connections for user
exports.getConnections = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const connection = await TrelloConnection.findByUserId(userId);
    const connections = connection ? [{
      id: connection._id,
      member: {
        id: connection.trelloMemberId,
        username: connection.trelloUsername,
        fullName: connection.trelloFullName
      },
      trelloUsername: connection.trelloUsername,
      trelloFullName: connection.trelloFullName,
      connectedAt: connection.connectedAt
    }] : [];
    res.json({ success: true, connections });
  } catch (error) {
    console.error('Get connections error:', error);
    res.status(500).json({ success: false, message: 'Error fetching connections' });
  }
};

// Disconnect Trello
exports.disconnect = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    await TrelloConnection.deleteByUserId(userId);

    res.json({
      success: true,
      message: 'Trello disconnected'
    });
  } catch (error) {
    console.error('Disconnect Trello error:', error);
    res.status(500).json({
      success: false,
      message: 'Error disconnecting Trello'
    });
  }
};

// Get connection status
exports.getStatus = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const connection = await TrelloConnection.findByUserId(userId);
    
    if (!connection) {
      return res.json({
        success: true,
        connected: false
      });
    }

    // Verify token is still valid
    try {
      const memberUrl = `${TRELLO_API_BASE}/members/me?key=${encodeURIComponent(process.env.TRELLO_API_KEY)}&token=${encodeURIComponent(connection.trelloToken)}`;
      const member = await fetchJSON(memberUrl);
      
      res.json({
        success: true,
        connected: true,
        member: {
          id: member.id,
          username: member.username,
          fullName: member.fullName
        }
      });
    } catch (err) {
      // Token invalid, remove connection
      await TrelloConnection.deleteByUserId(userId);
      res.json({
        success: true,
        connected: false
      });
    }
  } catch (error) {
    console.error('Get status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking status'
    });
  }
};

// Get all boards — Fix #1: Include workspace/organization name for disambiguation
exports.getBoards = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const connection = await TrelloConnection.findByUserId(userId);
    
    if (!connection) {
      return res.status(401).json({
        success: false,
        message: 'Trello not connected'
      });
    }

    const key = process.env.TRELLO_API_KEY;
    const token = connection.trelloToken;

    // Step 1: Fetch organizations sorted by Trello sidebar order.
    // /members/me/organizations returns in creation order, NOT sidebar order.
    // The member's idOrganizations array IS the canonical sidebar order.
    const [memberMeta, orgsRaw] = await Promise.all([
      fetchJSON(`${TRELLO_API_BASE}/members/me?key=${encodeURIComponent(key)}&token=${encodeURIComponent(token)}&fields=idOrganizations`).catch(() => ({})),
      fetchJSON(`${TRELLO_API_BASE}/members/me/organizations?key=${encodeURIComponent(key)}&token=${encodeURIComponent(token)}&fields=displayName,name,id`).catch(() => [])
    ]);
    const orgById = Object.fromEntries(orgsRaw.map(o => [o.id, o]));
    const sidebarOrder = memberMeta.idOrganizations || [];
    // Re-sort by sidebar position; any org not in idOrganizations falls to the end
    const organizations = [
      ...sidebarOrder.map(id => orgById[id]).filter(Boolean),
      ...orgsRaw.filter(o => !sidebarOrder.includes(o.id))
    ];

    // Step 2: Get all boards with organization info
    const boardListUrl = `${TRELLO_API_BASE}/members/me/boards?key=${encodeURIComponent(key)}&token=${encodeURIComponent(token)}&fields=name,desc,url,closed,idOrganization&organization=true&organization_fields=displayName,name`;
    const boards = await fetchJSON(boardListUrl);
    const openBoards = boards.filter(b => !b.closed);

    // Step 2: For each board, fetch lists+cards in parallel.
    // We first try the combined board endpoint (?cards=open). For boards where
    // the user is a guest member, Trello sometimes returns cards:[] even though
    // cards exist. In that case we fall back to a dedicated /boards/:id/cards
    // call, and finally to per-list card fetches as a last resort.
    const openBoardsWithData = await Promise.all(openBoards.map(async board => {
      try {
        // --- Primary: combined board fetch ---
        const boardDataUrl = `${TRELLO_API_BASE}/boards/${board.id}?key=${encodeURIComponent(key)}&token=${encodeURIComponent(token)}&lists=open&cards=open&card_fields=name,desc,url,due,dueComplete,idBoard,idList`;
        const boardData = await fetchJSON(boardDataUrl);

        let inlineCards = boardData.cards || [];
        const lists = boardData.lists || [];

        // --- Fallback A: dedicated cards endpoint ---
        // Triggered when the board has lists but no inline cards (common for
        // boards where the authenticated user is a guest/observer member).
        if (lists.length > 0 && inlineCards.length === 0) {
          try {
            const cardsUrl = `${TRELLO_API_BASE}/boards/${board.id}/cards?filter=open&key=${encodeURIComponent(key)}&token=${encodeURIComponent(token)}&fields=name,desc,url,due,dueComplete,idBoard,idList`;
            inlineCards = await fetchJSON(cardsUrl);
          } catch {
            // Fallback A failed — proceed to Fallback B
          }
        }

        // Build cardsByList map from whatever we have so far
        let cardsByList = {};
        inlineCards.forEach(card => {
          if (!cardsByList[card.idList]) cardsByList[card.idList] = [];
          cardsByList[card.idList].push(card);
        });

        // --- Fallback B: per-list card fetch ---
        // If we still have lists with no cards at all, try fetching each list
        // individually. This covers boards with strict visibility settings.
        const listsStillEmpty = lists.filter(l => !(cardsByList[l.id] || []).length);
        if (listsStillEmpty.length > 0 && inlineCards.length === 0) {
          await Promise.all(listsStillEmpty.map(async list => {
            try {
              const listCardsUrl = `${TRELLO_API_BASE}/lists/${list.id}/cards?key=${encodeURIComponent(key)}&token=${encodeURIComponent(token)}&fields=name,desc,url,due,dueComplete,idBoard,idList`;
              const listCards = await fetchJSON(listCardsUrl);
              if (listCards.length) {
                cardsByList[list.id] = listCards;
              }
            } catch {
              // Ignore per-list failure — leave that list empty
            }
          }));
        }

        const listsWithCards = lists.map(list => ({
          ...list,
          cards: cardsByList[list.id] || []
        }));

        return {
          ...board,
          lists: listsWithCards,
          organizationName: board.organization?.displayName || board.organization?.name || 'Personal',
          displayLabel: board.organization
            ? `${board.name} (${board.organization.displayName || board.organization.name})`
            : `${board.name} (Personal)`
        };
      } catch {
        return { ...board, lists: [], organizationName: 'Personal', displayLabel: board.name };
      }
    }));

    res.json({
      success: true,
      data: openBoardsWithData,
      boards: openBoardsWithData,
      organizations
    });
  } catch (error) {
    console.error('Get boards error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching boards'
    });
  }
};

// Get single board
exports.getBoard = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const connection = await TrelloConnection.findByUserId(userId);
    const { boardId } = req.params;

    if (!connection) {
      return res.status(401).json({
        success: false,
        message: 'Trello not connected'
      });
    }

    const url = `${TRELLO_API_BASE}/boards/${boardId}?key=${encodeURIComponent(process.env.TRELLO_API_KEY)}&token=${encodeURIComponent(connection.trelloToken)}&organization=true&organization_fields=displayName,name`;
    const board = await fetchJSON(url);

    res.json({
      success: true,
      data: board,
      board
    });
  } catch (error) {
    console.error('Get board error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching board'
    });
  }
};

// Get board cards
exports.getBoardCards = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const connection = await TrelloConnection.findByUserId(userId);
    const { boardId } = req.params;

    if (!connection) {
      return res.status(401).json({
        success: false,
        message: 'Trello not connected'
      });
    }

    const url = `${TRELLO_API_BASE}/boards/${boardId}/cards?key=${encodeURIComponent(process.env.TRELLO_API_KEY)}&token=${encodeURIComponent(connection.trelloToken)}&fields=name,desc,url,due,dueComplete,idBoard,idList`;
    const cards = await fetchJSON(url);

    res.json({
      success: true,
      data: cards,
      cards
    });
  } catch (error) {
    console.error('Get board cards error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching cards'
    });
  }
};

// Get board lists
exports.getBoardLists = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const connection = await TrelloConnection.findByUserId(userId);
    const { boardId } = req.params;

    if (!connection) {
      return res.status(401).json({
        success: false,
        message: 'Trello not connected'
      });
    }

    const url = `${TRELLO_API_BASE}/boards/${boardId}/lists?key=${encodeURIComponent(process.env.TRELLO_API_KEY)}&token=${encodeURIComponent(connection.trelloToken)}`;
    const lists = await fetchJSON(url);

    res.json({
      success: true,
      data: lists,
      lists
    });
  } catch (error) {
    console.error('Get board lists error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching lists'
    });
  }
};

// Get single card — Fix #10: Include members with avatar data
exports.getCard = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const connection = await TrelloConnection.findByUserId(userId);
    const { cardId } = req.params;

    if (!connection) {
      return res.status(401).json({
        success: false,
        message: 'Trello not connected'
      });
    }

    const url = `${TRELLO_API_BASE}/cards/${cardId}?key=${encodeURIComponent(process.env.TRELLO_API_KEY)}&token=${encodeURIComponent(connection.trelloToken)}&attachments=true&members=true&member_fields=fullName,username,avatarUrl&checklists=all&pluginData=true`;
    const card = await fetchJSON(url);

    res.json({
      success: true,
      data: card,
      card
    });
  } catch (error) {
    console.error('Get card error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching card'
    });
  }
};

// Get card attachments — Fix #15: Return in chronological order (oldest first)
exports.getCardAttachments = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const connection = await TrelloConnection.findByUserId(userId);
    const { cardId } = req.params;

    if (!connection) {
      return res.status(401).json({
        success: false,
        message: 'Trello not connected'
      });
    }

    const url = `${TRELLO_API_BASE}/cards/${cardId}/attachments?key=${encodeURIComponent(process.env.TRELLO_API_KEY)}&token=${encodeURIComponent(connection.trelloToken)}`;
    const attachments = await fetchJSON(url);

    // Fix #15: Sort chronologically (oldest first) matching Trello's native order
    attachments.sort((a, b) => new Date(a.date) - new Date(b.date));

    res.json({
      success: true,
      data: attachments,
      attachments
    });
  } catch (error) {
    console.error('Get card attachments error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching attachments'
    });
  }
};

// Get card comments — Fix #12: Return ISO timestamps, Fix #13: No limit
exports.getCardComments = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const connection = await TrelloConnection.findByUserId(userId);
    const { cardId } = req.params;

    if (!connection) {
      return res.status(401).json({
        success: false,
        message: 'Trello not connected'
      });
    }

    // Fix #13: Fetch all comments with limit=1000 to get full history
    const url = `${TRELLO_API_BASE}/cards/${cardId}/actions?key=${encodeURIComponent(process.env.TRELLO_API_KEY)}&token=${encodeURIComponent(connection.trelloToken)}&filter=commentCard&limit=1000`;
    const comments = await fetchJSON(url);

    res.json({
      success: true,
      data: comments,
      comments
    });
  } catch (error) {
    console.error('Get card comments error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching comments'
    });
  }
};

// Fix #13: Get full card action history (all types, not just comments)
exports.getCardActions = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const connection = await TrelloConnection.findByUserId(userId);
    const { cardId } = req.params;

    if (!connection) {
      return res.status(401).json({
        success: false,
        message: 'Trello not connected'
      });
    }

    const url = `${TRELLO_API_BASE}/cards/${cardId}/actions?key=${encodeURIComponent(process.env.TRELLO_API_KEY)}&token=${encodeURIComponent(connection.trelloToken)}&limit=1000`;
    const actions = await fetchJSON(url);

    res.json({
      success: true,
      data: actions,
      actions
    });
  } catch (error) {
    console.error('Get card actions error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching actions'
    });
  }
};

// Fix #7: Get all checklists for a card (multiple checklists support)
exports.getCardChecklists = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const connection = await TrelloConnection.findByUserId(userId);
    const { cardId } = req.params;

    if (!connection) {
      return res.status(401).json({
        success: false,
        message: 'Trello not connected'
      });
    }

    const url = `${TRELLO_API_BASE}/cards/${cardId}/checklists?key=${encodeURIComponent(process.env.TRELLO_API_KEY)}&token=${encodeURIComponent(connection.trelloToken)}&checkItem_fields=name,state,pos`;
    const checklists = await fetchJSON(url);

    res.json({
      success: true,
      data: checklists,
      checklists
    });
  } catch (error) {
    console.error('Get card checklists error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching checklists'
    });
  }
};

// Fix #10: Get card members with avatar info
exports.getCardMembers = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const connection = await TrelloConnection.findByUserId(userId);
    const { cardId } = req.params;

    if (!connection) {
      return res.status(401).json({
        success: false,
        message: 'Trello not connected'
      });
    }

    const url = `${TRELLO_API_BASE}/cards/${cardId}/members?key=${encodeURIComponent(process.env.TRELLO_API_KEY)}&token=${encodeURIComponent(connection.trelloToken)}&fields=fullName,username,avatarUrl`;
    const members = await fetchJSON(url);

    res.json({
      success: true,
      data: members,
      members
    });
  } catch (error) {
    console.error('Get card members error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching members'
    });
  }
};

// Fix #14: Get card-level links (URL attachments, not file uploads)
exports.getCardLinks = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const connection = await TrelloConnection.findByUserId(userId);
    const { cardId } = req.params;

    if (!connection) {
      return res.status(401).json({
        success: false,
        message: 'Trello not connected'
      });
    }

    const url = `${TRELLO_API_BASE}/cards/${cardId}/attachments?key=${encodeURIComponent(process.env.TRELLO_API_KEY)}&token=${encodeURIComponent(connection.trelloToken)}`;
    const attachments = await fetchJSON(url);

    // Filter for URL-type attachments (links, not file uploads)
    const links = attachments.filter(a => !a.isUpload).map(a => ({
      id: a.id,
      name: a.name,
      url: a.url,
      date: a.date
    }));

    res.json({
      success: true,
      data: links,
      links
    });
  } catch (error) {
    console.error('Get card links error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching card links'
    });
  }
};

// Add comment to card
exports.addComment = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const connection = await TrelloConnection.findByUserId(userId);
    const { cardId } = req.params;
    const { text } = req.body;

    if (!connection) {
      return res.status(401).json({
        success: false,
        message: 'Trello not connected'
      });
    }

    const url = `${TRELLO_API_BASE}/cards/${cardId}/actions/comments?key=${encodeURIComponent(process.env.TRELLO_API_KEY)}&token=${encodeURIComponent(connection.trelloToken)}&text=${encodeURIComponent(text)}`;
    const response = await fetchTrelloApi(url, { method: 'POST' });
    const comment = await response.json();

    res.json({
      success: true,
      data: comment,
      comment
    });
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding comment'
    });
  }
};

// Owner-facing diagnostic: can a freelancer comment actually raise this owner's
// Trello bell? The relay machinery reports per-comment warnings to the person
// who commented, which means the owner never learns their own bell is broken.
// GET /api/trello/notification-health
exports.getNotificationHealth = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const connection = await TrelloConnection.findByUserId(userId);

    if (!connection) {
      return res.status(401).json({ success: false, message: 'Trello not connected' });
    }

    const key = process.env.TRELLO_API_KEY;
    const relayToken = (process.env.TRELLO_BOT_TOKEN || '').trim();
    const notifyUsername = (process.env.SHARET_TRELLO_NOTIFY_USERNAME || process.env.TRELLO_NOTIFY_USERNAME || '')
      .trim().replace(/^@+/, '');

    const health = {
      ok: false,
      ...getNotificationStatus(),
      owner: {
        username: connection.trelloUsername,
        fullName: connection.trelloFullName
      },
      relayAccount: null,
      relayBoards: [],
      problems: []
    };

    if (!relayToken) {
      health.problems.push(
        'TRELLO_BOT_TOKEN is empty, so comments are posted with your own Trello token. ' +
        'Trello never notifies you about your own actions, so your bell cannot ring. ' +
        'Create a separate Trello account, add it to your boards, and set TRELLO_BOT_TOKEN.'
      );
      return res.json({ success: true, data: health, health });
    }

    try {
      const relay = await fetchJSON(
        `${TRELLO_API_BASE}/members/me?key=${encodeURIComponent(key)}&token=${encodeURIComponent(relayToken)}&fields=id,username,fullName&boards=all&board_fields=id,name`
      );
      health.relayAccount = { id: relay.id, username: relay.username, fullName: relay.fullName };
      health.relayBoards = (relay.boards || []).map(board => ({ id: board.id, name: board.name }));

      if (relay.id === connection.trelloMemberId) {
        health.problems.push(
          'TRELLO_BOT_TOKEN belongs to the same Trello account as you. It must be a separate account, ' +
          'otherwise comments still count as your own and no bell is raised.'
        );
      }
      if (!health.relayBoards.length) {
        health.problems.push(
          'The relay account is not a member of any board. Add it to every board you share cards from, ' +
          'or Trello will reject its comments.'
        );
      }
    } catch (error) {
      health.problems.push(`TRELLO_BOT_TOKEN is set but Trello rejected it: ${error.message}`);
      return res.json({ success: true, data: health, health });
    }

    if (health.ownerFallbackEnabled) {
      health.problems.push(
        'SHARET_ALLOW_OWNER_COMMENT_FALLBACK is not set to false. If the relay ever fails, ShareT ' +
        'silently posts as you again and the bell goes quiet with no visible error.'
      );
    }

    if (!notifyUsername && !health.autoWatchCards) {
      health.problems.push(
        'No notification username is configured and card auto-watching is disabled, so nothing ' +
        'directs the comment at you. Set SHARET_TRELLO_NOTIFY_USERNAME or enable SHARET_AUTO_WATCH_CARDS.'
      );
    }

    health.ok = health.problems.length === 0;
    res.json({ success: true, data: health, health });
  } catch (error) {
    console.error('Notification health error:', error);
    res.status(500).json({ success: false, message: 'Error checking notification health' });
  }
};

// Set due date
exports.setDueDate = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const connection = await TrelloConnection.findByUserId(userId);
    const { cardId } = req.params;
    const { due } = req.body;

    if (!connection) {
      return res.status(401).json({
        success: false,
        message: 'Trello not connected'
      });
    }

    const url = `${TRELLO_API_BASE}/cards/${cardId}?key=${encodeURIComponent(process.env.TRELLO_API_KEY)}&token=${encodeURIComponent(connection.trelloToken)}&due=${encodeURIComponent(due || 'null')}`;
    const response = await fetchTrelloApi(url, { method: 'PUT' });
    const card = await response.json();

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
