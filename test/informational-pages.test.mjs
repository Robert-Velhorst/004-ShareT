import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../docs');
const html = existsSync(resolve(root, 'index.html')) ? readFileSync(resolve(root, 'index.html'), 'utf8') : '';

test('Pages serves a meaningful standalone document without an application runtime', () => {
  assert.match(html, /<!doctype html>/i);
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.match(html, /<main\b/);
  assert.doesNotMatch(html, /<(?:script|iframe|form|input|textarea)\b/i);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i, 'No inline event-handler runtime');
  const css = readFileSync(resolve(root, 'site.css'), 'utf8');
  assert.doesNotMatch(css, /(?:@import\b|url\(\s*["']?\s*(?:https?:|\/\/))/i, 'No external CSS resources');
});

test('navigation stays informational instead of leading into authentication or checkout', () => {
  const links = [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1]);
  assert.ok(links.length >= 6);
  for (const link of links) {
    assert.doesNotMatch(link, /(?:signup|signin|checkout|billing|stripe|\/app(?:\/|$))/i);
    if (link.startsWith('https:')) assert.equal(new URL(link).hostname, 'github.com');
    else assert.ok(!link.startsWith('/') && !link.startsWith('//'), `Must work under a repository subpath: ${link}`);
  }
});

test('section links resolve and bundled assets exist below the Pages directory', () => {
  assert.ok(html.length > 0);
  for (const [, target] of html.matchAll(/href="#([^"]+)"/g)) {
    assert.ok(html.includes(`id="${target}"`), `Missing section ${target}`);
  }
  for (const [, attribute, value] of html.matchAll(/\b(src|href)="([^"]+)"/g)) {
    if (value.startsWith('#') || value.startsWith('https:')) continue;
    const path = resolve(root, value);
    assert.ok(path.startsWith(root + '/') || path.startsWith(root + '\\'));
    assert.ok(existsSync(path), `Missing ${attribute} asset ${value}`);
  }
  assert.ok(existsSync(resolve(root, '.nojekyll')), 'Serve plain static files without Jekyll');
});

test('FAQ remains usable without JavaScript and includes a keyboard skip destination', () => {
  assert.ok((html.match(/<details\b/g) || []).length >= 3);
  assert.equal((html.match(/<details\b/g) || []).length, (html.match(/<summary\b/g) || []).length);
  assert.match(html, /href="#main-content"/);
  assert.match(html, /<main[^>]*id="main-content"[^>]*tabindex="-1"/);
});

test('accent links and white button labels meet normal-text contrast on their backgrounds', () => {
  const css = readFileSync(resolve(root, 'site.css'), 'utf8');
  const hex = css.match(/--teal:\s*#([\da-f]{6})/i)?.[1];
  assert.ok(hex, 'The accent must have an explicit inspectable colour');
  const channels = [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  assert.ok(1.05 / (luminance + 0.05) >= 4.5, 'Accent/white contrast must be at least 4.5:1');
});
