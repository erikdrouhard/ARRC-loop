# Trigger Strategies

Not every output needs the same amount of ARC pressure. A useful system decides how much scrutiny to apply before paying the cost of deeper loops.

## Tier 0: Bypass

Use when the task is trivial, low-stakes, and not action-bearing.

Examples:

- casual banter
- tiny formatting changes
- low-cost rewrites

## Tier 1: Light ARC

Use as the default screen for many user-visible outputs.

Checks:

- contradiction
- instruction miss
- tool mismatch
- persona break
- policy drift
- obvious overconfidence

## Tier 2: Deep ARC

Use when the answer has more ways to fail.

Triggers:

- tools were used
- the answer is multi-step
- multiple agents disagree
- confidence is low
- constraints are numerous
- stakes are meaningful

## Tier 3: Full ARC Loop

Use when the cost of a bad handoff is high.

Triggers:

- action-bearing output
- schema or workflow correctness matters
- persona durability matters across turns
- policy durability matters under pushback
- the user explicitly asks for rigorous review

## Reference Hook

```ts
import { selectARCTier } from "arc-judge";

const tier = selectARCTier({
  usedTools: true,
  highStakes: true,
  userRequestedVerification: true,
});
```

The tier should shape:

- how many challenges to generate
- whether to do more than one round
- whether a failing judgment should revise, narrow, or escalate
