---
status: accepted
---

# Error reports go to the server each piece is connected to; the operator sees them and can open a GitHub issue

On 2026-11-24 a member trying the hosted beta on Windows got stuck on the sign-in wait (#520, fixed in #521). Nobody would have known if they hadn't told us. Today no piece catches its own errors: there's no `uncaughtException` handler, no `window.onerror`, no error boundary, hooks swallow everything to stay quiet (ADR-0016), and the background runner's output goes to `background.log` on the member's machine, which nobody reads. @Pancheble decided the following on 2026-11-24 (`docs/error-reports-questions.md` Q1–Q4, Q6, Q7).

- **Reports go to the server the piece is already connected to.** The runner, CLI, hooks (through the runner) and web send an error report to their own server. The server's own unexpected errors (the ones that answer 500 today) go in the same list. Nothing goes to a third party. The hosted server's reports reach us; a self-hosted server's reach its own operator.
- **The operator sees them in the server settings** (next to access requests, operators only, ADR-0062), and can press "Open as GitHub issue" on one. That opens a prefilled new-issue page on the repo in the server's source URL (`settings.sourceUrl`, so a fork points at its fork) with the report, never the sender's name. A self-hosting team's errors reach us only when that team presses it.
- **On by default, with a notice and three ways off.** `omagari setup` says in one line that errors go to this server (by its address) and how to turn them off. Off is: a switch in personal settings (kept on the server, so it follows every machine), `OMAGARI_NO_ERROR_REPORTS=1`, or `DO_NOT_TRACK=1` (the donottrack.sh convention, which `gh` honors). With either variable set, the piece sends nothing at all. The operator can refuse reports for the whole server with a server setting; then the server tells pieces not to send.
- **What a report holds**: the piece (runner, CLI, hook, web, server), its version, OS and arch, Node or browser, which command or screen, the error's name and message, up to 20 stack lines, a count, and first and last seen. It never holds file content, tokens, command arguments, repo or branch names, or environment variables. A shared masking step in `packages/contract` replaces the home folder with `<home>`, the repo folder with `<repo>`, and token-shaped strings (GitHub `gh*_`/`github_pat_`, `Bearer …`, JWTs, `key=`/`token=`/`secret=` values, URL query strings, emails) with `<redacted>`. The sender masks before sending and the server masks again before storing. This follows VS Code's path and secret scrubbing (`anonymizeFilePaths`, `userDataRegexes`).
- **Anonymous unless the sender says otherwise.** The server always knows who sent a report, so the sender can see and delete their own in personal settings. The operator sees the sender's login only when the sender turned on "Attach my name" in personal settings (off by default).
- **The same error is one row.** Same piece, same error name, same message with numbers and masked parts taken out, and the same first stack line in our code: the server adds to the count and moves "last seen". Each person can start at most 20 new rows an hour; past that the server drops them silently. A row is deleted 30 days after it was last seen (the same 30 days as changed-file content, ADR-0054). The operator can mark a row resolved, which deletes it; if it happens again it comes back.
- **Reports that can't be sent yet wait on the machine.** The runner and CLI keep unsent reports (masked) in a small file in the Omagari config folder, at most 50, and send them after the next successful connection. That's how errors before the first sign-in (a broken `setup` on Windows) still arrive. The web keeps its unsent ones in the browser's local storage.
- **The legal text comes first.** Error reports are new personal information on the hosted server (the sender's login, IP is not kept). `site/privacy.md` and its Korean copy gain a row for them before any code that collects them merges, because `dev` deploys to the hosted server (ADR-0042). @Pancheble approves that text (ADR-0054).

## Considered Options

- **Only a "Report a problem" button or `omagari report` that opens a GitHub issue**: nothing new collected, but someone has to notice and press it. #520's member would have needed to.
- **A third-party service like Sentry**: dashboards for free, but it adds a processor and an overseas transfer to the privacy policy, and self-hosted servers would either send to us or need their own account.
- **Off by default, setup asks**: the members most likely to hit bugs (first-time, Windows) are the ones who don't know what to answer. Claude Code, `gh` and Homebrew start on with a notice and an opt-out.
- **Always attach the sender's login**: easiest for the operator to follow up, but it turns every error into a record about a person. Anonymous by default with an opt-in keeps it a report about the software.
- **The operator picks name or no name for the whole server**: one switch, but members on the hosted server would have no say.
- **Keep 90 days**: longer history, but 30 days matches the rest of the hosted server's short-lived data.

## Consequences

- `CONTRACT_VERSION` goes up: a report shape and the masking step, a runner→server report message, report and personal-setting routes, a server→piece "reports off" signal.
- The server needs a reports table and one more line in the existing cleanup sweep.
- Masking is best effort. A token in an unusual shape can still slip through, so the sender masks first and nothing we know is secret (session, GitHub tokens) is ever put in an error message on purpose.
- Hooks stay quiet: a hook hands its error to the runner and still exits 0. If the runner isn't running, the hook's error is lost.
- A self-hosted operator who doesn't want reports turns them off with one setting; members can't turn them on for a server that refuses.
