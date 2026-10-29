'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const resolver = require(path.join(process.cwd(), 'qualification-tape-sdk/lib/resolve-module.js'));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tape-native-resolver-'));
const results = [];
function write(file, content) { const p = path.join(root, file); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content); return p; }
function resolve(name, base = root) { return resolver(name, { basedir: base, extensions: Object.keys(require.extensions) }); }
function check(name, fun) { try { fun(); results.push({name, pass:true}); } catch (e) { results.push({name, pass:false, error:e.stack}); } }
const js = write('local.js', 'module.exports = 123;');
const json = write('settings.json', '{"answer":42}');
write('directory/package.json', '{"main":"entry.cjs"}');
const directory = write('directory/entry.cjs', 'module.exports = 7;');
write('node_modules/fixture-package/package.json', '{"name":"fixture-package","main":"main.cjs"}');
const main = write('node_modules/fixture-package/main.cjs', 'module.exports = 4;');
write('node_modules/exported-package/package.json', '{"name":"exported-package","exports":{".":"./entry.cjs","./allowed":"./allowed.cjs"}}');
const exported = write('node_modules/exported-package/entry.cjs', 'module.exports = 8;');
const allowed = write('node_modules/exported-package/allowed.cjs', 'module.exports = 9;');
write('node_modules/exported-package/private.cjs', 'module.exports = 10;');
check('bare builtin', () => assert.equal(resolve('fs'), 'fs'));
check('node-prefixed builtin', () => assert.equal(resolve('node:fs'), 'node:fs'));
check('relative extension inference', () => assert.equal(resolve('./local'), js));
check('explicit extension', () => assert.equal(resolve('./local.js'), js));
check('absolute module path', () => assert.equal(resolve(js), js));
check('JSON module inference', () => assert.equal(resolve('./settings'), json));
check('directory package main', () => assert.equal(resolve('./directory'), directory));
check('package main from working directory', () => assert.equal(resolve('fixture-package'), main));
check('nested directory module lookup', () => { fs.mkdirSync(path.join(root,'nested')); assert.equal(resolve('fixture-package',path.join(root,'nested')), main); });
check('package root exports', () => assert.equal(resolve('exported-package'), exported));
check('package allowed subpath', () => assert.equal(resolve('exported-package/allowed'), allowed));
check('package blocked subpath uses active Node policy', () => assert.throws(() => resolve('exported-package/private.cjs'), {code:'ERR_PACKAGE_PATH_NOT_EXPORTED'}));
check('missing module retains MODULE_NOT_FOUND', () => assert.throws(() => resolve('not-present'), {code:'MODULE_NOT_FOUND'}));
check('custom registered require extension', () => {
  const previous = require.extensions['.fixture'];
  const fixture = write('custom.fixture','module.exports = 99;');
  require.extensions['.fixture'] = require.extensions['.js'];
  try { assert.equal(resolve('./custom'), fixture); assert.equal(require(resolve('./custom')),99); }
  finally { if(previous) require.extensions['.fixture']=previous; else delete require.extensions['.fixture']; }
});
check('preloads share the process module cache', () => {
  write('context.cjs', 'global.__tapeNativeResolverCounter = (global.__tapeNativeResolverCounter || 0) + 1; module.exports = global.__tapeNativeResolverCounter;');
  assert.equal(require(resolve('./context.cjs')),1);
  assert.equal(require(resolve('./context.cjs')),1);
  delete global.__tapeNativeResolverCounter;
});
check('independent caller working directories', () => {
  const other = write('second/local.js','module.exports = 55;');
  assert.equal(resolve('./local',path.dirname(other)),other);
  assert.equal(resolve('./local'),js);
});
check('symlink preload enters Node shared module context', () => {
  const link=path.join(root,'linked.js'); fs.symlinkSync(js,link);
  assert.equal(require(resolve('./linked')),require(js));
});
fs.writeFileSync(path.join(process.env.RUNNER_TEMP,'tape-native-resolver','owned-native-cases.json'),JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify({cases:results.length,passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length,skipped:0}));
process.exitCode=results.some(r=>!r.pass)?1:0;
