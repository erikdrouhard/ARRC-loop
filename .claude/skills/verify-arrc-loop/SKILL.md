---
name: verify-arrc-loop
description: Prove arrc-loop's public behavior the way a consumer sees it — pack the library, install the tarball into a scratch project, call `runARRC` through `import "arrc-loop"`, and check decisions, outputs and the README result contract. Use after changing anything under src/, before claiming a decision path (approve/narrow/revise/escalate/reject) works, or when unit tests pass but you need proof through the shipped package.
---

# Verify arrc-loop

arrc-loop is a TypeScript library with one user surface: `runARRC(input)` imported from the published package (README "Quick Start"). There is no server or UI. A verification run therefore means: build `dist/`, `npm pack` it, install that tarball into a throwaway consumer project, and drive cases through `import { runARRC } from "arrc-loop"` — the exact path a user's code takes. Unit tests in `tests/` import `src/` directly and skip the build, packaging and `exports` map, so they are not proof of shipped behavior.

Everything goes through one helper, run from the repo root:

```bash
.claude/skills/verify-arrc-loop/scripts/arrc-verify <launch|doctor|drive|cleanup>
```

Requires Node 22+ and npm. No network is needed after `node_modules/` exists (the package has zero runtime deps).

## Launch

```bash
ARRC_VERIFY_RUN_ID=my-run .claude/skills/verify-arrc-loop/scripts/arrc-verify launch
```

- Runs `npm ci` if `node_modules/` is missing, then `npm run build`, `npm pack` into `${TMPDIR:-/tmp}/arrc-verify-<run-id>/`, and installs the tarball into `…/consumer/`.
- Ready when it prints `READY run=<id> consumer=<dir> evidence=<dir>`. Any failure prints `FAIL …` with the log path (`build.log`, `install.log` in the evidence dir).
- `ARRC_VERIFY_RUN_ID` is optional (defaults to a UTC timestamp + pid). Later commands use it if set, else the last launch recorded in `artifacts/verify-arrc-loop/.current-run`.
- Runs are isolated: each run id has its own scratch dir and evidence dir, so parallel runs are safe as long as they use different ids.
- Launch snapshots `src/`. **Any edit to `src/`, `package.json` or `tsup.config.ts` after launch makes the install stale — launch again.**

## Doctor

```bash
.claude/skills/verify-arrc-loop/scripts/arrc-verify doctor
```

Read-only. Every line must be `OK`; exit code is non-zero otherwise. It checks that the run's scratch dir was created by this tool, the tarball is unmodified, the installed version equals `package.json`'s, `src/` has not changed since launch (stale-build detection), and the consumer resolves `arrc-loop` and gets a `runARRC` function. Run it first whenever a result looks surprising.

## Drive

```bash
.claude/skills/verify-arrc-loop/scripts/arrc-verify drive .claude/skills/verify-arrc-loop/cases/overconfident-claims/*.json
.claude/skills/verify-arrc-loop/scripts/arrc-verify drive .claude/skills/verify-arrc-loop/cases/*/*.json   # whole map
```

Each case file is `{ feature, name, input, expect }`. `input` is passed verbatim to `runARRC`. `expect` keys, all optional: `decision`, `shouldShip`, `tier`, `output` (exact string), `rounds` (count), `coverageAdequate`, `dimensionsAttemptedInclude`, `reasonsInclude`, `reasonsExclude` (substring matches). To probe a new input, copy a case file into the scratchpad, edit it, and drive that path.

Besides `expect`, every case is checked against the README contract:

- `shouldShip` is true exactly when `decision` is `approve` or `narrow`.
- `reject` carries no `output`; every other decision does.
- Nothing ships after a loop unless `coverage.coverageAdequate` (core invariant).
- `convergence.roundsCompleted === rounds.length`; each round has one verification per challenge; each `revisedSpan` matches the round's output at its offsets.
- A dimension listed in `coverage.dimensionsAbstained` never produced a challenge.

Output is one line per case: `PASS|FAIL <feature>/<case> decision=… ship=… -> <evidence path>`, followed by each failed check. Exit code is non-zero if any case fails.

## Evidence

Written to `artifacts/verify-arrc-loop/<run-id>/` (gitignored), which survives cleanup:

- `state.env` — run id, git rev, tarball sha256, version, src fingerprint.
- `build.log`, `install.log`.
- `<feature>/<case>.input.json` — exactly what was passed to `runARRC`.
- `<feature>/<case>.result.json` — the full `ArrcResult` (rounds, challenges, verifications, revisions, coverage).
- `<feature>/<case>.verdict.json` — PASS/FAIL, headline fields, reasons, and every failed check.

Proof standards:

- Drive through the installed package only. Do not import `src/`, call `resolveARRC` with hand-built state, or otherwise reach internals to make a decision path appear.
- A decision is not proof by itself. Check the action (input), the resulting state (`output`, `rounds`, `coverage`), and the reasons together; the `.result.json` holds all three.
- When a journey fails, report it with the failed checks and the evidence path. Never loosen `expect` to make a case pass. If the expectation itself is wrong, say why using the README contract.
- If you changed `src/`, the proof must come from a run launched after the change (doctor enforces this).

## Cleanup

```bash
.claude/skills/verify-arrc-loop/scripts/arrc-verify cleanup
```

Removes only `${TMPDIR:-/tmp}/arrc-verify-<run-id>/`, and only if it contains this tool's `state.env`. It never kills processes (none are started) and never touches `artifacts/`. It prints the evidence location; confirm the files are still there. Run cleanup after failed iterations too. Delete old `artifacts/verify-arrc-loop/<run-id>/` dirs by hand when they are no longer needed.

## Feature map

`features/README.md` indexes the user-facing decision paths and links one recipe per feature. `cases/<feature>/` holds the driven inputs. When behavior changes, update the map and cases in the same change.

## Not covered

- `examples/*/basic.ts` import `../../src/index.js` and need a TS runner (`tsx`) that is not a dependency, so they are not runnable as-is. The cases under `cases/` mirror their inputs.
- Typings (`dist/index.d.ts`) are built but not type-checked from the consumer side.
