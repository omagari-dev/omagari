---
status: accepted
---

# Short waits say when they're stuck and send a report

#520 threw no error: after approving on GitHub, the sign-in screen showed "Waiting for you to approve on GitHub…" forever. Error reports (ADR-0063) can't catch that. @Pancheble decided on 2026-11-24 (`docs/error-reports-questions.md` Q5) that waits which should end in seconds notice when they don't.

- **Which waits.** Only waits that should end within seconds: the sign-in screen after GitHub returned a session or after the person said they approved, and the blank "checking" screen while the web loads who you are and your workspaces. Waits that are meant to be long stay as they are: an access request waiting for an operator, a merge run, an agent's answer.
- **After 1 minute** the screen says it's taking longer than it should and offers "Try again". At the same moment it sends a stuck report (an error report of kind `stuck`) with the screen and the step it was on, and how long it waited. Pressing "Try again" doesn't send another.
- **Waits that already have a limit** report when the limit passes: the runner update card's 3 minutes (ADR-0061) sends a stuck report as it falls back to the command.
- Stuck reports follow the same off switches, masking, grouping and 30 days as other error reports.

## Considered Options

- **Only show "Try again", no report**: the person gets unstuck, but we still don't hear about the bug.
- **A timeout on every wait**: long waits would report noise, and the operator would learn to ignore the list.
- **Leave it out**: #520 would stay invisible.

## Consequences

- Each new short wait has to be added to this list on purpose. A wait that's missing still hangs silently.
- 1 minute is a guess for "should take seconds". If real reports show slow networks tripping it, raise it.
