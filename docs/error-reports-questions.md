# Error reports grilling: questions, what we answered ourselves, what's open

The scope: Omagari's pieces report their own errors, so small bugs on members' machines (Windows above all) reach whoever runs the server without someone filing them. The input is @Pancheble's question on 2026-11-24, after #520 (a new person stuck on the sign-in wait screen, fixed in #521): could small bugs like this report themselves?

Where we looked, in the order AGENTS.md asks: `GLOSSARY.md`, ADR-0016, 0018, 0042, 0052, 0054, 0061, 0062, `site/privacy.md`, the code (error handling in every package, `background.log`, the operator settings, the cleanup sweep, version reporting), and how Claude Code, VS Code, npm, `gh`, Homebrew, Grafana, Gitea and Sentry handle error reports and opting out. Sources are at the end.

Running example used in every question: Minjun uses Claude Code in PowerShell on a Windows laptop and signed up to the hosted beta (`app.omagari.org`). Jisu's team runs its own server.

## 0. Decided

@Pancheble decided Q1–Q7 on 2026-11-24.

| #   | Decided                                                                                                               | Recorded in |
| --- | --------------------------------------------------------------------------------------------------------------------- | ----------- |
| Q1  | Pieces send reports to the server they're connected to; the operator sees them and can open a prefilled GitHub issue  | ADR-0063    |
| Q2  | On by default with a notice in setup; off by a personal setting, `OMAGARI_NO_ERROR_REPORTS=1` or `DO_NOT_TRACK=1`; the operator can refuse for the server | ADR-0063    |
| Q3  | What a report holds; the sender's login only when the sender turns on "Attach my name" (off by default)               | ADR-0063    |
| Q4  | The operator and the sender see a report; other members don't                                                         | ADR-0063    |
| Q5  | Short waits say they're stuck after 1 minute and send a stuck report                                                  | ADR-0064    |
| Q6  | The same error is one row with a count; 20 new rows an hour per person; deleted 30 days after last seen               | ADR-0063    |
| Q7  | The server's own unexpected errors go in the same list                                                                | ADR-0063    |

Answered ourselves, from the code: hooks hand their errors to the runner and still exit 0 (ADR-0016 keeps hooks quiet, and hooks never talk to the server); unsent reports wait on the machine (at most 50) so errors before the first sign-in still arrive; the legal text lands before any collecting code, because `dev` deploys to the hosted server (ADR-0042).

## 1. What we asked

### Q1. Where reports go

Minjun's runner dies with an error, and nobody is watching the terminal.

- A. Runner, CLI, hooks and web send the error to the server they're already connected to (version, OS, which command or screen, the message, tokens and paths masked). The server's operator sees them. There's an off switch. The hosted beta's reports reach us; Jisu's team's reach Jisu's team's operator.
- B. Nothing is sent by itself. `omagari report` or a web "Report a problem" button bundles version, OS and the log tail (masked) and opens a prefilled GitHub issue.
- C. A third-party service like Sentry. The privacy policy gains a processor and an overseas transfer.

Recommended A with B on top. Picked: reports collect on the connected server only, and the operator picks one and presses "Open as GitHub issue". A self-hosting team's errors reach us only when that team chooses.

### Q2. On or off at first

After `omagari setup`, are error reports on? `gh` (since 2.91, April 2026), Claude Code and Homebrew start on and turn off with a variable (`GH_TELEMETRY=0`, `DISABLE_ERROR_REPORTING=1`, `HOMEBREW_NO_ANALYTICS=1`, and `DO_NOT_TRACK=1` for `gh`). Homebrew shows a notice before the first send.

- A. On, and setup says in one line where they go and how to turn them off. Off by a personal setting, `OMAGARI_NO_ERROR_REPORTS=1` or `DO_NOT_TRACK=1`. The operator can refuse for the whole server.
- B. Off, and setup asks.
- C. Off until a person turns it on.

Picked: A.

### Q3. What a report holds

An example, as the operator would see it:

```
runner 0.0.0-dev.61 · Windows (win32 x64) · Node 24.3
Where: background runner / observation
Error: EPERM: operation not permitted, open '<home>\...\state.json'
Stack: at writeState (runner/src/state.ts:42) …
When: 11-24 14:03 · 12 times
Who: minjun
```

No file content, tokens, command arguments, repo or branch names. The home folder becomes `<home>` (VS Code's way). "Who" lets the operator ask the person, but makes it personal data. The GitHub issue draft never has "Who".

@Pancheble: let both be possible. Asked who picks; picked: the sender, in personal settings ("Attach my name"), anonymous by default. The server still knows the sender so the sender can see their own (Q4); only the operator's view hides it.

### Q4. Who sees reports

- A. The operator, and the sender sees and deletes their own in personal settings (`gh` has a log mode that prints what it would send; VS Code shows what it sent).
- B. Only the operator.

Other members never see them. Picked: A.

### Q5. Waits that never end (#520)

The sign-in screen stayed on "Waiting for you to approve on GitHub…". No error, so error reports don't catch it.

- A. Waits that should end in seconds (sign-in, loading the first screen) say "taking longer than it should · Try again" after 1 minute, and send a stuck report with the screen and step. Long waits (an access request waiting for approval) are left out. The runner update card, which already gives up after 3 minutes, reports then.
- B. Only the message; reporting is a button.
- C. Leave it out.

Picked: A.

### Q6. How much and how long

Minjun's runner retries every minute and hits the same error 1,440 times a day.

- A. The same error (same piece, message, first stack line) is one row with a count, first and last seen. Each person starts at most 20 new rows an hour. Deleted 30 days after last seen. The operator can mark one resolved (deleted); it comes back if it happens again.
- B. The same, kept 90 days.

Picked: A.

### Q7. The server's own errors

The server's unexpected errors (500s) show only in `fly logs` today.

- A. Put them in the same list, as one more piece.
- B. Only members' machines.

Picked: A.

### Milestone and tickets

New milestone "9 Error reports" with a `stage:9` label. PRD #522; @Pancheble accepted the seven tickets as proposed: #523 privacy text (a person approves) → #524 server keeps reports and shows operators → #525 runner reports → #526 personal settings → #527 CLI and hooks, #528 web and stuck waits → #529 hand check on real Windows.

## Sources

- Claude Code data usage, error reporting and opt-out variables: https://code.claude.com/docs/en/data-usage
- VS Code telemetry levels: https://code.visualstudio.com/docs/configure/telemetry; path and secret scrubbing: https://github.com/microsoft/vscode/blob/main/src/vs/platform/telemetry/common/telemetryUtils.ts
- npm logging (local only, "A complete log of this run can be found in"): https://docs.npmjs.com/cli/v11/using-npm/logging
- GitHub CLI telemetry and opt-out: https://docs.github.com/en/github-cli/github-cli/github-cli-telemetry, https://github.blog/changelog/2026-04-22-github-cli-opt-out-usage-telemetry
- DO_NOT_TRACK convention: https://donottrack.sh/
- Homebrew analytics: https://docs.brew.sh/Analytics
- Sentry sensitive data: https://docs.sentry.io/platforms/javascript/data-management/sensitive-data/
- Grafana usage reporting: https://grafana.com/docs/grafana/latest/setup-grafana/configure-grafana/
- VS Code hang detection and "Report Issue": https://github.com/microsoft/vscode/wiki/Performance-Issues
