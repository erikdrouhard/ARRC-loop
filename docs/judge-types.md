# Judge Types

ARC Judge is a pattern, not a single fixed rubric. The judge should be specialized to the failure modes of the artifact being gated.

## Reasoning ARC Judge

Focus:

- hidden assumptions
- contradiction
- unsupported inference
- evidence mismatch
- overclaiming

Use when evaluating analytical answers, research summaries, or multi-step plans.

## Persona ARC Judge

Focus:

- staying in character under pressure
- tone durability across turns
- goal drift
- compliance with persona boundaries

Use when the artifact is judged partly by consistency of voice, stance, or role behavior.

## Policy ARC Judge

Focus:

- boundary consistency
- susceptibility to emotional pushback
- exception handling
- escalation correctness

Use when a response must hold under repeated attempts to bend the rules.

## Schema ARC Judge

Focus:

- brittleness
- underspecification
- unsafe optionality
- field ambiguity
- downstream handoff risk

Use when a schema can be syntactically valid but still unsafe to drive generation or automation.

## Support ARC Judge

Focus:

- customer-facing clarity
- policy adherence
- escalation thresholds
- confidence language
- actionability under incomplete information

Use when messages need to survive both user pressure and operational constraints.
