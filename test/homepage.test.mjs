import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server.js';
import { createServer } from 'vite';

let server;
let Index;
let AuthProvider;
let HomePage;
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' });
  ({ default: Index } = await server.ssrLoadModule('/src/pages/Index.jsx'));
  ({ AuthProvider } = await server.ssrLoadModule('/src/contexts/AuthContext.jsx'));
  ({ default: HomePage } = await server.ssrLoadModule('/src/components/marketing/HomePage.jsx'));
});
after(async () => { await server?.close(); });
const render = () => renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, createElement(AuthProvider, null, createElement(Index))));

test('signed-in visitors return to the app instead of being asked to register again', () => {
  const html = renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, createElement(HomePage, { signedIn: true })));
  assert.equal((html.match(/href="\/app"/g) || []).length, 5);
  assert.doesNotMatch(html, /href="\/(signup|signin)"/);
});

test('visitors get one page heading and a keyboard shortcut to the main content', () => {
  const html = render();
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.match(html, /href="#main-content"/);
  assert.match(html, /<main[^>]*id="main-content"/);
});

test('all homepage fragment links have real targets and none are empty placeholders', () => {
  const html = render();
  assert.doesNotMatch(html, /href="#"/);
  const fragments = [...html.matchAll(/href="#([^"]+)"/g)].map(match => match[1]);
  assert.ok(fragments.length >= 4);
  for (const fragment of fragments) assert.ok(html.includes(`id="${fragment}"`), `Missing target: ${fragment}`);
});

test('visitor actions lead to real app registration and sign-in routes, not payment or demo endpoints', () => {
  const html = render();
  assert.match(html, /href="\/signup"/);
  assert.match(html, /href="\/signin"/);
  assert.doesNotMatch(html, /href="(?:\/checkout|\/billing|\/demo)"/);
});

test('the example clearly distinguishes local demonstration from a real Trello submission', () => {
  const html = render();
  assert.match(html, /Example conversation/);
  assert.match(html, /not sent to Trello/);
  assert.match(html, /aria-label="Example freelancer update"/);
  assert.match(html, /maxLength="500"/);
});

test('FAQ questions expose accessible expandable controls with the account answer initially open', () => {
  const html = render();
  assert.match(html, /aria-expanded="true"/);
  assert.equal((html.match(/aria-expanded="false"/g) || []).length, 2);
  assert.match(html, /No\. They open your ShareT link/);
});

test('each example message has one live announcement without repeating its mirrored preview', () => {
  const html = render();
  assert.equal((html.match(/aria-live="polite"/g) || []).length, 2);
  assert.doesNotMatch(html, /class="preview-update"[^>]*aria-live/);
  assert.doesNotMatch(html, /class="preview-thread"[^>]*aria-live/);
});
