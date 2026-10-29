'use strict';

var nativeModule = require('node:module');
var nativePath = require('node:path');

// Tape passes only basedir and the active require.extensions. Its previous
// resolver has exports resolution disabled for these options. Resolve bare
// requests as explicit filesystem candidates to retain package main/private
// subpath preloads, then let the current Node loader handle files/extensions.
module.exports = function resolveModule(specifier, options) {
	var caller = nativeModule.createRequire(nativePath.join(options.basedir, '__tape_preload__.js'));
	if (nativeModule.isBuiltin(specifier) || nativePath.isAbsolute(specifier) || /^\.{1,2}(?:[\\/]|$)/.test(specifier)) {
		return caller.resolve(specifier);
	}
	var directories = caller.resolve.paths(specifier) || [];
	for (var i = 0; i < directories.length; i += 1) {
		try {
			return caller.resolve(nativePath.join(directories[i], specifier));
		} catch (error) {
			if (error.code !== 'MODULE_NOT_FOUND') { throw error; }
		}
	}
	var missing = new Error("Cannot find module '" + specifier + "' from '" + options.basedir + "'");
	missing.code = 'MODULE_NOT_FOUND';
	throw missing;
};
