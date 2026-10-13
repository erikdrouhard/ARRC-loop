# Policy gate

A policy draft that states what is allowed but not what is denied or escalated is challenged on the policy dimension, the missing boundaries are verified, and the run escalates without shipping.

## Sub-features

- `policy-missing` escalates a policy missing deny and escalate boundaries, citing the missing kinds in the issue key.

## How to get to it (user POV)

- Call `runARRC({ draft: "We should help where we can.", taskType: "policy", metadata: { highStakes: true, userRequestedVerification: true } })`.

## Driving it with arrc-verify

Preconditions:

- Baseline preconditions from the index hold.

- **Missing boundaries.** Run `$V/scripts/arrc-verify drive $V/cases/policy-gate/missing-boundaries.json`. `PASS` with `decision=escalate ship=false`; `.result.json` has `tier: 3`, `coverage.dimensionsAttempted` containing `policy`, and a reason citing `policy:missing-boundaries:deny,escalate`.

## Gotchas

- A complete policy (allow, deny and escalate all stated) also escalates because the policy challenger abstains and coverage is inadequate. Do not use it as an `approve` case.
- Vague phrases like "may be" or "in special cases" are revised in place by appending `(criteria to be specified)`, but overlapping challenges and later rounds stack it: `Refunds may be granted in special cases.` comes back with the marker four times and escalates on oscillation. Known reviser bug; do not encode the stacked output as expected.
