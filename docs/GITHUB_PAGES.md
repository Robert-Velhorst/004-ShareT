# Informational GitHub Pages website

This is an independent, static project-information website. It is not the ShareT
application or the commercial marketing homepage from PR #157.

## Contents

- `docs/index.html`: project overview, illustrative workflow, requirements, FAQ,
  and links to the repository README and deployment documentation.
- `docs/site.css`: responsive white/navy/teal styling adapted from the approved design.
- `docs/assets/sharet-mark.png`: the existing generated ShareT brand mark, reused
  without modification. No private screenshots or real participant identities.
- `docs/.nojekyll`: disables Jekyll processing for the static source.

There is no JavaScript, authentication, form submission, payment flow, analytics,
third-party font, backend connection, or application storage. The FAQ uses native
HTML details/summary elements. GitHub's own hosting-level visitor processing still
applies. Source/documentation links are informational, not hosted purchase flows.

## Publishing without changing main

The initial publication uses GitHub Pages' branch-based source:

- Branch: `codex/informational-pages`
- Directory: `/docs`
- Build type: `legacy` (GitHub's name for branch-based publishing)

The source changes are submitted in a pull request against `main`. Publishing
this explicitly requested informational site from the dedicated branch does not
merge that PR, change the app homepage, or migrate the app to another host.
No custom domain is configured.

**Do not delete the publishing branch while Pages uses it.** After a maintainer
reviews and merges the PR, they can change the Pages source to `main` and `/docs`.
That transition is not automatic and must not be done before the static files
exist in the chosen source. Future changes should continue to go through PRs.

GitHub publishes the contents of `/docs`, including any existing public Markdown
documentation in that directory. Do not put credentials, private operational
notes, or customer data there. `.nojekyll` serves those Markdown files as files.

## Verification

No frontend build or dependencies are required for this site. Run:

```sh
node --test test/informational-pages.test.mjs
```

The tests check document structure, informational navigation, repository-subpath
compatibility, local asset existence, the no-runtime boundary, and accessible FAQ
markup. The PR workflow runs these checks without deployment permissions.

Browser verification should check the published `/004-ShareT/` path, styles and
logo loading, keyboard FAQ operation, section links, desktop/mobile layout, and
absence of app/API requests. Backend tests do not establish Pages functionality,
and Pages tests do not establish Trello or email delivery.

## Purpose and policy boundary

Keep this site genuinely informational. Do not add signup, login, purchase,
checkout, credit sales, or hosted SaaS functionality here. Those belong on the
separately hosted application. This design follows GitHub's documented project-site
purpose; it is not an assurance of GitHub policy approval.

References:

- [About GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [Pages usage limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
- [Configure a publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
