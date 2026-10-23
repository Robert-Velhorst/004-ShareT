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
      || target.hash || !target.pathname.startsWith('/1/')) {
    throw new TypeError('Invalid Trello API request');
  }
  return fetch(target.href, { ...options, redirect: 'error' });
}

module.exports = { fetchTrelloApi };
