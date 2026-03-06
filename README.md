# ARC Judge

[![Status: Concept](https://img.shields.io/badge/status-concept-blue)](#status)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](#license)
[![Type: Judge](https://img.shields.io/badge/type-specialized_judge-purple)](#what-is-an-arc-judge)

**Adversarial Rebuttal Calibration for LLM outputs, agents, and schemas**

ARC Judge is a specialized judge for AI systems.

A regular judge evaluates an output.  
**ARC Judge evaluates whether that output still deserves to ship after challenge.**

It is built for systems where first-pass quality is not enough.

## TL;DR

A normal judge asks:

> Is this output good?

ARC Judge asks:

> Is this output still good after the strongest plausible rebuttal?

That difference matters when you care about:

- durable correctness
- overconfidence
- weak rebuttal susceptibility
- persona drift
- policy drift
- brittle schemas
- multi-agent answer stability

## Why Not Just Use A Regular Judge?

Because a regular judge is usually static.

It looks at a draft and scores, ranks, or critiques it once. That is useful, but it misses an important failure mode:

> Some outputs look good until they are challenged.

Examples:

- A response is correct, but a confident bad rebuttal makes the model abandon it.
- A response is weak, but a judge still scores it decently because it sounds polished.
- A schema is valid, but brittle, underspecified, or semantically off.
- A persona answer is in character on turn 1, then collapses by turn 5.
- A support answer matches policy once, then drifts under emotional pressure.

A regular judge can tell you whether something looks acceptable now.  
ARC Judge helps tell you whether it is durable enough to hand off.

**Regular judge = quality check**  
**ARC Judge = durability + calibration check under pressure**

One caveat matters up front: the verifier is the hardest part of the system. Generating rebuttals is comparatively easy. Deciding which rebuttals are materially valid, which are merely confident noise, and which should actually change the ship decision is where most implementation risk lives.

## What Is A Judge?

In eval terms, a judge is a model-based evaluator that inspects outputs or traces against a rubric.

Typical judge tasks:

- score correctness
- compare candidates
- classify quality
- detect violations
- monitor traces in production

ARC Judge belongs to that family, but adds an explicit challenge loop before a decision.

## What Is An ARC Judge?

An ARC Judge is a judge that evaluates whether an output remains properly calibrated under adversarial rebuttal.

In this README, calibration is used in two related senses:

- confidence calibration: how strongly the system should believe or state a claim
- scope calibration: how broad, narrow, or conditional the shipped output should be

ARC Judge cares about both. A draft can fail by sounding too certain, and it can also fail by making claims that are too broad for the evidence behind them.

That means it does more than score. It also asks:

- what is the strongest plausible counterargument?
- is that criticism valid?
- should the output hold, revise, narrow, escalate, or reject?
- is the output stronger, weaker, or more confused after pressure?

ARC Judge is not about rewarding stubbornness. It is about rewarding correct resistance and correct revision.

## The Value Add

ARC Judge adds four things a regular judge usually does not:

### 1. Rebuttal Pressure

It introduces structured challenge against the draft.

### 2. Rebuttal Validation

It distinguishes valid criticism from weak, misleading, or irrelevant criticism.

This is the hardest operational step in the loop. If validation is weak, ARC Judge either becomes too gullible and caves to noise, or too stubborn and ignores real problems.

### 3. Calibration-Aware Decisions

It does not just score. It decides:

- `approve`
- `revise`
- `narrow`
- `escalate`
- `reject`

### 4. Durability Testing

It measures whether the output survives pressure before handoff.

## Why The Verifier Matters

The verifier is the fulcrum of ARC Judge.

Generating rebuttals is comparatively easy.
Deciding which rebuttals are actually decision-relevant is harder.

If the verifier is weak, ARC Judge fails in one of two ways:

- **gullible mode** — it caves to polished but weak criticism
- **stubborn mode** — it ignores valid criticism and over-trusts the draft

That means verifier quality matters more than rebuttal quantity.

### Verifier strategies

ARC Judge can support multiple verifier modes:

- **same-model verifier** — cheap, fast, good for light ARC
- **cross-model verifier** — better for adversarial independence
- **tool-backed verifier** — best when external checks or ground truth exist
- **ensemble verifier** — useful when the cost of error is high

In practice, the verifier should be treated as a first-class subsystem, not just one box in the loop.

## When To Use ARC Judge

Use ARC Judge when the cost of shipping a weak-but-plausible answer is meaningful.

Good use cases:

- high-stakes reasoning
- multi-step plans
- tool-backed answers
- schema-driven generation
- customer support policy answers
- persona agents
- multi-agent synthesis
- outputs with many constraints
- responses likely to face pushback

Less useful for:

- casual banter
- tiny rewrites
- low-stakes formatting
- ultra-latency-sensitive tasks

## ARC Judge Vs Regular Judge

| Capability | Regular Judge | ARC Judge |
| :--- | :---: | :---: |
| Score a draft | ✅ | ✅ |
| Compare candidates | ✅ | ✅ |
| Detect obvious issues | ✅ | ✅ |
| Generate rebuttals | ❌ | ✅ |
| Validate rebuttals | ❌ | ✅ |
| Measure durability under pressure | ❌ | ✅ |
| Decide hold/revise/narrow/escalate | Sometimes | ✅ |
| Test persona/message stability across pushback | Limited | ✅ |
| Gate schema handoff before generation | Limited | ✅ |

ARC Judge is not a replacement for regular judges.
It is the specialized judge you use when first-pass quality is not enough.

## Core Loop

```text
draft -> challenge -> validate -> revise -> judge -> ship or loop
```

1. Draft  
   A primary agent or squad produces a candidate output.
2. Challenge  
   A challenger produces the strongest plausible criticism.
3. Validate  
   A verifier checks which criticisms are actually good.
   This is usually the hardest step because the system has to separate decision-relevant rebuttals from polished noise.
4. Revise  
   The output is updated only where criticism is justified.
5. Judge  
   ARC Judge decides whether to approve, revise again, narrow claims, escalate, or reject.
6. Ship or loop  
   If the output is durable enough for the task's stakes, ship it. Otherwise, loop.

## Mental Model

A regular judge answers:

> Should this output pass inspection?

ARC Judge answers:

> Should this output survive contact with opposition before it reaches the user?

That makes ARC Judge especially useful as a pre-handoff gate.

## Architecture

Lightweight pattern:

```text
User Request
  -> Primary Agent / Squad
  -> ARC Judge
  -> User
```

Full ARC path:

```text
User Request
  -> Primary Agent / Squad
  -> Challenger
  -> Verifier
  -> Reviser
  -> ARC Judge
  -> User
```

Hook / middleware pattern:

```text
User Request
  -> Main Agent
  -> Draft Response
  -> Trigger Hook
      -> low risk: send
      -> medium/high risk: ARC Judge path
  -> User
```

## Quick Start

### Install

```bash
npm install arc-judge
```

### Basic Usage

> **Note**
> This is a conceptual starter contract, not a finalized production API.
> It is intentionally small and will evolve based on real traces, latency constraints, and verifier design.

```ts
import { runARCJudge } from "arc-judge";

const result = await runARCJudge({
  draft,
  taskType: "reasoning",
  maxRounds: 2,
  metadata: {
    highStakes: true,
    usedTools: true,
  },
});

if (result.decision === "approve") {
  return result.output;
}

if (result.decision === "revise") {
  return retry(result.revisionTargets);
}

if (result.decision === "narrow") {
  return result.output;
}

if (result.decision === "escalate") {
  return escalateToHumanOrTools();
}

throw new Error("ARC Judge rejected output");
```

## Decision Contract

```ts
export type ArcDecision =
  | "approve"
  | "revise"
  | "narrow"
  | "escalate"
  | "reject";

export interface ArcJudgment {
  decision: ArcDecision;
  confidence: number;
  output?: string;
  reasons: string[];
  acceptedRebuttals: string[];
  rejectedRebuttals: string[];
  revisionTargets?: string[];
  notes?: string[];
}
```

## Example: Why ARC Judge Matters

Case 1: Regular judge passes it.  
A draft looks polished and mostly correct. A regular judge scores it highly.

Case 2: ARC Judge challenges it.  
ARC Judge introduces the strongest plausible rebuttal:

- hidden contradiction
- missing state
- unsupported assumption
- bad interpretation of the prompt

Case 3: Result.  
The output either survives and gets approved, gets narrowed, gets revised, or gets blocked before shipping.

ARC Judge is for catching things that only appear after pressure.

## Judge Types

ARC Judge is a family of specialized judges.

- Reasoning ARC Judge  
  Tests whether an answer holds under logical or factual challenge.
- Persona ARC Judge  
  Tests whether an agent stays in character under repeated pressure.
- Policy ARC Judge  
  Tests whether a message or boundary stays consistent under pushback.
- Schema ARC Judge  
  Tests whether a valid schema is actually safe and durable to hand off to generation.

## Schema Mode

```text
User Intent
  -> Planner
  -> Schema Draft
  -> Validator
  -> ARC Judge
  -> Generator
  -> Render
```

A validator asks:

> Can this schema run?

ARC Judge asks:

> Should this schema run yet?

That distinction matters for generation systems.

## Trigger Strategy

Not every output needs a deep ARC loop.

Tier 0: Bypass  
Use for trivial, low-stakes tasks.

Tier 1: Light ARC  
Checks contradiction, instruction miss, tool mismatch, persona break, policy drift, and obvious overconfidence.

Tier 2: Deep ARC  
Use when tools were used, stakes are meaningful, the answer is multi-step, multiple agents disagree, there are many constraints, or confidence is low.

Tier 3: Full ARC Loop  
Use when the output may trigger action, schema or workflow correctness matters, persona or policy durability matters, the answer is expensive to get wrong, or the user explicitly asks for rigorous review.

```ts
function shouldTriggerARC(ctx) {
  return (
    ctx.usedTools ||
    ctx.lowConfidence ||
    ctx.agentDisagreement ||
    ctx.highStakes ||
    ctx.hasStrictSchema ||
    ctx.requiresPersonaDurability ||
    ctx.userRequestedVerification
  );
}
```

## Latency Modes

ARC Judge should not always run as a full multi-step loop.

### Inline light ARC
Use when:
- low latency matters
- risk is moderate
- one-pass screening is enough

Pattern:
- draft
- top rebuttal
- quick verification
- ship decision

### Full synchronous ARC
Use when:
- the output may trigger action
- the answer is expensive to get wrong
- tool-backed or schema-backed execution is involved

### Async shadow ARC
Use when:
- you want telemetry without blocking the user
- you are tuning thresholds
- you are collecting traces to improve verifier quality

A practical rule:

**Screen by default, stress-test selectively.**

## What ARC Judge Measures

ARC Judge is about more than first-pass quality.

- final correctness
- revision quality
- resistance quality
- justification quality
- convergence
- over-yielding
- over-stubbornness

## Outcome Ladder

- Fragile  
  The output gets worse under challenge.
- Robust  
  The output survives challenge without losing calibration.
- Antifragile  
  The output improves because of challenge.

ARC Judge is designed to distinguish these cases.

## Principles

ARC Judge should:

1. anchor to the first draft
2. challenge aggressively
3. validate criticism before accepting it
4. revise narrowly, not blindly
5. stop when stable enough for the stakes
6. prefer calibrated convergence over endless debate

## MVP Focus

ARC Judge is a broad framework, but the first implementation should be narrow.

Recommended first slice:

- **Schema ARC Judge**
- deterministic validator + lightweight rebuttal generator + verifier
- one or two hand-crafted examples
- trace-first development

Why schema first?

Because the boundary is clear:

- validator asks: "Can this run?"
- ARC Judge asks: "Should this run yet?"

That makes schema mode a good proving ground before broader reasoning or persona modes.

## FAQ

Why not just use a regular judge?  
Because a regular judge usually checks quality once. ARC Judge checks whether quality survives challenge.

Is ARC Judge just debate?  
No. Debate is one ingredient. ARC Judge is a decision layer that uses rebuttal to make a calibration judgment before handoff.

Is ARC Judge just self-refine?  
No. Self-refine focuses on improving the artifact. ARC Judge focuses on whether the artifact remains calibrated under challenge.

Should every response go through ARC Judge?  
Usually at least a light screen. Not every response needs a deep loop.

Does ARC Judge replace human review?
No. It is a calibration layer, not a guarantee of truth.

Why not make the verifier the judge?
Because the jobs are different. The **verifier** decides whether criticism is actually valid. The **judge** decides what to do with that validated criticism. Keeping those roles separate makes the system easier to reason about, test, and swap by tier.

## Repo Structure

```text
arc-judge/
├── README.md
├── docs/
│   ├── concepts.md
│   ├── judge-types.md
│   ├── verifier.md
│   ├── faq.md
│   └── trigger-strategies.md
├── src/
│   ├── challenger/
│   ├── verifier/
│   ├── reviser/
│   ├── judge/
│   └── hooks/
├── examples/
│   ├── reasoning/
│   ├── persona/
│   ├── policy/
│   └── schema/
├── tests/
└── LICENSE
```

## Status

Concept moving toward implementation.

The ingredients are adjacent to:

- LLM-as-a-Judge
- critique / revise loops
- self-verification
- multi-agent debate

The distinguishing idea is the synthesis:

- judge-centered evaluation
- explicit rebuttal pressure
- calibration-aware decision-making
- durability testing before handoff

## Docs

- [Concepts](./docs/concepts.md)
- [Judge Types](./docs/judge-types.md)
- [Verifier](./docs/verifier.md)
- [FAQ](./docs/faq.md)
- [Trigger Strategies](./docs/trigger-strategies.md)

## License

MIT
