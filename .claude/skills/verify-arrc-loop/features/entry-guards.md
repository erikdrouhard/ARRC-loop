# Entry guards

Before any challenge loop, `runARRC` rejects drafts that are empty after trimming and approves low-risk drafts without running the loop (tier 0 bypass), returning the draft unchanged.

## Sub-features

- `guard-empty` rejects an empty or whitespace-only draft with no output.
- `guard-bypass` approves a draft with no risk signals and no risky metadata, with zero rounds.

## How to get to it (user POV)

- Call `runARRC({ draft: "   " })`.
- Call `runARRC({ draft: "Thanks, I updated the formatting." })` with no `metadata`.

## Driving it with arrc-verify

Preconditions:

- Baseline preconditions from the index hold.

- **Empty draft.** Run `$V/scripts/arrc-verify drive $V/cases/entry-guards/empty-draft.json`. `PASS` with `decision=reject ship=false`; `.result.json` has no `output` and `rounds: []`.
- **Low-risk bypass.** Run `$V/scripts/arrc-verify drive $V/cases/entry-guards/low-risk-bypass.json`. `PASS` with `decision=approve ship=true`; `.result.json` has `tier: 0`, `rounds: []`, and `output` equal to the input draft.

## Gotchas

- Any `metadata` trigger (`highStakes`, `usedTools`, `lowConfidence`, `agentDisagreement`, …) forces tier ≥ 2 and disables the bypass, even for harmless text.
- A single absolute word ("always", "never", "must", "every", "none") with no hedge or evidence marker lifts the classifier to tier 3. "Low-risk" inputs must avoid them.
