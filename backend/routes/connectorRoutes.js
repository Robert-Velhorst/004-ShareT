const express = require('express');
const { connectorProtect, requireConnectorScope } = require('../middleware/auth');
const shareController = require('../controllers/shareController');
const trelloController = require('../controllers/trelloController');

const router = express.Router();

function openApiDocument(req) {
  const publicUrl = (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const security = [{ sharetConnector: [] }];
  return {
    openapi: '3.1.0',
    info: {
      title: 'ShareT HAI Connector API',
      version: '1.0.0',
      description: 'A scoped API for inspecting Trello targets and managing ShareT links from HAI or another trusted automation client.'
    },
    servers: [{ url: `${publicUrl}/api/connector` }],
    components: {
      securitySchemes: {
        sharetConnector: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'sharet_pat_*'
        }
      },
      schemas: {
        ShareInput: {
          type: 'object',
          required: ['cardId', 'permissions'],
          properties: {
            cardId: { type: 'string' },
            cardName: { type: 'string' },
            boardId: { type: 'string' },
            boardName: { type: 'string' },
            permissions: {
              type: 'object',
              required: ['canView'],
              properties: {
                canView: { type: 'boolean' },
                canComment: { type: 'boolean' },
                canUpload: { type: 'boolean' },
                canDownload: { type: 'boolean' },
                canSetDueDate: { type: 'boolean' }
              }
            },
            allowedEmails: { type: 'array', maxItems: 100, items: { type: 'string', format: 'email' } },
            expiresAt: { type: ['string', 'null'], format: 'date-time' },
            password: { type: ['string', 'null'], minLength: 8, maxLength: 128 }
          }
        }
      }
    },
    paths: {
      '/status': {
        get: { operationId: 'getShareTStatus', summary: 'Confirm connector identity and capabilities', security, responses: { 200: { description: 'Connector ready' } } }
      },
      '/trello/boards': {
        get: { operationId: 'listTrelloTargets', summary: 'List connected Trello boards, lists, and cards', security, responses: { 200: { description: 'Trello targets' } } }
      },
      '/shares': {
        get: {
          operationId: 'listShareLinks',
          summary: 'List stored share links',
          security,
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } }
          ],
          responses: { 200: { description: 'Paginated links' } }
        },
        post: {
          operationId: 'createShareLink',
          summary: 'Create a controlled Trello share link',
          security,
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ShareInput' } } } },
          responses: { 201: { description: 'Share link created' }, 402: { description: 'No credits available' } }
        }
      },
      '/shares/{shareId}': {
        put: {
          operationId: 'updateShareLink',
          summary: 'Update permissions, recipient rules, expiry, relay, or active state',
          security,
          parameters: [{ name: 'shareId', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
          responses: { 200: { description: 'Share updated' } }
        },
        delete: {
          operationId: 'deleteShareLink',
          summary: 'Permanently revoke and delete a share link',
          security,
          parameters: [{ name: 'shareId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Share deleted' } }
        }
      }
    }
  };
}

router.get('/openapi.json', (req, res) => res.json(openApiDocument(req)));
router.use(connectorProtect);

router.get('/status', requireConnectorScope('connector:read'), (req, res) => {
  res.json({
    success: true,
    account: { id: req.user._id, email: req.user.email, name: req.user.name },
    token: { name: req.connectorToken.name, scopes: req.connectorToken.scopes, expiresAt: req.connectorToken.expiresAt },
    capabilities: { trelloTargets: true, shareRead: true, shareWrite: req.connectorToken.scopes.includes('shares:write') }
  });
});
router.get('/trello/boards', requireConnectorScope('connector:read'), trelloController.getBoards);
router.get('/shares', requireConnectorScope('connector:read'), shareController.getShares);
router.post('/shares', requireConnectorScope('shares:write'), shareController.createShare);
router.put('/shares/:shareId', requireConnectorScope('shares:write'), shareController.updateShare);
router.delete('/shares/:shareId', requireConnectorScope('shares:write'), shareController.deleteShare);

module.exports = router;
