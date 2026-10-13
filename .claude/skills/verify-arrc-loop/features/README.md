# arrc-loop verification map

This directory is the maintained source for verifying arrc-loop's user-facing behavior: the termination decision `runARRC` returns for a draft. Read this index before driving, then use the matching feature file as the recipe.

## Baseline preconditions

- `arrc-verify launch` printed `READY` for the current run id, after your last edit to `src/`.
- `arrc-verify doctor` prints only `OK` lines.
- Commands below are run from the repo root. `$V` means `.claude/skills/verify-arrc-loop`.

## Driving conventions

- Drive only through `$V/scripts/arrc-verify drive <case.json>`. It imports the installed tarball, not `src/`.
- `runARRC` is deterministic and stateless; cases do not need restoring between runs and can run in any order.
- Treat case inputs as literal. Changing whitespace or punctuation in a draft changes spans, issue keys and tiers.

## Proof and skip reporting

- Proof is the `.verdict.json` plus `.result.json` for the case, under `artifacts/verify-arrc-loop/<run-id>/<feature>/`.
- Record the run id and the case path with every claim.
- A failing case is reported as failing, with its failed checks. Do not substitute a different input that passes.
- Do not report a feature verified from unit tests or from `resolveARRC` with hand-built state.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior, then exactly four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with arrc-verify` (starts with `Preconditions:`), `Gotchas`.

## Features

- [Entry guards](./entry-guards.md) covers empty-draft rejection and the low-risk tier-0 bypass.
- [Overconfident claims](./overconfident-claims.md) covers the README quick-start: factual challenge → scoped revision → `narrow`.
- [Schema gate](./schema-gate.md) covers brittle schemas escalating at tier 3.
- [Policy gate](./policy-gate.md) covers policies missing deny/escalate boundaries.
- [Persona gate](./persona-gate.md) covers personas without refusal boundaries returning `revise`.
