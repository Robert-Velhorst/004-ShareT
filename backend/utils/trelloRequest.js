'use strict';

// API JSON/mutation requests use one origin and never follow redirects.
// Attachment downloads have their own, narrower URL validator.
async function fetchTrelloApi(url, options = {}) {
  let target;
  try {
    if (typeof url !== 'string') throw new TypeError();
    target = new URL(url);
  } catch {
    throw new TypeError('Invalid Trello API request');
  }
  if (target.origin !== 'https://api.trello.com' || target.username || target.password
      || target.hash || !/^https:\/\/api\.trello\.com\/1\/[A-Za-z0-9]+(?:\/[A-Za-z0-9]+)*(?:\?[^#]*)?$/.test(url)) {
    throw new TypeError('Invalid Trello API request');
  }
  // Callers use canonical API URLs with literal resource names and alphanumeric
  // identifiers. Validate the original spelling above, before URL normalization
  // can hide dot segments, then encode every component at the request boundary.
  const path = target.pathname.slice(3).split('/').map(segment => encodeURIComponent(segment)).join('/');
  const query = [...target.searchParams].map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
  const requestUrl = `https://api.trello.com/1/${path}${query ? `?${query}` : ''}`;
  return fetch(requestUrl, { ...options, redirect: 'error' });
}

module.exports = { fetchTrelloApi };
