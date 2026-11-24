# Merge runs and the check command

A merge run merges two works for a moment and runs the repo's check command on the result. It shows whether a guessed indirect conflict really breaks. It runs on a member's machine, inside a sandbox, never on the server.

## Check command

The team sets the check command by committing `.omagari.json` at the repo root and merging it into the default branch. `setup` (a command that runs once before the check) is optional.

```json
{ "check": "npm test", "setup": "npm ci" }
```

The runner only reads the version merged into the default branch (the remote tracking branch), so it's the same for every member. **Settings → Merge run** on the web shows what it read, or why it couldn't.

To see whether the sandbox and the check command work on this machine, run it once against your current work in the current folder:

```bash
omagari runner check
```

## Sandbox

The sandbox blocks outside network access, writes outside a temp folder, and reading your home folder.

- **macOS**: nothing extra to install.
- **Linux and WSL2**: install bubblewrap, socat, and ripgrep. On Debian or Ubuntu: `sudo apt install bubblewrap socat ripgrep`.
- **Native Windows**: there's no sandbox yet. See [Windows](#windows).

Without a sandbox tool, the runner still works, but it doesn't run merge runs, and the web says this machine has no sandbox tool.

## Windows

Native Windows (PowerShell, no WSL2) observes and shares like everywhere else. Merge runs there are **off** until you turn them on, because Windows has no sandbox yet that holds the check command in. The verdict on that machine is "Could not run", with the reason. Verdicts from teammates' machines still show.

You have two ways to get merge runs on Windows:

- **Sandboxed, through WSL2.** Run the runner inside WSL2, with the Linux tools installed there, as on Linux. See [Set up a machine](setup#windows).
- **Without a sandbox.** Turn them on below, and accept the risk.

### Without a sandbox

- **Off (the default):** no merge runs on this machine. Teammates' verdicts still show. For sandboxed merge runs, use WSL2.
- **On:** merge runs run here as your Windows account, with no sandbox. The check command runs in `cmd.exe`, the same shell npm uses for scripts, so `npm test` works as it does elsewhere.

What still holds when it's on:

- The check command comes from `.omagari.json` on the default branch, never from the server.
- Tokens and keys aren't passed in the environment.
- Each run uses a fresh temp worktree with its own Git folder.
- The 5-minute limit applies.
- Everything the command started is stopped when the run ends.

What isn't blocked: reading your home folder, the outside network, and writing outside the temp folder.

**The risk:** teammates' unpushed code comes through the server and runs as your Windows account. If the server is broken into, or a teammate's test is malicious, it can read your SSH keys, tokens and browser cookies. Only turn it on if you trust the server and everyone in your workspaces.

**How to turn it on.** `omagari setup` asks the first time you run it on Windows. To ask again, run this in PowerShell, in a terminal yourself:

```bash
omagari setup --merge-check unsandboxed
```

It shows the warning above, and turns it on only when you type `yes`. Anything else, Enter included, leaves it off. The answer becomes this machine's default. A repo with no choice of its own follows it.

An agent that can only write files can't turn it on. The yes isn't in any file, and without a terminal nothing is saved; the command tells you to run it yourself.

An agent with its own shell is different. It runs as your Windows account, so it can change the same registry key, and nothing in Omagari stops it, the same as any other program you run as yourself. Keep that in mind when you let an agent run commands on this machine. The switch only keeps files from turning merge runs on.

**How to turn it off.** `omagari setup --merge-check off` changes this machine's default at once. To change just one repo, run `omagari runner --merge-check off` in its folder. The web shows the state as **On, no sandbox** in **Settings → Merge run**.

## Reading the verdict

| Verdict | What it means |
|---|---|
| Passes | Passes when merged, so the post closes |
| Fails | Breaks when merged, while both pass on their own. The post gets **Confirmed** |
| Can't tell | One side or both break even on their own |
| Could not run | No check command, no sandbox tool, a direct conflict in the way, or it hit the 5-minute limit. On Windows, merge runs are off. This never counts as a pass |
| Stale result | The content changed, so it runs again once things settle down |

Press **View output** to see what the check printed.

## Turning merge runs off

On macOS, Linux, and WSL2 merge runs are on by default. On native Windows they're off until you turn them on (see [Windows](#windows)). To turn them off on this machine, run `omagari setup --merge-check off`. To turn them off for one repo, start the runner there with `omagari runner --merge-check off`. Turning them on and off happens on the runner, not the web, so the server can't decide what runs on your machine. Verdicts other members' runners ran still show.
