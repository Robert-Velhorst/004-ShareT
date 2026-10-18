# ShareT public homepage

The public homepage is part of the existing ShareT React application, at `/`.
It explains account-free freelancer access and the two-way ShareT/Trello workflow.
It does not introduce a second application, payment integration, or deployment.

## Entry points

| Location | Responsibility |
| --- | --- |
| `src/pages/Index.jsx` | Reads the existing authentication state and sets the page title. |
| `src/components/marketing/HomePage.jsx` | Sections, FAQ, and links into the real application. |
| `src/components/marketing/ConversationPreview.jsx` | Interactive, local-only example conversation. |
| `src/components/marketing/Brand.jsx` | Shared homepage brand mark and wordmark. |
| `src/index.css` | Scoped `.sharet-marketing` theme and responsive layout. |
| `public/marketing/` | Small locally served brand/avatar assets. |
| `test/homepage.test.mjs` | Server-rendered route, semantics, and content checks. |

Visitors go to `/signup` or `/signin`; signed-in visitors go to `/app`.
Existing application routes, backend services, authentication, Trello credentials,
and email configuration are unchanged. The marketing page stays light while the
rest of the application retains its existing theme behaviour.

## Example interaction and privacy

The two example composers replace the fictional update/reply in React memory.
The update is shown in the ShareT and Trello previews; the reply is also shown in
the illustrative email. Reloading resets both. Inputs are trimmed, limited to
500 characters, and rendered as text. Blank submissions are disabled.

These controls do not create cards, send comments, send email, collect addresses,
or store submitted text. A visible notice explains this boundary. The example
email link returns to the on-page conversation. Share settings are an illustration,
not editable controls. Real collaboration starts through the signup/app buttons.

## Accessibility and responsive design

The page uses one primary heading, semantic sections and navigation, a skip link,
labelled forms, existing Radix accordion controls, focus indicators, and reduced-motion
styles. Preview avatars are decorative; names remain native text. Narrow screens
stack sections and, below 400 pixels, stack the example conversation windows.

## Development and validation

Use Node.js 22 or newer, consistent with the repository's declared requirement.

```sh
npm ci
npm run dev
npm run test:homepage
npx eslint src/pages/Index.jsx src/components/marketing --ext .jsx
npm run build
npm ci --prefix backend
npm test --prefix backend
```

The homepage tests render the real React components but do not exercise browser
events. Browser checks should additionally submit both examples, reject whitespace,
operate the FAQ by keyboard, follow signup/signin and section links, and check
320px, 390px, tablet, and desktop widths. They do not prove live Trello or email
delivery. The PR workflow runs automated checks only and has no deployment step.

## Hosting handoff

Keep website and application source in this repository. The existing backend can
serve the built `dist` frontend, so the website can travel with the application to
Hetzner. The operator still needs to configure the domain, HTTPS, environment,
persistent data, backups, and provider callbacks using the project's deployment
documentation. This homepage change does not perform that migration or alter any
hosting setting.

Do not use GitHub Pages to run the paid ShareT service. GitHub Pages serves static
files, not this Node backend, and its [published limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
restrict using it as free hosting for an online business or commercial SaaS.

## Visual asset provenance

The approved visual direction is the white/navy/teal ShareT homepage concept with
the heading “Your Trello. Their way in.” and an email link labelled “View in ShareT”.
The implementation uses native text/components rather than a flattened screenshot.

The cloud-link mark and two fictional portrait assets were generated for this
homepage, then resized and encoded for web delivery. The portraits represent
fictional Alex Morgan and Jamie Lee, not actual users or endorsements.

Generation directions:

- Mark: transparent navy/teal linked-cloud symbol matching the approved concept,
  without a wordmark or surrounding interface.
- Alex: fictional adult with short dark hair and beard, dark shirt, neutral background.
- Jamie: fictional adult with shoulder-length dark brown hair, dark shirt, neutral background.

All three delivered files are 96 × 96 pixels and together are under 10 KB.
No private Trello screenshots, freelancer identities, or customer data are included.
