---
status: accepted
---

# The runner on native Windows: Task Scheduler, named pipes, exec-form hooks, and a required Windows CI job

ADR-0059 lets the runner, the CLI and the hooks run on native Windows (PowerShell). This records how, from the stage 8 grilling on 2026-11-23 (`docs/stage8-questions.md` Q5, Q6 and section 2). The code today assumes POSIX in a few places: Unix sockets, launchd and systemd, `sh`-quoted hook commands, `/bin/sh`, process groups, symlinks, `/` paths, and spawning `npm`, `claude` and `codex` without a shell.

- **Background runner: Task Scheduler.** `setup` registers a task for the person's own account that starts at their logon, at the default (limited) run level, and restarts it when it fails. `uninstall` deletes it. If the hand check finds that a person without admin rights can't create it, fall back to the per-user Run key (`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`) and have the background runner restart its own child, the way the self-update restart already does. No console window shows; how is checked on a real Windows machine. Updates ADR-0049, which rejected Task Scheduler only because the runner didn't run natively.
- **Named pipes for local sockets.** Node on Windows listens only on named pipes. The per-repo socket and the background socket become `\\.\pipe\omagari-<id>` and `\\.\pipe\omagari-background-<id>`, with the same ids as today. A pipe leaves no file, so there's nothing to remove before listening; the "already on" probe stays.
- **Hooks without a shell for Claude Code.** On native Windows, Claude Code runs a hook's `command` in Git Bash when it's installed and in PowerShell when it isn't, and a hook can instead give `command` plus `args`, which runs without a shell but needs a real `.exe` ([Claude Code hooks](https://code.claude.com/docs/en/hooks)). `node.exe` is one, so setup writes `node.exe` and the hook script as `command` and `args`, which works with or without Git Bash. Codex gets `commandWindows` ([Codex hooks](https://learn.chatgpt.com/docs/hooks)); the exact shape that runs is checked by hand. Setup recognizes its own hooks by the hook script's path, whatever the separators, so running it again doesn't add duplicates.
- **The check command runs in `cmd.exe`.** That's what npm uses for scripts on Windows, so `.omagari.json` commands like `npm test` or `npm ci && npm test` work the same as on macOS and Linux. Without process groups, the runner stops the whole process tree at the end (`taskkill /T` or a job object). Dependency folders are linked with directory junctions, which need neither admin rights nor Developer Mode.
- **`.cmd` shims.** `npm`, `claude` and `codex` are `.cmd` files on Windows, and Node won't spawn them without a shell. The runner resolves and spawns them through `cmd.exe` with quoted arguments.
- **Stopping.** Windows has no SIGTERM between processes. The background runner stops when the service stops it or when asked over its pipe, and closes its runners first.
- **Paths.** What goes to the server and what's compared with Git paths uses `/`. The config folder stays `~\.config\omagari` (or `XDG_CONFIG_HOME`), like Claude Code's `~\.claude` and Codex's `~\.codex`. The profile's permissions keep the session file to the person; `chmod` modes don't apply there.
- **A required Windows CI job.** Every PR runs typecheck and `npm test` on `windows-latest` too, and a failure blocks the merge. Tests that can't pass on Windows yet are skipped there with the ticket that fixes them, and each ticket removes its skips.
- **Tests fake `schtasks` too.** Like `launchctl` and `systemctl` (ADR-0050), the harness puts a fake `schtasks` first on the CLI's PATH, so tests never register a real task. The fakes are Node scripts with a `.cmd` wrapper on Windows instead of `#!/bin/sh` files. The real registration is checked by hand on Windows. Updates ADR-0050.

## Considered Options

- **Run key only**: no admin rights at all, but nothing restarts the runner when it crashes, and Microsoft doesn't promise when Run entries start ([Run and RunOnce keys](https://learn.microsoft.com/en-us/windows/win32/setupapi/run-and-runonce-registry-keys)). Kept as the fallback.
- **A Windows service**: needs admin rights, and runs outside the person's session, where the agents' configs and tokens aren't.
- **Hook commands for a shell** (`'node' 'main.js'` as today): Git Bash and PowerShell quote differently, and which one runs depends on whether Git Bash is installed.
- **The check command in Git Bash's `sh`**: not everyone has Git Bash, and npm uses `cmd.exe`.
- **Symlinks for dependency folders**: need Developer Mode or admin rights on Windows.
- **Moving the config folder to `%APPDATA%`**: follows Windows' convention, but the docs and the two agents' folders all live under the home folder.
- **A Windows CI job that doesn't block**: it would stay red and be ignored.

## Consequences

- Every PR waits for the Windows job, which is usually slower than Ubuntu.
- The real Task Scheduler registration, the console window, hooks with and without Git Bash, and Codex's `commandWindows` are checked by hand on a real Windows machine, since GitHub's Windows runners run as admin.
- WSL2 keeps working as before (ADR-0038) and stays the way to get sandboxed merge runs on Windows.
