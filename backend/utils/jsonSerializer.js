/**
 * Schema-based JSON serialization for stable response shapes.
 */

const fastJson = require('fast-json-stringify');

// Schema for single share response
const shareResponseSchema = fastJson({
  title: 'ShareResponse',
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      properties: {
        _id: { type: 'string' },
        shareId: { type: 'string' },
        cardId: { type: 'string' },
        cardName: { type: 'string' },
        boardId: { type: 'string' },
        boardName: { type: 'string' },
        userId: { type: 'string' },
        permissions: {
          type: 'object',
          properties: {
            canView: { type: 'boolean' },
            canComment: { type: 'boolean' },
            canUpload: { type: 'boolean' },
            canDownload: { type: 'boolean' },
            canSetDueDate: { type: 'boolean' }
          }
        },
        allowedEmails: { type: 'array', items: { type: 'string' } },
        expiresAt: { type: 'string', format: 'date-time', nullable: true },
        accessCount: { type: 'integer' },
        lastAccessedAt: { type: 'string', format: 'date-time', nullable: true },
        isActive: { type: 'boolean' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' }
      }
    }
  }
});

// Schema for shares list response
const sharesListSchema = fastJson({
  title: 'SharesListResponse',
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          shareId: { type: 'string' },
          cardId: { type: 'string' },
          cardName: { type: 'string' },
          boardName: { type: 'string' },
          accessCount: { type: 'integer' },
          isActive: { type: 'boolean' },
          expiresAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' }
        }
      }
    },
    pagination: {
      type: 'object',
      properties: {
        total: { type: 'integer' },
        page: { type: 'integer' },
        limit: { type: 'integer' },
        pages: { type: 'integer' }
      }
    }
  }
});

// Schema for user response
const userResponseSchema = fastJson({
  title: 'UserResponse',
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      properties: {
        _id: { type: 'string' },
        email: { type: 'string' },
        name: { type: 'string' },
        trelloConnected: { type: 'boolean' },
        createdAt: { type: 'string', format: 'date-time' }
      }
    },
    token: { type: 'string' }
  }
});

// Schema for Trello boards list
const trelloBoardsSchema = fastJson({
  title: 'TrelloBoardsResponse',
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          desc: { type: 'string' },
          url: { type: 'string' },
          closed: { type: 'boolean' }
        }
      }
    }
  }
});

// Schema for Trello cards list
const trelloCardsSchema = fastJson({
  title: 'TrelloCardsResponse',
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          desc: { type: 'string' },
          url: { type: 'string' },
          due: { type: 'string', nullable: true },
          dueComplete: { type: 'boolean' },
          idBoard: { type: 'string' },
          idList: { type: 'string' }
        }
      }
    }
  }
});

// Schema for error response
const errorResponseSchema = fastJson({
  title: 'ErrorResponse',
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    error: { type: 'string' },
    message: { type: 'string' },
    code: { type: 'string' }
  }
});

/**
 * Helper function to send fast JSON response
 * @param {Response} res - Express response object
 * @param {Function} serializer - fast-json-stringify serializer
 * @param {object} data - Data to serialize
 * @param {number} statusCode - HTTP status code (default: 200)
 */
function sendFastJSON(res, serializer, data, statusCode = 200) {
  res.status(statusCode)
     .type('application/json')
     .send(serializer(data));
}

module.exports = {
  // Serializers
  shareResponseSchema,
  sharesListSchema,
  userResponseSchema,
  trelloBoardsSchema,
  trelloCardsSchema,
  errorResponseSchema,
  
  // Helper
  sendFastJSON,
  
  // For custom schemas
  fastJson
};
