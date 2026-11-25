---
status: accepted
---

# Indirect conflict alerts say what the definition line was and became

An indirect conflict (guessed) alert named the symbol and both sides' `path:line`, so the agent that uses the symbol had to go and find out what changed. NP-Bench (arXiv 2610.07261) found that a file-only warning ("a teammate may be editing XX") did no better than no coordination, and "Passes Alone, Fails Together" (arXiv 2609.25396) found that a ~130-token message saying what the change became (new names, required arguments, return types) recovered 82% of broken runs. @Pancheble asked for this on 2026-11-25 (#539).

- **The runner that changed it sends the text.** `Definition` gets `before` (the base commit's definition line) and `after` (now) for `changed`, and `before` for `removed`, whitespace folded as tree-sitter's header already is (ADR-0026). Overloads are joined with ` | `. The using side's runner copies them into the alert's `SymbolPlace`.
- **It follows the share level for free.** Definitions only ride where content does (`full`, or a `declared` work's claimed paths), and the server already drops them with the content. Under `declared` an unclaimed file sends only its path, and `intent` sends nothing, so no text and no alert. When a place has no text, the alert shows the line number only, as before.
- **Capped at 200 characters per side** (`MAX_DEFINITION_CHARS`), cut with `…`. 200 is the status line's cap too, and before plus after is about 100 tokens, near the paper's ~130-token message. With 8 symbols an alert stays around 3,200 characters of text, inside the 10,000-character inbox.
- **Quoted as data**, like branch names and paths. The inbox header now lists "definition line" among the quoted data.
- **It doesn't linger** (ADR-0054). The server's cleanup job drops the text from an indirect alert once it's resolved or hasn't changed for 30 days.

## Considered Options

- **The using side's runner reads the text from the other side's content**: the "after" is in the content, but the "before" needs the other side's base commit, which may not be on this machine. Two code paths for one line.
- **Send the whole declaration or the diff hunk**: more tokens, and the body isn't the contract.
- **No cap**: an interface or type is all definition line, and could fill the inbox.

## Consequences

- An alert updates (and news goes out again) when the other side changes the definition line again, even if the line number stays.
- The web gets the text in the alert too but doesn't show it yet.
- Duplicate work (`added`) carries no text; add `after` there if it turns out to help.
