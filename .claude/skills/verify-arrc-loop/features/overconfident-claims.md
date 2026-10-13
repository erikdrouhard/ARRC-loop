# Overconfident claims

A draft that makes absolute claims without evidence is challenged on the factual dimension, the verified challenge triggers a scoped revision that softens only the targeted sentence, round 2 re-challenges the revised span, and when nothing survives the loop returns `narrow` with the revised output and `shouldShip: true`. This is the README Quick Start path.

## Sub-features

- `oc-narrow` softens absolutes ("always"→"usually", "never"→"rarely") and returns `narrow`.
- `oc-scoped` leaves sentences outside the challenged span byte-identical.
- `oc-coverage` reports coverage as adequate, with no abstained dimension, after a cleared round-2 re-challenge.

## How to get to it (user POV)

- Call `runARRC({ draft: "The API always returns JSON and never fails silently.", taskType: "reasoning", maxRounds: 2, metadata: { highStakes: true } })` (README Quick Start).
- Call `runARRC` with any multi-sentence draft where one sentence carries an unhedged absolute, plus `metadata.highStakes`.

## Driving it with arrc-verify

Preconditions:

- Baseline preconditions from the index hold.

- **Quick-start draft.** Run `$V/scripts/arrc-verify drive $V/cases/overconfident-claims/readme-quickstart.json`. `PASS` with `decision=narrow ship=true`. In `.result.json`: `output` is `The API usually returns JSON and rarely fails silently.`, round 1 has an accepted `factual:always:0` challenge with a revision, round 2 has no challenges, `coverage.dimensionsAbstained` is `[]`, and `coverageNotes` says `Scoped revisions held.`
- **Untouched regions.** Run `$V/scripts/arrc-verify drive $V/cases/overconfident-claims/untouched-regions.json`. `PASS` with `decision=narrow`; `output` changes only the first sentence and keeps `The changelog is in docs/CHANGES.md.` byte-identical.

## Gotchas

- Before the coverage-accounting fix, both cases escalated with `Abstained on dimensions: factual` even though the factual challenger had produced the challenge. If that reason reappears, the regression is back.
- `maxRounds: 1` (or a tier-1 draft) leaves no round to re-check the revision, so `budgetExceeded` is set and the result is `escalate`, not `narrow`. That is by design.
- Drafts with "because"/"therefore" and an absolute also flag the logical dimension. Its challenger re-fires on the revised sentence under the same issue key, so the loop reports oscillation and escalates (e.g. `This plan will always work because the architecture is simple.`). This is a known limitation of the logical challenger/reviser pair, not a pass.
- Repeating the same sentence twice makes both challenges target the first occurrence (`findSpan` uses `indexOf`). The second ends up `unresolvable` and the run escalates on budget.
