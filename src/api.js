/**
 * API Client
 * Handles all API communication with the backend
 */

// Use VITE_API_URL from env. Relative '/api' default works for any deployment
// (Cloudflare tunnel, custom domain, localhost) since frontend is served from same origin as backend.
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const prepaid = {
  wallet: () => apiRequest('/billing/wallet'),
  history: before => apiRequest(`/billing/history${before ? `?before=${encodeURIComponent(before)}` : ''}`),
  checkout: (amountCents, requestId) => apiRequest('/billing/checkout', { method: 'POST', body: JSON.stringify({ amountCents, requestId }) }),
  status: sessionId => apiRequest(`/billing/checkout/${encodeURIComponent(sessionId)}`),
};

/**
 * Helper function to make API requests
 */
async function apiRequest(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const config = {
    ...options,
    headers,
    credentials: 'include',
  };

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    const data = await response.json();

    if (!response.ok) {
      const error = new Error(data.message || data.error || `Request failed with status ${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

function shareAccessHeaders(access = {}) {
  return {
    ...(access.participantToken && { 'X-ShareT-Participant-Token': access.participantToken }),
    ...(access.passwordToken && { 'X-ShareT-Password-Token': access.passwordToken })
  };
}

async function apiDownload(endpoint, access = {}) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: shareAccessHeaders(access),
    credentials: 'include'
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || `Download failed with status ${response.status}`);
  }
  return {
    blob: await response.blob(),
    disposition: response.headers.get('content-disposition') || ''
  };
}

/**
 * Helper for multipart form data requests (file uploads)
 */
async function apiUpload(endpoint, formData, extraHeaders = {}) {
  const headers = { ...extraHeaders };

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers,
      body: formData,
      credentials: 'include',
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || data.error || `Upload failed with status ${response.status}`);
    }
    return data;
  } catch (error) {
    console.error('Upload Error:', error);
    throw error;
  }
}

// Authentication API
export const auth = {
  register: (userData) => apiRequest('/auth/register', {
    method: 'POST',
    body: JSON.stringify(userData),
  }),

  login: (credentials) => apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  }),

  logout: () => apiRequest('/auth/logout', {
    method: 'POST',
  }),

  getCurrentUser: () => apiRequest('/auth/session'),

  updateProfile: (profileData) => apiRequest('/auth/profile', {
    method: 'PUT',
    body: JSON.stringify(profileData),
  }),

  changePassword: (passwordData) => apiRequest('/auth/password', {
    method: 'PUT',
    body: JSON.stringify(passwordData),
  }),

  forgotPassword: (email) => apiRequest('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  }),

  resetPassword: (token, password) => apiRequest(`/auth/reset-password/${token}`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  }),

  getCredits: () => apiRequest('/auth/credits'),

  listApiTokens: () => apiRequest('/auth/api-tokens'),

  createApiToken: (tokenData) => apiRequest('/auth/api-tokens', {
    method: 'POST',
    body: JSON.stringify(tokenData),
  }),

  revokeApiToken: (tokenId) => apiRequest(`/auth/api-tokens/${encodeURIComponent(tokenId)}`, {
    method: 'DELETE',
  }),

  exportAccount: () => apiDownload('/auth/export'),

  deleteAccount: (password) => apiRequest('/auth/account', {
    method: 'DELETE',
    body: JSON.stringify({ password }),
  }),
};

// Trello API
export const trello = {
  connect: () => apiRequest('/trello/connect'),

  callback: (oauth_token, oauth_verifier) => apiRequest('/trello/callback', {
    method: 'POST',
    body: JSON.stringify({ oauth_token, oauth_verifier }),
  }),

  disconnect: () => apiRequest('/trello/disconnect', {
    method: 'POST',
  }),

  getBoards: () => apiRequest('/trello/boards'),

  getCards: (boardId) => apiRequest(`/trello/boards/${boardId}/cards`),

  getCard: (cardId) => apiRequest(`/trello/cards/${cardId}`),

  getCardChecklists: (cardId) => apiRequest(`/trello/cards/${cardId}/checklists`),
  
  getCardMembers: (cardId) => apiRequest(`/trello/cards/${cardId}/members`),
  
  getCardActions: (cardId) => apiRequest(`/trello/cards/${cardId}/actions`),
  
  getCardComments: (cardId) => apiRequest(`/trello/cards/${cardId}/comments`),
  
  getCardLinks: (cardId) => apiRequest(`/trello/cards/${cardId}/links`),
  
  // Can a freelancer comment actually raise the owner's Trello bell?
  getNotificationHealth: () => apiRequest('/trello/notification-health'),
};

// Admin API
export const admin = {
  getStatus: () => apiRequest('/admin/status'),
  getShares: () => apiRequest('/admin/shares'),
  getUsers: () => apiRequest('/admin/users'),
  getFreelancerReplies: () => apiRequest('/admin/freelancer-replies'),
  resolveFreelancerReply: (eventId, participantEmail) => apiRequest(`/admin/freelancer-replies/${encodeURIComponent(eventId)}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ participantEmail }),
  }),
  addCredits: (userId, amount) => apiRequest('/admin/credits/add', {
    method: 'POST',
    body: JSON.stringify({ userId, amount }),
  }),
};

