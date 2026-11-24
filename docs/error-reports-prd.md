# PRD: Error reports

Milestone "9 Error reports". Decisions: ADR-0063, ADR-0064, `docs/error-reports-questions.md`.

## Problem Statement

When something breaks on a member's machine, nobody hears about it unless that member tells us. On 2026-11-24 a member trying the hosted beta on Windows got stuck on the sign-in screen (#520); we only learned because they said so. The background runner writes to a `background.log` nobody reads, hooks swallow every error to stay quiet, the web has no error handler at all, and the server's own failures sit in `fly logs`. As more people try Omagari, especially on native Windows, most small bugs will simply go unreported.

## Solution

Every piece (runner, CLI, hooks, web, and the server itself) sends its own errors, masked, to the server it's already connected to. Identical errors collapse into one row with a count. The server's operator sees the list in the server settings and can open any row as a prefilled GitHub issue. Members are told in setup, can turn reports off in three ways, see and delete what they sent, and choose whether their name is attached. Waits that should take seconds notice when they've hung for a minute, tell the person, and send a stuck report.

## User Stories

1. As an operator, I want errors from members' runners to show up in the server settings, so that I hear about bugs nobody filed.
2. As an operator, I want the same error from many machines to be one row with a count, so that the list stays short and I can see what's common.
3. As an operator, I want to see the piece, version, OS, command or screen, message and stack of an error, so that I can find the cause without asking.
4. As an operator, I want the server's own unexpected errors in the same list, so that I don't have to search `fly logs`.
5. As an operator, I want to press "Open as GitHub issue" on a row, so that a prefilled issue opens on our repo without me copying anything.
6. As an operator of a self-hosted server, I want the issue to open on my server's source repo, so that a fork's bugs go to the fork.
7. As an operator, I want to mark a row resolved, so that fixed errors leave the list and come back only if they happen again.
8. As an operator, I want to refuse error reports for my whole server, so that a team that doesn't want them gets none.
9. As an operator, I want rows to disappear 30 days after they last happened, so that old data doesn't pile up.
10. As an operator, I want a misbehaving machine to be unable to flood the list, so that one loop doesn't bury everything else.
11. As an operator, I want to see the sender's login only when they agreed, so that the list is about the software, not about people.
12. As a member, I want `omagari setup` to tell me errors go to this server and how to turn that off, so that nothing is sent behind my back.
13. As a member, I want to turn error reports off in personal settings, so that it applies on every machine I use.
14. As a member, I want `OMAGARI_NO_ERROR_REPORTS=1` or `DO_NOT_TRACK=1` to stop everything, so that I can turn it off without signing in.
15. As a member, I want to see the error reports I sent, so that I know exactly what left my machine.
16. As a member, I want to delete a report I sent, so that I stay in control of it.
17. As a member, I want to choose "Attach my name", so that the operator can follow up with me when I want help.
18. As a member, I want my tokens, file content, repo and branch names and home folder never to appear in a report, so that reporting doesn't leak my work.
19. As a member on Windows whose `omagari setup` fails before I ever sign in, I want that error to be sent after I sign in, so that setup bugs still reach the operator.
20. As a member whose runner is offline, I want its errors kept and sent when it reconnects, so that they aren't lost.
21. As a member, I want a hook that fails to still never block or slow my agent, so that reports don't change how hooks behave.
22. As a member, I want a web page that crashes to show a "something went wrong" screen with a way back, so that I'm not left on a blank page.
23. As a new member stuck on "Waiting for you to approve on GitHub…", I want the screen to say it's taking too long and offer "Try again" after a minute, so that I'm not stuck forever.
24. As an operator, I want that stuck wait to arrive as a report with the screen and step, so that bugs like #520 reach me even without an error.
25. As a member waiting for an operator to approve my access request, I want no "too long" message, so that a normal long wait doesn't look broken.
26. As a member pressing "Update now" whose runner doesn't come back in 3 minutes, I want the operator to get a stuck report, so that broken updates surface.
27. As a member of the hosted beta, I want the privacy policy to say what error reports hold and how long they stay, before any are collected, so that I can trust it.
28. As a member of a workspace, I want other members not to see my error reports, so that my machine's problems stay between me and the operator.

