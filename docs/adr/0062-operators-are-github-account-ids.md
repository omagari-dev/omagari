---
status: accepted
---

# Operators are GitHub account ids, not logins

`OMAGARI_OPERATORS` (ADR-0052) named operators by GitHub login. A login can change hands: when an operator renamed or deleted their account, the name could be taken by someone else, and that person would become an operator. The third security audit (#472) found it (#500).

- **New form: `id:<GitHub account id>`.** The id stays with the account when its name changes. Operators are matched by the id of the account's row in `people`. Find it with `gh api users/<login> --jq .id`.
- **Logins still work.** A login in the old form is bound once to the account that has it, when that account signs in, or at start if its row already exists. After that, only that account is an operator. Someone who later takes the name is not. Set the `id:` form as soon as you upgrade, because the binding is made at the first sign-in or start after the upgrade.
- **Nothing else changes.** Access requests (ADR-0052) still need at least one operator, and the operators' web still works the same.

## Considered Options

- **Keep logins and clear the operator on rename.** The server can't see a rename or deletion on GitHub until the person signs in again, so a gap would remain.
- **Only ids, with logins refused.** Clean, but it breaks every existing `OMAGARI_OPERATORS` setting at upgrade. Binding the login once keeps them working.
