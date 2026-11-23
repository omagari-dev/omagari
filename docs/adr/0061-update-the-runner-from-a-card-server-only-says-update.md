---
status: accepted
---

# A card tells the owner a newer runner is out; the server can only say "update"

The runner updates itself only when the server's contract is newer (ADR-0042, ADR-0048). A fix that doesn't touch the contract, like #489 on 2026-11-23, reaches nobody until they run `npm i -g omagari@next` by hand, and nothing tells them it's out. @Pancheble decided on 2026-11-23 to show a card with an update button (#505). This records where the newest version comes from and what the server may ask of a runner.

- **The runner says its version.** `hello` carries `version`, the npm package version (`0.0.0-dev.57`). A runner run from a clone sends none: it has no npm version and can't update from npm, so it never gets the card. The server keeps it per runner connection and sends each member only their own runners' versions (`serverToWeb.runners`), never other members'.
- **The browser asks npm for the newest version.** The web reads `registry.npmjs.org/omagari/<dist-tag>`, with the dist-tag from `INSTALL_COMMAND` (`next` until the first release, then `latest`), once when the app opens and then every hour. npm answers with CORS open and a 5-minute cache (checked 2026-11-23), so the server makes no outbound call. That works the same on the hosted server and self-hosted ones, and costs the server nothing. npm sees the member's IP address, as it does when they install.
- **The server can only say "update".** `serverToRunner.update` has no fields, and the contract's strict shapes refuse any added key, so the server can't name a version, a package, a tag or a URL. The server sends it only when the runner's owner asks (`api.updateRunner`, the caller's own runners, every workspace), never on its own.
- **The runner reads npm itself.** On `update`, a runner installed from npm asks `npm view omagari@<its own dist-tag> version`. If that's the version it runs, it does nothing. Otherwise it runs the same self-update as a newer contract (`npm i -g omagari@<its own dist-tag>`, ADR-0048) and restarts: launchd, systemd (Linux, WSL2) and Task Scheduler (ADR-0060) start the background runner again; a terminal `omagari runner` restarts itself. A runner from a clone answers that it can't. One background process updates once, however many repos it watches.
- **The card falls back to the command.** If the update fails, the runner answers `error` with the reason, and the card shows `INSTALL_COMMAND` to copy. It does the same when no runner is connected, and when no runner comes back on a new version within 3 minutes.

## Considered Options

- **The server asks npm** (every hour, cached): one call per server instead of per browser, but every self-hosted server needs outbound access to npm, tests need another fake, and the server would hold a version it could be tempted to pass on.
- **The server tells the runner which version to install**: one fewer npm call, but a server that's been broken into could pick any version or package. ADR-0033 already keeps the server from deciding what runs on a member's machine.
- **The runner checks npm on a timer and updates by itself**: no button, but a broken `next` would reach every machine within the hour, without anyone choosing it.
- **Show the versions in the member list**: everyone would see everyone's version, and only the owner can do anything about theirs.

## Consequences

- Updates ADR-0048: the runner also updates on its owner's request, not only when the contract is newer. It still installs only its own dist-tag from npm.
- `CONTRACT_VERSION` goes up: `hello.version`, `serverToRunner.update`, `serverToWeb.runners` and `api.updateRunner` are new.
- On native Windows with the Run key fallback (ADR-0060), nothing restarts the background runner after it updates, the same as after a contract update today. The card then says it couldn't update after 3 minutes and shows the command.
- A broken `next` reaches a machine only when its owner presses the button.
- Tests fake `npm view` alongside `npm i -g`; the real npm is checked by hand.