## Implementation Decisions

- **Contract** holds everything shared: the report shape (piece, kind `error` or `stuck`, version, OS, arch, runtime, where, error name, message, up to 20 stack lines, count, first and last seen), the masking function, a runner→server report message, HTTP routes for sending a report (CLI, web), for the operator's list, resolve, and refuse-all state, for the member's own list and delete, and the two personal settings (reports on/off, attach my name). The server's "reports off" answer reaches pieces through what they already receive (runner `welcome`, the web's settings). `CONTRACT_VERSION` goes up.
- **Masking** is one function in the contract used by every sender and again by the server: home folder → `<home>`, repo folder → `<repo>`, GitHub token shapes, `Bearer`, JWTs, `key/token/secret/password=` values, URL query strings and emails → `<redacted>`. Messages are capped in length, stacks at 20 lines.
- **Grouping key**: piece + error name + message with numbers and masked parts removed + first stack line inside Omagari's code. A report with an existing key adds its count and moves last seen.
- **Server** keeps a STRICT reports table with the sender's login (always kept, shown to the operator only when the sender opted in), one more delete in the existing 60-second cleanup sweep (30 days after last seen), and a per-login limit of 20 new rows an hour (drops silently). The HTTP error path that answers 500 records the server's own error as a `server` report. A server setting turns reports off for the whole server; the server then drops reports and tells pieces not to send.
- **Runner** installs process-level handlers for uncaught errors and unhandled rejections, and also reports the failures it already prints (couldn't start, stopped, observation and merge-run problems). Unsent reports go to a capped file (50) in the Omagari config folder and are sent after the next `welcome`. Hooks hand their errors to the runner over the existing local socket and still exit 0.
- **CLI** reports from its top-level catch through the HTTP route, and keeps unsent reports in the same file when not signed in. `omagari setup` prints the one-line notice.
- **Web** adds `error` and `unhandledrejection` listeners and an error boundary with a "something went wrong" screen, keeps unsent reports in local storage, and times out the short waits listed in ADR-0064 at 1 minute with "Try again" and a stuck report. The runner update card sends a stuck report when its 3 minutes pass.
- **Operator screen** is a new page in the server group of settings (where access requests are), and "Open as GitHub issue" builds a new-issue URL on `settings.sourceUrl` with title and body from the masked report and no login.
- **Personal settings** get the off switch, "Attach my name", and the list of reports I sent with delete.
- Both environment variables are checked locally before anything is queued or sent.

## Testing Decisions

- Behavior tests use `test/harness.ts`: a real server and a real runner on a temporary repo, checked only through the server API and the CLI and hook binaries. Good tests make a piece fail for real (a runner that can't write its state, a CLI command that throws, a hook given bad input) and check what the operator's route returns.
- Masking gets a table test in the contract with real-looking tokens, Windows and POSIX home paths, URLs and emails.
- Grouping, the hourly limit and the 30-day cleanup use the server's existing time overrides, like the content cleanup tests.
- The opt-outs are tested end to end: with each variable set, the operator's list stays empty and no queue file is written.
- Web unit tests cover the stuck timer and the issue URL builder; screens get screenshots in the PR per `DESIGN.md`.
- A person checks on real Windows that a forced error and a setup failure before sign-in reach the hosted server's list.

## Out of Scope

- Usage analytics of any kind (what people click, how often). Only errors and stuck waits.
- Any third-party error service.
- Sending reports from a self-hosted server to us automatically.
- Turning on reports when an operator refused them.
- Rotating or capping `background.log`.
- Alerts (email, Discord) when a new error appears.

## Further Notes

- The privacy policy row (English and Korean) must be approved by @Pancheble and merged before any code that collects reports, because `dev` deploys to the hosted server (ADR-0042, ADR-0054).
- The 1-minute stuck limit and the 20-an-hour limit are guesses; adjust from real reports.
