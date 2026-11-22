---
status: proposed
---

# A static demo at omagari.org/demo/, answered in the browser

Decided by the hub on 2026-11-23 while @Pancheble was away; to confirm (#444). @Pancheble asked for "a way to look around before installing" and left the details to the hub.

Today nobody sees Omagari working before signing in with GitHub, asking for access, waiting for approval, installing the GitHub App, and installing the CLI. The landing page (ADR-0057) has screenshots, but nothing to click.

## What it is

- **A static page at `omagari.org/demo/`, published with the docs site.** No server, no sign-in, no install. The docs workflow builds it into the site's `demo/` folder.
- **The real web app, built in a demo mode** (`vite build --mode demo`). Its API calls and its live connection are answered in the browser (`packages/web/src/demo.ts`) instead of going to a server. The normal build doesn't contain it, so `app.omagari.org` and self-hosted servers are unchanged.
- **The answers are recorded from the `test/demo.ts` seed**, which already sets up every state of the screen. `npm run demo:fixtures` runs the seed and records every answer the web reads into `packages/web/demo/fixtures.json`. A test checks the recording against the contract, so CI fails when it goes stale; then record it again. Times are moved on load so the seed looks as fresh as when it was recorded.
- **Each visitor plays alone.** Sending a message (also in a thread or as a reply), reacting, switching channels and workspaces, opening posts, and changing language or appearance change only that tab, in memory. A reload starts over. Nothing goes anywhere but the static files.
- **No real agent, ever.** Seeded Q&A and agent answers are fixed text from the seed. Anything that needs a real server or agent (asking an agent, merge runs, decision PRs, debates, labels, forums, settings that save) shows the demo note, "That needs a real server and agent", with "Open app". The note is otherwise always there, saying it's a demo.
- **The address stays at `/demo/`.** GitHub Pages knows no app paths, so the demo keeps the app's path (ADR-0057) in the history entry instead of the address bar. Back and Forward work.
- **The landing page has "Try the demo"** next to "Open app" (English, like the rest of the landing page, ADR-0045).

## Considered Options

- **A hosted demo server**: a public, writable server costs another machine and invites spam that every visitor sees.
- **A demo inside the app server**: ADR-0057 keeps the server app-only, so every self-hosted server would carry it.
- **Hand-written fixtures**: they drift from the contract and miss states. The seed already has every state, and the screens are checked against it.
- **A real path per channel under `/demo/`** (`/demo/channels/…`): a reload or shared link would hit GitHub Pages' 404, since the site has one 404 page for everything.
