# Stage 8 grilling: questions, what we answered ourselves, what's open

The scope is the milestone "8 Windows": Omagari on native Windows (PowerShell), without WSL2. The input is @Pancheble's direction from 2026-11-23: Windows users should catch conflicts without installing WSL2, observation needs no sandbox, and merge runs on native Windows get a switch the person turns on and off until sandbox-runtime's Windows backend closes the holes in #168.

Where we looked, in the order AGENTS.md asks: `GLOSSARY.md`, ADR-0033, 0037, 0038, 0049, 0050, `site/setup.md`, `site/merge-runs.md`, #168, the code (sockets, service registration, hook commands, the check command, paths, spawning, the test harness, CI), how Room handles trust and Windows, and the docs of Claude Code, Codex, sandbox-runtime and Windows. Sources are at the end.

Running example used in every question: Minjun uses Claude Code in PowerShell on a Windows laptop and hasn't installed WSL2. The team repo is `acme/shop`, and Minjun works with Jisu, who is on macOS.

## 0. Decided

@Pancheble decided Q1–Q8 on 2026-11-23.

| #   | Decided                                                                                                                       | Recorded in |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Q1  | The switch is off by default, and `omagari setup` on Windows shows the risk and asks whether to turn it on                    | ADR-0059    |
| Q2  | Per repo, a new value of the existing `--merge-check` switch. The web shows the state and never changes it                    | ADR-0059    |
| Q3  | Only a person turns it on: a typed `yes` in a terminal; refused when there's no terminal. Anyone can turn it off              | ADR-0059    |
| Q4  | Only native Windows                                                                                                           | ADR-0059    |
| Q5  | Task Scheduler for the background runner; the per-user Run key if a non-admin can't create the task                           | ADR-0060    |
| Q6  | A Windows CI job on every PR that blocks the merge when it fails                                                              | ADR-0060    |
| Q7  | Setup's answer is the machine's default; each repo can differ with `--merge-check`; `setup --merge-check` changes the default | ADR-0059    |
| Q8  | Setup's wording on Windows, below                                                                                             | ADR-0059    |

## 1. What we asked

### Q1. The switch's default

After `omagari setup`, Minjun's runner observes right away. Is the merge-run switch on or off at first?

- A. Off: whether Jisu's and Minjun's works break when merged doesn't run on Minjun's machine ("could not run"). Verdicts Jisu's Mac ran still show.
- B. On: runs right away, but Minjun runs Jisu's unpushed code as their own account without knowing the risk.

Recommended A. @Pancheble: off, but put turning it on into the first setup, because people who try it will wonder why merge runs don't happen.

### Q2. Per repo or per machine

`omagari runner --merge-check on|off` already exists and is kept per repo. Minjun works in `acme/shop` (a team they trust) and `oss/lib` (many people they don't know).

- A. Per repo: one more value for the existing switch, `omagari runner --merge-check unsandboxed`, in the `acme/shop` folder. `oss/lib` stays off. Room's "a team room trusts everyone it admits" is per room too.
- B. One per machine.

The web only shows the state, so the server can't decide what runs on a member's machine (ADR-0033). Picked: A.

### Q3. Who can turn it on

Minjun's Claude Code might decide "tests won't run, I'll turn it on" and type `--merge-check unsandboxed` itself, or do so because of an injected prompt.

- A. Only a person: turning it on shows the warning and needs `yes` typed in a terminal. Without a terminal (a command an agent ran), it refuses and says a person has to do it. Anyone can turn it off right away.
- B. Show the warning and turn it on.

Picked: A.

### Q4. Only Windows

A Linux machine that can't install bubblewrap is "could not run" today too.

- A. Only native Windows. Other OSes keep being told to install the sandbox tools.
- B. Every machine that can't use a sandbox.

Picked: A. The reason for this stage is that Windows has no sandbox that keeps the blocks yet; on Linux it's a package away.

### Q5. The background runner on Windows

macOS uses launchd and Linux systemd; both start it at login and restart it when it dies.

- A. Task Scheduler: starts at Minjun's logon and has a restart-on-failure setting. Whether a non-admin can create a task for their own account is checked on real Windows; if not, fall back to B. (ADR-0049 rejected it only because the runner didn't run on Windows.)
- B. The per-user Run key: no admin rights, simplest, but nothing restarts it, so the runner restarts itself.
- C. A Windows service: needs admin rights.

Either way, how to keep a console window from showing is checked on real Windows. Picked: A.

### Q6. Windows CI

CI runs only on Ubuntu today. Catching changes that break Windows on every PR means running `npm test` on `windows-latest` too. Free for a public repo, but Windows machines are usually slower.

- A. Every PR runs typecheck and `npm test` on Windows too, and a failure blocks the merge.
- B. Every PR, but a failure doesn't block.
- C. Only after merging into `dev`.

Picked: A. A job that doesn't block soon stays red.

### Q7. How far setup's answer goes

Minjun types `yes` in setup, and next week shares `oss/lib` for the first time.

- A. Setup's answer becomes this machine's default, so both repos start on. A repo changes on its own in its folder (`omagari runner --merge-check off`). `omagari setup --merge-check unsandboxed|off` changes the default. Running `setup` again keeps the earlier answer and doesn't ask again.
- B. One switch per machine (reverses Q2).
- C. Setup doesn't ask; ask when a repo is first shared. Sharing also happens on the web, which can't turn the switch on (Q2).

Picked: A.

### Q8. What setup says on Windows

When a person runs setup in a terminal:

