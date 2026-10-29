'use strict';

var createRequire = require('node:module').createRequire;
var join = require('node:path').join;

// Resolve from the caller's working directory using the active Node loader.
// This intentionally targets the current stable Node runtime, including its
// package exports, custom require.extensions and builtin module semantics.
module.exports = function resolveModule(specifier, options) {
	return createRequire(join(options.basedir, '__tape_preload__.js')).resolve(specifier);
};
