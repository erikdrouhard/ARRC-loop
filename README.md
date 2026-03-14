# ARRC Loop v2

[![Status: v2 Runtime](https://img.shields.io/badge/status-v2_runtime-blue)](#status)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](#license)

**Adversarial Rebuttal Relay Convergence — an issue-lifecycle convergence engine for LLM outputs**

ARRC Loop is not a judge. It is a **relay-mediated convergence protocol** that tracks issues through a full lifecycle from detection to resolution, persistence, or escalation.

## What Changed in v2

v1 was a mostly-heuristic lint-and-escalate pipeline with architecture theater (no-op relay, "because" counted as evidence, placeholder "repairs", fake convergence under weak coverage). v2 fixes that:

| v1 Problem | v2 Fix |
|---|---|
| Relay was a pass-through nobody consumed | Relay canonicalizes targets, assigns lineage tokens, validates protocol invariants, downgrades/rejects malformed challenges. Verifier and reviser consume `RelayedChallenge`, not raw challenges. |
| "because" counted as evidence | Evidence taxonomy with 6 classes. Only `citation-like`, `quantitative`, `executable`, `tool-verified` reduce factual vulnerability. `explanatory` (discourse markers) does not. |
| Logical routing required absolute wording | Logical challenger fires on single-reason sufficiency, hidden premises, premise/conclusion mismatch — no "always"/"never" gate. |
| Policy repair inserted "[criteria to be specified]" | No placeholders. If concrete criteria can't be inferred, issue is marked `unrepairable` with explicit reason. |
| Schema/persona paths were detect-and-escalate | Category-specific repair strategies where possible, typed `unsupported` capability path where not. |
| Coverage was a global abstention union | Per-issue, per-dimension, per-round coverage tracking. Earlier coverage not erased by later abstention. |
| Persistence conflated with oscillation | 5 distinct issue states: `persistent`, `regressed`, `oscillating`, `unrepairable`, `resolved`. |
| No re-verification after repair | Repairs trigger re-verification against the original triggering issue. Repair only counts if issue transitions to `resolved`. |

## Core Invariant

> **Stability without adequate challenge coverage is not convergence.**

## Quick Start

```bash
npm install arrc-loop
```

```ts
import { runARRC } from "arrc-loop";

const result = runARRC({
  draft: "The API always returns JSON and never fails silently.",
  taskType: "reasoning",
  metadata: { highStakes: true },
});

// result.decision: "approve" | "narrow" | "revise" | "escalate" | "reject"
// result.issues: IssueRecord[] — full lifecycle per issue
// result.coverage: ChallengeCoverageV2 — per-dimension, per-round
// result.shouldShip: boolean
```

## Issue Lifecycle

Each issue is tracked through a first-class lifecycle:

```
candidate → admissible → verified → repaired → rechecked → resolved
                                  → persistent (repair failed)
                                  → regressed (repair changed text but issue returned)
                                  → oscillating (repaired, resolved, then reappeared)
                                  → unrepairable (no local repair strategy)
                                  → abstained (verifier declined)
```

The resolver reasons from lifecycle state, not counts.

## Evidence Taxonomy

```
none          — no support found
explanatory   — discourse markers (because, therefore, since) — NOT evidence
citation-like — references, sources, "according to"
quantitative  — measurements, percentages, data
executable    — test results, benchmarks, audits
tool-verified — automated tool output
```

Only the last four materially reduce factual vulnerability.

## Architecture

```text
Draft arrives
  → Classifier (sentence-level candidate detection with evidence classification)
  → Tier selection (0–3)
  → For each round:
       → Challenger (dimension-specific, span-targeted)
       → Relay (canonicalize, assign lineage, validate protocol, downgrade/reject)
       → Verifier (consumes RelayedChallenge, returns evidence class)
       → Reviser (issue-specific repair, no placeholders)
       → Re-verify repaired issues against original trigger
       → Update issue lifecycle status
  → Coverage check (per-dimension, per-round)
  → Resolver (workflow authority from issue lifecycle state)
```

## Module Contracts

| Module | Consumes | Produces | Contract |
|---|---|---|---|
| Classifier | draft text | `CandidateIssue[]` with evidence class | Sentence-level detection. "because" ≠ evidence. Logical fires without absolutes. |
| Challenger | draft, dimensions | `PreRelayChallenge[]` | Dimension-specific. Precision > recall. Abstain rather than fake. |
| Relay | `PreRelayChallenge[]` | `RelayedChallenge[]` | Canonicalize, lineage, validate, reject malformed, downgrade protocol issues. |
| Verifier | `RelayedChallenge[]` | `VerificationResult[]` with evidence class | Per-dimension strategy. Explanatory ≠ evidence. |
| Reviser | `RelayedChallenge[]` + verifications | `RevisionOutcome` | Issue-specific repair. No placeholders. Honest `unsupported` path. |
| Resolver | `IssueRecord[]` + coverage + convergence | `ArrcResult` | Workflow authority, not truth authority. Reasons from lifecycle state. |

## Termination States

```ts
type ArrcDecision =
  | "approve"   // stable, adequately challenged, no unresolved issues
  | "narrow"    // issues resolved via scoped repair, output changed
  | "revise"    // issues remain, upstream rewrite needed
  | "escalate"  // oscillation, inadequate coverage, or budget exceeded
  | "reject";   // no credible repair path
```

## What Is Deterministic Core vs Extension Seam

**Deterministic core (implemented):**
- Regex/pattern-based classification and challenge generation
- Rule-based verification strategies per dimension
- Issue-specific repair with explicit strategy dispatch
- Full issue lifecycle state machine
- Round-aware coverage accounting
- Protocol-enforcing relay

**Extension seams (interfaces exist, not implemented):**
- Model-backed challengers (swap challenger functions)
- Tool-backed verifiers (swap verification strategies)
- Ensemble verifiers
- Model-based relay with argument transformation
- External evidence resolution

## Limitations

- Challengers use regex/pattern heuristics, not LLM-based analysis. They will false-positive on some constructions and miss subtler issues.
- Schema repair can only add constraints when field names are mentioned in prose. Most schema issues surface as `unrepairable`.
- Persona repair works only when enough trait keywords are present to build a contract clause. Otherwise `unsupported`.
- Policy repair works only when the subject of the vague term is quantifiable. Otherwise `unsupported`.
- Evidence classification is keyword-based, not semantic. A sentence containing "test" near a claim gets `executable` evidence class even if the "test" is unrelated.
- No persistence layer. Issue lifecycle exists only within a single `runARRC` invocation.

## Repo Structure

```text
arrc-loop/
├── src/
│   ├── types.ts           # Full type system (IssueRecord, evidence taxonomy, coverage v2)
│   ├── util.ts            # Shared utilities (splitSentences, findSpan, fingerprint, canonicalize)
│   ├── classifier/        # Sentence-level vulnerability detection with evidence classification
│   ├── challenger/        # Dimension-specific challengers (factual, logical, schema, persona, policy)
│   ├── relay/             # Protocol stage: canonicalize, lineage, validate, downgrade/reject
│   ├── verifier/          # Strategy-based verification with evidence class output
│   ├── reviser/           # Issue-specific repair with honest unsupported path
│   ├── resolver/          # Termination-state resolver from issue lifecycle
│   ├── hooks/             # Tier selection (0–3)
│   └── index.ts           # Orchestrator (runARRC) with issue lifecycle management
├── tests/
│   └── arrc-loop.test.ts  # 35 tests covering all 9 regression areas
└── docs/
```

## Test Coverage

35 tests across 9 diagnostic areas:

1. **Relay is material** — relayed challenges have canonicalTarget/lineageToken that raw lack; malformed challenges rejected; protocol violations downgrade severity
2. **"Because" is not evidence** — classifier and verifier both treat discourse markers as explanatory, not material
3. **Logical challenge without absolutes** — "The system is secure because it uses encryption" triggers logical issue
4. **Policy placeholder ban** — no "criteria to be specified" or placeholder text in repairs
5. **Schema/persona honesty** — unrepairable surfaces explicitly, not silently converged
6. **Coverage accounting** — per-dimension per-round; earlier coverage not erased by later abstention
7. **Persistence vs oscillation** — separate states with different resolver responses
8. **Issue-specific re-verification** — repaired issues rechecked; repair only counts if issue resolves
9. **Full loop integration** — 5 acceptance examples + edge cases

## License

MIT
