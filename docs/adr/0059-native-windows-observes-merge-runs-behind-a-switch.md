---
status: accepted
---

# Native Windows observes; merge runs there only with a switch the person turns on

Today Windows works only inside WSL2 (ADR-0038), because native Windows has no sandbox that keeps the blocks of ADR-0033. A Windows user without WSL2 has no runner, so their conflicts are never caught early. Decided on 2026-11-23 by @Pancheble, details settled in the stage 8 grilling (`docs/stage8-questions.md` Q1–Q4, Q7, Q8).

- **The runner observes on native Windows.** Observation runs no one's code, so it needs no sandbox. The runner, the CLI and the hooks run in PowerShell (ADR-0060).
- **Merge runs on native Windows have a switch.** It stays until sandbox-runtime's Windows backend closes the holes listed in #168.
  - **Off (the default)**: no merge runs on this machine. The verdict is "could not run", with the reason: use WSL2 for sandboxed merge runs, or turn on unsandboxed merge runs. Verdicts that teammates' machines ran still show.
  - **On**: merge runs run without a sandbox, as the person's Windows account. The person accepts the risk.
- **The risk, said plainly** wherever the switch shows (setup, the CLI, the docs): teammates' unpushed code comes through the server and runs as your Windows account. If the server is broken into, or a teammate's test is malicious, it can read your SSH keys, tokens and browser cookies (ADR-0033).
- **`omagari setup` asks on Windows.** It shows what on and off do and the risk, and turns it on only when the person types `yes` in a terminal. When an agent ran setup (no terminal), it stays off, and setup says how to turn it on in a terminal. People who try Omagari often wonder why merge runs don't happen, so the choice is part of the first setup instead of buried in the docs.
- **Only a person turns it on.** Turning it on, in setup or with `omagari runner --merge-check unsandboxed`, needs a typed `yes` in a terminal and is refused otherwise. An agent, or a prompt injected into one, can't turn it on. Anyone can turn it off.
- **Setup's answer is this machine's default; each repo can differ.** A repo starts with the machine's default. `--merge-check off|on|unsandboxed` in a repo folder changes that repo, as today. `omagari setup --merge-check unsandboxed|off` changes the default. Running `setup` again keeps the earlier answer and doesn't ask again.
- **The web shows it, never changes it.** Settings → Merge run shows "on, without a sandbox". The server still can't decide what runs on a member's machine (ADR-0033).
- **Only native Windows.** A Linux machine without bubblewrap still installs the tools; its merge runs stay "could not run" until it does.

## What still holds when it's on

The rest of ADR-0033 stays: the check command comes from the repo file, never the server; the server can't order a merge run; tokens and keys aren't passed in the environment; the runner's Git folder is kept apart from the temp worktree's (#144); each run uses a fresh place (#150); the 5-minute limit; the whole process tree is stopped at the end; the output goes to agents as data only. What it doesn't block: reading the home folder, the outside network, and writing outside the temp folder.

## Considered Options

- **Only WSL2** (ADR-0038 as it was): a Windows user without WSL2 has no runner at all, so even direct conflicts aren't caught.
- **Observe only, never merge runs on Windows**: safe, but the first thing people try (does merging break?) silently doesn't happen, and they don't know why.
- **On by default**: people would run teammates' code unsandboxed without knowing.
- **sandbox-runtime's Windows alpha (`srt-win`) or the MXC backend**: they don't keep ADR-0033's blocks yet (ADR-0038, #168). Saying "sandboxed" when code written to escape gets out would be worse than saying "no sandbox".
- **One switch per machine**: simplest, but a person who trusts one team and not another can't tell them apart. Room trusts per room: "a team room trusts everyone it admits" (Room README), and its `room_preview_merge` runs the combined code with no sandbox (`docs/reference.md`).
- **Ask when a repo is first shared**: sharing also happens on the web, which can't turn the switch on.
- **The same switch on any machine without a sandbox**: on Linux and macOS the sandbox is a package away.

## Consequences

- Amends ADR-0033: there is now one path that runs without a sandbox, on native Windows, only when the person turned it on.
- Supersedes ADR-0038's native Windows row ("doesn't run, use WSL2"). WSL2 stays the way to get sandboxed merge runs on Windows.
- The contract's merge-run state gains "on, without a sandbox", so the web can show it.
- When #168 finds a Windows sandbox that keeps ADR-0033's blocks, merge runs on Windows go back to sandboxed only, and this switch goes away.
