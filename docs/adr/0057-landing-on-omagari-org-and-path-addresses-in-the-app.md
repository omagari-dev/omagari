---
status: accepted
---

# The landing page and docs live on omagari.org, the server stays app-only, and app addresses are paths

Decided on 2026-11-22 by @Pancheble. Today the docs site is at `omagari-dev.github.io/omagari/`, nothing is at `omagari.org`, and the app's address is `app.omagari.org/#<channel id>`.

## Two domains, like Slack

- **`omagari.org` is the docs site.** Its first page is a landing page: what Omagari is, an "Open app" button to `app.omagari.org`, and a "Self-host" link to the Run a server page. The docs pages sit right under it, at the paths they have now (`omagari.org/getting-started`, `omagari.org/server`, `omagari.org/terms`). `www.omagari.org` goes to `omagari.org`. It's still VitePress on GitHub Pages, now with a custom domain and `base: "/"`. The landing page starts from VitePress's `layout: home`. Old `omagari-dev.github.io/omagari/<page>` links go to the custom domain by GitHub Pages' own redirect.
- **The server is only the app.** A team that runs its own server opens straight into the app, not into our marketing page. The server is unchanged: it already serves the web for every path that isn't `/api/`.
- **The landing page is English only**, like every screen before sign-in (ADR-0045). The Korean terms and privacy policy stay at `/ko/…`.

## App addresses are paths, like Discord

| What                      | Address                                                            |
| ------------------------- | ------------------------------------------------------------------ |
| A channel                 | `/channels/<workspace>/<channel id>`                               |
| A workspace, no channel   | `/channels/<workspace>`, which goes to the channel last seen there |
| A post in the side column | `/channels/<workspace>/<forum id>/<post number>`                   |
| A post in the big view    | `/channels/<workspace>/<forum id>/<post number>/big`               |
| A post in "Other posts"   | `/channels/<workspace>/other/<post number>`                        |
| Sign in                   | `/login`                                                           |

- **`<workspace>` is the GitHub account name**, lowercased, which is how the server already tells workspaces apart. Discord puts a number there; ours is already unique and readable.
- **Channels by id, not name.** Two repos can each have a `#general`, and renaming a channel would break its links. The name is on the screen.
- **No repo in the address.** A channel already knows its repo, and the app works out the place from the channel, as it does now.
- **No `@me`.** A DM here is a Q&A only you and your agent see, inside a channel (GLOSSARY). It opens in the channel's side column, so it has no address of its own.
- **The right column and settings aren't in the address.** The member list, My agent, a profile, and the settings window don't change it. The one exception stays as it is now: opening My agent from a side-column post switches to the big view, which is in the address.
- **Signed out**, any app address goes to `/login`, and signing in comes back to it. **Signed in**, `/` goes to the last channel. Someone with no workspace yet sees the access request after `/login`, with no address of its own. An unknown address goes to `/`.
- **Old `#` links redirect forever.** `#<channel id>`, `#<forum id>/<post number>`, and `…/big` turn into the matching path. They are already in GitHub issue comments and in decision ADRs committed to teams' repos (their `Source:` line), which we can't rewrite. Links the server writes from now on use the path form.

## Considered Options

- **One domain, like Discord** (landing at `omagari.org/`, app at `omagari.org/channels/…`): a self-hosted server would either open on our marketing page or behave differently from ours.
- **Landing page served by the server**: same problem, and every self-hosted server would carry our marketing.
- **Docs under `omagari.org/docs/`**: one more segment for nothing. Nothing else lives on that domain.
- **Channel names in the address**: readable, but clashes across repos and breaks on rename. Discord and Slack use ids too.
- **Keep the hash**: works without server help, but a path is what people expect to share, and it leaves room for pages that aren't a channel.

## Consequences

- DNS on Cloudflare: `omagari.org` and `www` point at GitHub Pages, DNS only (not proxied) so GitHub can issue the certificate. `app.omagari.org` and `status.omagari.org` don't change.
- Links to the docs (README.md, README.ko.md, the docs pages, the web's merge-run and settings links) move to `omagari.org`.
- The web reads the path instead of the hash and moves with `history.pushState`, so Back still works.
- Tests: the web's address parsing gets unit tests; the old-link redirect is checked end to end through the server, which already serves the web for any path.
