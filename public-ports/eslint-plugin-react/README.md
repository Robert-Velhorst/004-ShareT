# React rule compatibility candidate for ESLint 10

The candidate derives from publisher eslint-plugin-react 7.37.5 and source commit 2c98b83c451a4297edf1787d9a616e50687e27e8. The publisher archive's SHA-512 integrity and source archive's SHA-256 bind the inputs. All published JavaScript library files match that source before the patch. Existing license files and all 148 original case/helper files are preserved.

Fifteen library files now use public filename, whitespace, component-comment and dependency APIs, with compatible older-method fallbacks. The proposed package peer declaration includes ESLint 10, and all eighteen runtime dependencies are selected from inspected current stable publisher metadata. The package uses the stable base version plus build metadata, 7.37.5+sharet.eslint10.1. Its archives and complete file hashes are in provenance.json; eslint10.patch exposes the production changes for review.

The disposable SDK retains the publisher's complete unit-test command and all case expectations. Its unit-test dependency set includes the current stable tools needed by that entry, including Node 26.12.1, npm 12.2.1, ESLint 10.13.0 and TypeScript 7.0.2. Documentation, type generation, remote-repository checks and other platform/parser matrices have separate acceptance scopes. Dependency installation uses ordinary strict engine/peer checks with lifecycle scripts disabled. The full unit entry runs in a separate network-disabled invocation if installation succeeds.

The current TypeScript ESLint parser declares a TypeScript peer range below 6.1. A coherent TypeScript 7 compatibility route remains necessary; normal resolution must expose that conflict. No force/legacy-peer mode, compiler guard bypass, case filter, assertion change or scan exclusion is permitted. Qualification remains false until actual retained evidence passes. ShareT's application manifests continue to select the public upstream package; this candidate is a review input for the migration.

The native-api matrix row preserves that exact SDK and its failing peer gate. A second publisher-side-by-side row diagnoses the two-rule ESLint port through Microsoft's official setup: @typescript/native is an exact alias for native TypeScript 7.0.2, while typescript is an exact alias for the latest @typescript/typescript6 compatibility package, 6.0.2. The latter delegates to the separately verified latest stable 6.x API, 6.0.3. The worker verifies every alias's actual package name/version/publisher integrity, the delegate identity, the default tsc binary's native-package path and its actual Version 7.0.2 response. This is an additional SDK profile, not a replacement for native API acceptance. Both rows run all 148 original case/helper files and the unchanged unit command with ordinary engine/peer checks. A diagnostic pass does not qualify TypeScript 7 parser API support, application activation, all parser/platform cases or the full frontend migration.

Source: [Microsoft's supported side-by-side setup](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0).

The original unit command also names Mocha's removed bin/_mocha executable. A five-line SDK-only ESM entry forwards the complete original argv to the unchanged current lib/cli/cli.js main function and awaits its result, with an explicit Node process import. It adds only that missing path after ordinary installation; it cannot overwrite an existing file. Every original file in the publisher Mocha 12.0.3 archive is hash-verified before and after the run. The original unit command, Istanbul coverage setup, original 148 case/helper files, Mocha implementation, case selection and failure handling remain unchanged. The adapter is reviewable in mocha-legacy-entry.mjs and bound in mocha-entry-provenance.json. Its first hosted invocation reaches original test-file loading and retains coverage output, then fails on the legacy TypeScript parser's private ESLint traversal import. All protected case/helper and Mocha files verify unchanged. The adapter and complete rule port remain unqualified; this does not remove the independent native API profile or activate the application dependency.


### Maintained TypeScript parser in the diagnostic SDK

Actual source 72d04f4 enters the unchanged original unit command, then fails because deprecated typescript-eslint-parser 22.0.0 imports a removed private ESLint traverser. The publisher metadata explicitly says to use @typescript-eslint/parser instead. The supplemental SDK now installs current @typescript-eslint/parser 8.72.0 under the original package import name through a normal npm alias, with its actual publisher identity and integrity required. All 148 original case/helper files, candidate library files, assertions and unit-command arguments are unchanged. The original strict native-api profile still requires direct TypeScript 7 parser support and remains unqualified. No peer override, private-export bypass, new source port or application manifest change is added. Fresh full-case hosted evidence is required; the alias is not a passing-case claim.


### Original-case-driven public API migration

At source 449e4c8, actual artifact 12581895662 runs the complete original unit entry: 15,084 cases pass and 2,324 fail, with zero skipped/pending cases reported. Original files remain unchanged. The maintained parser removes the earlier private-import startup failure. The actual failing families identify removed filename/whitespace methods and Minimatch's changed function export. This follow-up uses context.filename (retaining the old accessor fallback), the public SourceCode.isSpaceBetween API through a helper retaining old-version fallback, and Minimatch's documented named export. Fourteen total library files now differ from the publisher, including the original two context updates. Regenerate the readable patch and all three archives together and bind every library/case hash. No original helper, assertion, case selection, strict native-api row or application dependency is changed. Fresh full original-case acceptance remains required.

Sources: [ESLint 10 migration](https://eslint.org/docs/latest/use/migrate-to-10.0.0), [Minimatch usage](https://github.com/isaacs/minimatch#usage).


### Preserve JSX whitespace during autofix

Current original-case evidence at c933f8f reports 42 output mismatches. The first examples remove an expected space expression between JSX children. ESLint's own source documents that isSpaceBetweenTokens also detects spaces inside intervening JSXText, whereas isSpaceBetween does not. Preserve that behavior using the modern whitespace result plus public getTokensBetween and the same JSXText whitespace condition, with overlap rejection and argument ordering. Older ESLint versions still use their original method. All archives share this library change; no original case, helper, expected output or assertion changes. Fresh hosted output/case acceptance remains required. Source: https://raw.githubusercontent.com/eslint/eslint/v9.39.4/lib/languages/js/source-code/source-code.js .

### Preserve JSDoc component recognition

The complete df56605 suite contains three no-typos failures for a class marked
@extends React.Component. ESLint 10 removed getJSDocComment; the previous
component utility caught that missing method and silently treated the class as
unrecognized. Preserve the v9 attachment algorithm through public token/comment
APIs, including export wrappers, class expressions and function ancestry, while
delegating to the original method on older ESLint. The unchanged Doctrine tag
parser and every original case/assertion remain in place. Retain ESLint's MIT
notice as LICENSE.eslint in each of the three archives and bind its source/hash.
Fifteen library files now differ from the publisher; all archives have identical
library bytes. Original unsupported type assertions, valid-case output/errors
and newer-parser JSX behavior remain real failures until resolved. This change
does not filter cases, modify RuleTester, rewrite expectations or activate the
candidate in the application. Fresh hosted full-case qualification is required.
