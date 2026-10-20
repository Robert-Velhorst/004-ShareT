
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Clipboard } from 'lucide-react';
import { toast } from 'sonner';
import { ScrollArea } from '@/components/ui/scroll-area';

const codeSnippets = {
  node: `// Use the URL of your own ShareT installation
const axios = require('axios');

const SHARET_URL = 'https://sharet.example.com';
// Request a bearer token with X-ShareT-Token-Response: true on /api/auth/login.
// Browser sessions use HttpOnly cookies and do not expose this token.
const ACCESS_TOKEN = 'token_returned_by_opt_in_login';

async function createShareLink(card) {
  try {
    const response = await axios.post(\`${'${SHARET_URL}'}/api/shared-links\`, {
      cardId: card.id,
      cardName: card.name,
      boardId: card.boardId,
      boardName: card.boardName,
      permissions: {
        canView: true,
        canComment: true,
        canUpload: true,
        canDownload: true,
        canSetDueDate: false
      }
    }, {
      headers: {
        'Authorization': \`Bearer \${ACCESS_TOKEN}\`,
        'Content-Type': 'application/json'
      }
    });
    
    return response.data;
  } catch (error) {
    console.error('Error creating share link:', error);
    throw error;
  }
}`,
  python: `# Use the URL of your own ShareT installation
import requests

SHARET_URL = 'https://sharet.example.com'
# Request this explicitly from /api/auth/login with X-ShareT-Token-Response: true.
ACCESS_TOKEN = 'token_returned_by_opt_in_login'

def create_share_link(card):
    url = f'{SHARET_URL}/api/shared-links'
    headers = {
        'Authorization': f'Bearer {ACCESS_TOKEN}',
        'Content-Type': 'application/json'
    }
    payload = {
        'cardId': card['id'],
        'cardName': card['name'],
        'boardId': card['boardId'],
        'boardName': card['boardName'],
        'permissions': {
            'canView': True,
            'canComment': True,
            'canUpload': True,
            'canDownload': True,
            'canSetDueDate': False
        }
    }
    
    response = requests.post(url, json=payload, headers=headers)
    response.raise_for_status()
    return response.json()`,
  curl: `# Use the URL of your own ShareT installation
curl -X POST https://sharet.example.com/api/shared-links \\
  -H "Authorization: Bearer token_returned_by_opt_in_login" \\
  -H "Content-Type: application/json" \\
  -d '{
    "cardId": "trello_card_id",
    "cardName": "Card name",
    "boardId": "trello_board_id",
    "boardName": "Board name",
    "permissions": {
      "canView": true,
      "canComment": true,
      "canUpload": true,
      "canDownload": true,
      "canSetDueDate": false
    }
  }'`
};

const endpoints = [
  {
    method: 'POST',
    path: '/api/shared-links',
    description: 'Create a new share link',
    parameters: [
      { name: 'cardId', type: 'string', required: true, description: 'Trello card ID or short link' },
      { name: 'cardName', type: 'string', required: true, description: 'Display name of the Trello card' },
      { name: 'boardId', type: 'string', required: false, description: 'Trello board ID' },
      { name: 'boardName', type: 'string', required: false, description: 'Display name of the Trello board' },
      { name: 'permissions', type: 'object', required: false, description: 'View, comment, upload, download, and due-date permissions' },
      { name: 'expiresAt', type: 'ISO date', required: false, description: 'Expiry date and time' }
    ]
  },
  {
    method: 'GET',
    path: '/api/shared-links/{shareId}',
    description: 'Get information about a share link',
    parameters: [
      { name: 'shareId', type: 'string', required: true, description: 'ID of the share link' }
    ]
  },
  {
    method: 'DELETE',
    path: '/api/shared-links/{shareId}',
    description: 'Delete a share link',
    parameters: [
      { name: 'shareId', type: 'string', required: true, description: 'ID of the share link to delete' }
    ]
  },
  {
    method: 'GET',
    path: '/api/shared-links',
    description: 'List all your share links',
    parameters: [
      { name: 'page', type: 'integer', required: false, description: 'Page number for pagination' },
      { name: 'limit', type: 'integer', required: false, description: 'Number of results per page' }
    ]
  }
];