// Shared Links API
export const sharedLinks = {
  create: (linkData) => apiRequest('/shared-links', {
    method: 'POST',
    body: JSON.stringify(linkData),
  }),

  getAll: ({ page = 1, limit = 25 } = {}) => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    return apiRequest(`/shared-links?${params.toString()}`);
  },

  getById: (linkId) => apiRequest(`/shared-links/${linkId}`),

  update: (linkId, updateData) => apiRequest(`/shared-links/${linkId}`, {
    method: 'PUT',
    body: JSON.stringify(updateData),
  }),

  delete: (linkId) => apiRequest(`/shared-links/${linkId}`, {
    method: 'DELETE',
  }),

};

// Shared Access API (for recipients / public access)
export const sharedAccess = {
  requestVerification: (shareId, identity) => apiRequest(`/shared-access/${shareId}/verify-email`, {
    method: 'POST',
    body: JSON.stringify(identity),
  }),

  confirmVerification: (shareId, verification) => apiRequest(`/shared-access/${shareId}/confirm-verification`, {
    method: 'POST',
    body: JSON.stringify(verification),
  }),

  getParticipantStatus: (shareId, participantToken) => apiRequest(`/shared-access/${shareId}/participant-status`, {
    method: 'POST',
    body: JSON.stringify({ participantToken }),
  }),

  getCard: (shareId, access) => apiRequest(`/shared-access/${shareId}`, {
    headers: shareAccessHeaders(access),
  }),

  verifyPassword: (shareId, password) => apiRequest(`/shared-access/${shareId}/verify-password`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  }),

  // Fix #12/#13: Get comments with ISO timestamps, full history
  getComments: (shareId, access) => apiRequest(`/shared-access/${shareId}/comments`, {
    headers: shareAccessHeaders(access),
  }),

  // Fix #13: Get full action history
  getActions: (shareId, access) => apiRequest(`/shared-access/${shareId}/actions`, {
    headers: shareAccessHeaders(access),
  }),

  // Fix #7: Get all checklists
  getChecklists: (shareId, access) => apiRequest(`/shared-access/${shareId}/checklists`, {
    headers: shareAccessHeaders(access),
  }),

  // Fix #10: Get card members
  getMembers: (shareId, access) => apiRequest(`/shared-access/${shareId}/members`, {
    headers: shareAccessHeaders(access),
  }),

  // Fix #14: Get card-level links
  getLinks: (shareId, access) => apiRequest(`/shared-access/${shareId}/links`, {
    headers: shareAccessHeaders(access),
  }),

  addComment: (shareId, commentData, access) => apiRequest(`/shared-access/${shareId}/comments`, {
    method: 'POST',
    headers: shareAccessHeaders(access),
    body: JSON.stringify(commentData),
  }),

  // Fix #11: Real file upload
  uploadAttachment: (shareId, file, access) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiUpload(`/shared-access/${shareId}/attachments`, formData, shareAccessHeaders(access));
  },

  getAttachments: (shareId, access) => apiRequest(`/shared-access/${shareId}/attachments`, {
    headers: shareAccessHeaders(access),
  }),

  downloadAttachment: (shareId, attachmentId, access) =>
    apiDownload(`/shared-access/${shareId}/attachments/${attachmentId}/download`, access),

  updateDueDate: (shareId, dueDate, access) => apiRequest(`/shared-access/${shareId}/due-date`, {
    method: 'PUT',
    headers: shareAccessHeaders(access),
    body: JSON.stringify({ due: dueDate }),
  }),
};

// In-App Notifications API
export const notifications = {
  getAll: (limit = 50) => apiRequest(`/notifications?limit=${limit}`),
  markAsRead: (id) => apiRequest(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllAsRead: () => apiRequest('/notifications/mark-all-read', { method: 'POST' }),
  delete: (id) => apiRequest(`/notifications/${id}`, { method: 'DELETE' }),
};

export default {
  auth,
  trello,
  sharedLinks,
  sharedAccess,
  notifications,
};

