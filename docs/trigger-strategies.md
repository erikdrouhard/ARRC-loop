# Trigger Strategies

Not every output needs the same amount of challenge pressure. The tier system decides how much scrutiny to apply before paying the cost of deeper loops.

## Tier 0: Bypass

Use when the task is trivial, low-stakes, and not action-bearing.

Examples:

- casual banter
- tiny formatting changes
- low-cost rewrites

## Tier 1: Light Screen

Use as the default screen for many user-visible outputs. One pass.

Checks:

- contradiction
- instruction miss
- tool mismatch
- persona break
- policy drift
- obvious overconfidence

## Tier 2: Standard Loop

Use when the answer has more ways to fail.

Triggers:

- tools were used
- the answer is multi-step
- multiple agents disagree
- confidence is low
- constraints are numerous
- stakes are meaningful

## Tier 3: Deep Loop

Use when the cost of a bad handoff is high. Broader challenge coverage, stricter escalation sensitivity.

Tier 3 does **not** lower proof standards. It increases challenge breadth and escalation sensitivity.

Triggers:

- action-bearing output
- schema or workflow correctness matters
- persona durability matters across turns
- policy durability matters under pushback
- the user explicitly asks for rigorous review

## Reference Hook

```ts
import { selectArrcTier } from "arrc-loop";

const tier = selectArrcTier({
  usedTools: true,
  highStakes: true,
  userRequestedVerification: true,
});
```

The tier shapes:

- how many challenge dimensions are explored
- how many rounds the loop runs
- whether a stable-but-weakly-covered result escalates or approves
