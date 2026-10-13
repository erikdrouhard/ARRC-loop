# Schema gate

A schema-task draft with no required-field or type constraints is challenged with constructible adversarial payloads, the challenges are verified as high severity, local repair is not attempted, and the run escalates at tier 3 with the draft unchanged and `shouldShip: false`.

## Sub-features

- `schema-brittle` escalates a draft lacking required and type constraints, citing both issue keys.
- `schema-unchanged` returns the original draft as `output`; schema gaps are never text-patched.

## How to get to it (user POV)

- Call `runARRC({ draft, taskType: "schema", metadata: { hasStrictSchema: true } })` with a loose description such as `Return an object for the form submission with whatever fields seem useful.`

## Driving it with arrc-verify

Preconditions:

- Baseline preconditions from the index hold.

- **Brittle schema.** Run `$V/scripts/arrc-verify drive $V/cases/schema-gate/brittle-schema.json`. `PASS` with `decision=escalate ship=false`; `.result.json` has `tier: 3`, reasons citing `schema:missing-required-constraints` and `schema:missing-type-constraints`, and `output` equal to the input.

## Gotchas

- A well-formed schema (`required`, `type`, error behavior all present) also escalates: the schema challenger abstains, so coverage is inadequate under the core invariant ("stability without adequate challenge coverage is not convergence"). Do not use it as an `approve` case.
- `hasStrictSchema` alone forces tier 3 even when `taskType` is not `schema`.
