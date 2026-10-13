# Persona gate

A persona draft that names a voice but defines no refusal boundaries is challenged for durability, the challenge is verified, local repair is impossible, and the run returns `revise` (upstream rewrite needed) with the draft unchanged and `shouldShip: false`.

## Sub-features

- `persona-boundaries` returns `revise` citing `persona:missing-boundaries`, with the original draft as output.

## How to get to it (user POV)

- Call `runARRC({ draft: "I can answer as the brand voice, but the persona constraints are not written down yet.", taskType: "persona", metadata: { requiresPersonaDurability: true } })`.

## Driving it with arrc-verify

Preconditions:

- Baseline preconditions from the index hold.

- **No refusal boundaries.** Run `$V/scripts/arrc-verify drive $V/cases/persona-gate/no-refusal-boundaries.json`. `PASS` with `decision=revise ship=false`; `.result.json` has `tier: 3`, round 1 with an accepted `persona:missing-boundaries` challenge and no `revision` (nothing could be patched), and `output` equal to the input.

## Gotchas

- Persona gaps are never text-patched, so `output` always equals the input on this path. The round has no `revision` object, so `unresolvable` is not visible in the result; the `revise` decision and the reason are the proof.
- The verifier's persona check is draft-wide: any of "never", "refuse", "will not", "cannot" anywhere in the draft counts as a boundary.
