# ARRC Loop

[![Status: v1 Runtime](https://img.shields.io/badge/status-v1_runtime-blue)](#status)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](#license)

**Adversarial Rebuttal Relay Convergence — a relay-mediated convergence protocol for LLM outputs, agents, and schemas**

ARRC Loop is not a judge. It is a **relay-mediated convergence protocol**.

A draft is challenged, that challenge is relayed, the response is relayed back, revisions are made only where justified, and the process continues until the result reaches a justified termination state.

## Core Insight

No single component has global epistemic authority.

Each module is responsible only for its **local contract**:

- the **classifier** routes risk conservatively
- the **challenger** produces admissible challenges
- the **relay** transports arguments under protocol constraints
- the **verifier** determines whether a challenge is locally valid
- the **reviser** applies minimal scoped repair
- the **resolver** determines whether the loop reached a justified termination state

The signal comes from **relay-mediated convergence under structured disagreement**.

## Core Invariant

> **Stability without adequate challenge coverage is not convergence.**

A draft is not considered converged unless it is both **stable** and **adequately challenged**. If the output stops moving because challenge coverage was weak, abstention-heavy, or underexplored, the correct result is **escalate**, not approve.

## Quick Start

### Install

```bash
npm install arrc-loop
```

### Basic Usage

```ts
import { runARRC } from "arrc-loop";

const result = runARRC({
  draft: "The API always returns JSON and never fails silently.",
  taskType: "reasoning",
  maxRounds: 2,
  metadata: {
    highStakes: true,
  },
});

if (result.shouldShip) {
  return result.output;
}

if (result.decision === "escalate") {
  return escalateToHumanOrTools(result.reasons);
}

if (result.decision === "revise") {
  return retry(result);
}

throw new Error("ARRC rejected output");
```

## Termination States

```ts
type ArrcDecision =
  | "approve"   // stable, adequately challenged, no verified issues
  | "narrow"    // verified issues addressed by scoped revision, converged
  | "revise"    // verified issues remain, upstream rewrite needed
  | "escalate"  // oscillation, budget exceeded, or weak coverage
  | "reject";   // multiple severe failures, no safe repair path
```

## Architecture

```text
Draft arrives
  → Vulnerability classifier (conservative gate)
  → Low-risk → approve with confidence tag, skip full loop
  → Potentially vulnerable → identify dimensions (factual, logical, schema, persona, policy)
       → Route to dimension-specific challenger
       → Challenger produces: { target, counterargument, failureScenario, issueKey }
       → Relay challenge into verification path
       → Verifier determines whether challenge is locally valid
       → Only verified challenges trigger targeted revision
       → Revision scoped to challenged spans only
       → Relay revised output into next pass
       → Convergence + coverage check:
            stable + adequate coverage → ship
            oscillating → escalate
            budget exceeded → escalate
            stable + inadequate coverage → escalate
```

The resolver does not decide truth. It determines whether the loop reached a justified termination state.

## Module Design

| Module | Path | Contract |
|--------|------|----------|
| **Classifier** | `src/classifier/` | Routes risk conservatively. Flags dimensions. Not a hidden oracle. |
| **Challenger** | `src/challenger/` | Dimension-specific (`factual`, `logical`, `schema`, `persona`, `policy`). Span-based targeting. Precision > recall. |
| **Relay** | `src/relay/` | First-class protocol role. Transports arguments under constraints. Does not invent or omit. |
| **Verifier** | `src/verifier/` | Strategy-based verification per dimension. Bottoms out in something structural, testable, or executable. |
| **Reviser** | `src/reviser/` | Scoped repair to targeted spans only. Untouched regions preserved byte-identical. |
| **Resolver** | `src/resolver/` | Workflow authority, not truth authority. Enforces the core invariant. |
| **Hooks** | `src/hooks/` | Tier selection (0–3) combining trigger context + classifier output. |
| **Orchestrator** | `src/index.ts` | `runARRC()` — manages sequencing, coverage, convergence, and termination. |

## Principles

### 1. The draft stands unless a challenge earns revision

This is the most important rule in the system.

### 2. Empty is better than fake

If a module cannot do its job honestly, it returns nothing or abstains.

### 3. No module may rely on downstream correction

Each module must satisfy its own local contract as if its output matters directly.

### 4. Stability without adequate challenge coverage is not convergence

A draft is not converged unless it is both stable and adequately challenged.

### 5. Relay is a first-class protocol role

Not optional plumbing. The relay is part of the method.

## Trigger Tiers

| Tier | Behavior |
|------|----------|
| **0** | Bypass — no meaningful rebuttal risk |
| **1** | Light screen, one pass |
| **2** | Standard loop |
| **3** | Deep loop — broader challenge coverage, stricter escalation sensitivity |

Tier 3 does **not** lower proof standards. It increases challenge breadth and escalation sensitivity.

## v1 Scope

This v1 targets **structured and semi-structured outputs**:

- schemas
- policy boundaries
- constrained answer formats
- tool-backed outputs

It is **not** expected to solve open-ended free-text reasoning durability in v1. If a challenge cannot be generated or verified honestly, the system abstains, surfaces uncertainty, or escalates. Never fakes signal.

## Result Contract

```ts
interface ArrcResult {
  decision: ArrcDecision;
  confidence: number;
  output?: string;
  reasons: string[];
  rounds: ArrcRound[];
  tier: ArrcRiskTier;
  convergence: ConvergenceState;
  coverage: ChallengeCoverage;
  shouldShip: boolean;
}
```

## Repo Structure

```text
arrc-loop/
├── src/
│   ├── classifier/     # Vulnerability classification
│   ├── challenger/      # Dimension-specific challengers
│   │   ├── factual.ts
│   │   ├── logical.ts
│   │   ├── schema.ts
│   │   ├── persona.ts
│   │   ├── policy.ts
│   │   └── util.ts
│   ├── relay/           # First-class relay protocol
│   ├── verifier/        # Strategy-based verification
│   ├── reviser/         # Scoped span repair
│   ├── resolver/        # Termination-state resolver
│   ├── hooks/           # Tier selection
│   ├── types.ts         # Full type system
│   └── index.ts         # Orchestrator (runARRC)
├── tests/
├── examples/
│   ├── reasoning/
│   ├── persona/
│   ├── policy/
│   └── schema/
└── docs/
```

## Status

v1 runtime implemented. 22 tests passing across classifier, challengers, verifier, reviser, resolver, and full loop integration.

The core runtime is **deterministic by default** with clean interfaces for future:
- model-backed challengers
- tool-backed verifiers
- ensemble verifiers
- simulation-backed persona/policy checks
- model-based relays

## License

MIT
