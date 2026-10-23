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
  // Rebuild from the literal authority and API prefix. Even validated callers
  // supply only the remaining path/query; no supplied URL authority reaches fetch.
  const requestUrl = `https://api.trello.com/1/${target.pathname.slice(3)}${target.search}`;
  return fetch(requestUrl, { ...options, redirect: 'error' });
}

module.exports = { fetchTrelloApi };