```
Merge runs on Windows
A merge run merges your work with a teammate's for a moment and runs the
check command (npm test) on this machine. Windows has no sandbox yet that
holds that code in, so here it would run as you, with no sandbox.

The risk: teammates' unpushed code comes through the server and runs as your
Windows account. If the server is broken into, or a teammate's test is
malicious, it can read your SSH keys, tokens and browser cookies.

  Off: no merge runs on this machine. Teammates' verdicts still show.
       For sandboxed merge runs, use WSL2.
  On:  merge runs run here without a sandbox. Only if you trust the server
       and everyone in your workspaces.

Turn on merge runs without a sandbox? Type yes to turn on (Enter keeps it off):
```

- When an agent ran setup (no terminal), the last line becomes: "Merge runs are off. To turn them on, run `omagari setup --merge-check unsandboxed` in a terminal yourself; an agent can't." So the line is still there when the two lines from the web's "Getting started" were pasted to an agent.
- The same warning shows when turning it on with `--merge-check unsandboxed`. The docs (`site/setup.md`'s Windows section and `site/merge-runs.md`, with their Korean pages) say the same: what on and off do, and the risk.
- What still holds when it's on: tokens and keys aren't passed in the environment; the temp worktree and the separate Git folder; the 5-minute limit; stopping the whole process tree at the end. What it doesn't block: reading the home folder, the outside network, and writing outside the temp folder. The docs say this too.

Picked as written.

## 2. Answered ourselves

- **Local sockets become named pipes.** Node on Windows listens only on `\\.\pipe\…` paths ([Node.js net](https://nodejs.org/api/net.html#identifying-paths-for-ipc-connections)). Same ids as today; nothing to remove before listening.
- **Claude Code hooks in exec form.** On native Windows, Claude Code runs a hook's `command` in Git Bash when it's installed and in PowerShell when it isn't; exec form (`command` plus `args`) skips the shell but needs a real `.exe` ([Claude Code hooks](https://code.claude.com/docs/en/hooks), [setup](https://code.claude.com/docs/en/setup): Git for Windows is optional). `node.exe` qualifies.
- **Codex hooks with `commandWindows`**, "an optional Windows-only command override" ([Codex hooks](https://learn.chatgpt.com/docs/hooks)). Which shell runs it isn't documented, so the shape is checked by hand. Codex still needs the hooks trusted once in `/hooks` (ADR-0049).
- **Setup recognizes its own hooks by the script path whatever the separators.** Today it matches `"/hooks/src/main.ts' <executor>"`, which misses Windows paths and also misses npm installs, which ship `main.js`.
- **The check command runs in `cmd.exe`**, like npm scripts on Windows. The runner stops the whole process tree, since Windows has no process groups, and links dependency folders with junctions, since symlinks need Developer Mode or admin rights.
- **`npm`, `claude` and `codex` are `.cmd` shims** and are spawned through `cmd.exe` (Node refuses `.cmd` without a shell since the CVE-2024-27980 fix). Today a failing Codex probe would quietly report Codex as missing.
- **No SIGTERM between processes on Windows.** The background runner stops through the service or its pipe and closes its runners first.
- **Paths to the server use `/`.** The pre-edit hook, `omagari claim` and `omagari impact` build paths with `path.relative`, which gives `src\a.ts` on Windows. `GIT_CONFIG_GLOBAL=/dev/null` becomes `os.devNull`.
- **The config folder stays `~\.config\omagari`**, next to `~\.claude` and `~\.codex`. `chmod` modes don't apply; the profile's permissions keep it to the person.
- **Tests fake `schtasks`** and the fakes become Node scripts with a `.cmd` wrapper. GitHub's Windows runners run as admin, so they can't show whether a non-admin can create the task; that is checked by hand.
- **WSL2 keeps working** and stays the way to sandboxed merge runs on Windows (ADR-0038).
- **sandbox-runtime's Windows backend is still alpha.** The README's known limitations still include network the fence doesn't match (system services, SMB, WSL, sockets made under the anonymous token) and no per-command `allowRead`/`allowWrite` ([sandbox-runtime](https://github.com/anthropics/sandbox-runtime)). #168 stays open to revisit.

## 3. Open

- Whether a non-admin can create the logon task, and how to keep the console window hidden (hand check; falls back to the Run key).
- The exact Codex `commandWindows` shape that runs (hand check).
- When #168's holes close, merge runs on Windows go back to sandboxed only and the switch goes away (ADR-0059).

## Sources

- [Claude Code: hooks](https://code.claude.com/docs/en/hooks) (`shell`, exec form, Git Bash or PowerShell on Windows) and [setup](https://code.claude.com/docs/en/setup) (Git for Windows optional, no sandbox on native Windows)
- [Codex: hooks](https://learn.chatgpt.com/docs/hooks) (`commandWindows`, `%USERPROFILE%\.codex\hooks.json`, trust) and [Codex on Windows](https://learn.chatgpt.com/docs/windows/windows-sandbox)
- [sandbox-runtime README](https://github.com/anthropics/sandbox-runtime) (Windows alpha, known limitations)
- [Node.js net: IPC paths](https://nodejs.org/api/net.html#identifying-paths-for-ipc-connections)
- [schtasks create](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/schtasks-create), [Run and RunOnce keys](https://learn.microsoft.com/en-us/windows/win32/setupapi/run-and-runonce-registry-keys)
- Room: README ("A team room trusts everyone it admits") and `docs/reference.md` (`room_preview_merge`)