const ApiDocumentation = () => {
  const [language, setLanguage] = useState('node');
  const [activeTab, setActiveTab] = useState('overview');
  
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">ShareT API Documentation</h2>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
          <TabsTrigger value="examples">Code Examples</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Getting Started</CardTitle>
              <CardDescription>
                Learn how to use the ShareT API to programmatically create and manage share links.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                The ShareT API allows you to create, manage, and delete share links for your Trello content. 
                This API follows RESTful principles and uses standard HTTP methods for all operations.
              </p>
              <h3 className="text-lg font-semibold mt-4">Authentication</h3>
              <p>
                Browser sessions use HttpOnly cookies. For a non-browser client, send <code>X-ShareT-Token-Response: true</code> to <code>/api/auth/login</code>, then place the explicitly returned access token in the Authorization header. ShareT does not issue permanent API keys.
              </p>
              <pre className="bg-muted p-4 rounded-md text-sm">
                Authorization: Bearer your_access_token
              </pre>
              <h3 className="text-lg font-semibold mt-4">Rate Limits</h3>
              <p>
                Requests are rate limited by the ShareT server. The exact limit is controlled by the server configuration; a client that exceeds it receives a 429 response.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="endpoints" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>API Endpoints</CardTitle>
              <CardDescription>
                Detailed information about all available API endpoints.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <div className="space-y-6">
                  {endpoints.map((endpoint, index) => (
                    <div key={index} className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-1 rounded-md text-sm text-white font-semibold ${
                          endpoint.method === 'GET' ? 'bg-blue-600' : 
                          endpoint.method === 'POST' ? 'bg-green-600' : 
                          endpoint.method === 'PUT' ? 'bg-orange-600' : 
                          endpoint.method === 'DELETE' ? 'bg-red-600' : ''
                        }`}>
                          {endpoint.method}
                        </span>
                        <code className="text-sm">{endpoint.path}</code>
                      </div>
                      <p className="text-sm text-muted-foreground">{endpoint.description}</p>
                      
                      <div className="pt-2">
                        <h4 className="text-sm font-semibold mb-2">Parameters</h4>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Name</TableHead>
                              <TableHead>Type</TableHead>
                              <TableHead>Required</TableHead>
                              <TableHead>Description</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {endpoint.parameters.map((param, paramIndex) => (
                              <TableRow key={paramIndex}>
                                <TableCell className="font-medium">{param.name}</TableCell>
                                <TableCell>{param.type}</TableCell>
                                <TableCell>{param.required ? 'Yes' : 'No'}</TableCell>
                                <TableCell>{param.description}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="examples" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Code Examples</CardTitle>
              <CardDescription>
                Example code for creating a share link in various languages.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex space-x-2">
                  <TabsList>
                    <TabsTrigger 
                      value="node"
                      onClick={() => setLanguage('node')}
                      className={language === 'node' ? 'bg-primary text-primary-foreground' : ''}
                    >
                      Node.js
                    </TabsTrigger>
                    <TabsTrigger 
                      value="python" 
                      onClick={() => setLanguage('python')}
                      className={language === 'python' ? 'bg-primary text-primary-foreground' : ''}
                    >
                      Python
                    </TabsTrigger>
                    <TabsTrigger 
                      value="curl" 
                      onClick={() => setLanguage('curl')}
                      className={language === 'curl' ? 'bg-primary text-primary-foreground' : ''}
                    >
                      cURL
                    </TabsTrigger>
                  </TabsList>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => {
                      navigator.clipboard.writeText(codeSnippets[language]);
                      toast.success('Code copied to clipboard');
                    }}
                  >
                    <Clipboard className="h-4 w-4" />
                  </Button>
                </div>
                
                <div className="w-full overflow-hidden bg-muted p-4 rounded-md">
                  <pre className="text-sm">
                    <code>{codeSnippets[language]}</code>
                  </pre>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ApiDocumentation;
