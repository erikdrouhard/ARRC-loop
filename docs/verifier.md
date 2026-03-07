# Verifier

The verifier determines whether a challenge should change the ship decision.

## Purpose

A challenger is optimized to find plausible attacks.
A verifier is optimized to distinguish:

- valid criticism
- partially valid criticism
- irrelevant criticism
- misleading criticism
- high-confidence noise

## Failure modes

### 1. Gullible verifier
Accepts weak rebuttals too easily.

Symptoms:
- unnecessary revisions
- over-narrowing
- oscillation
- degraded final outputs

### 2. Stubborn verifier
Rejects strong rebuttals too often.

Symptoms:
- false approvals
- missed contradictions
- overconfidence
- low correction rate

## Verifier strategies

ARRC Loop v1 implements dimension-specific verification strategies:

- **Factual**: checks evidence markers around the target span; accepts challenges to ungrounded absolutes
- **Logical**: detects single-reason justifications and tests for causal gaps
- **Schema**: validates whether an adversarial input could break the schema
- **Persona**: checks explicit trait definitions and boundary constraints
- **Policy**: inspects allow/deny/escalate boundaries and flags vague language

## Future verifier modes

### Same-model verifier
Best for:
- low latency
- low stakes
- light screening

### Cross-model verifier
Best for:
- adversarial independence
- rebuttal-heavy workflows
- high-value outputs

### Tool-backed verifier
Best for:
- factual checks
- schema checks
- contract validation
- deterministic constraints

### Ensemble verifier
Best for:
- high-stakes routing
- expensive downstream execution
- ambiguous cases

## Minimum contract

A verifier should return:

- `accepted`: whether the challenge is valid
- `confidence`: how certain the verifier is
- `rationale`: why the verdict was reached
- `evidence`: supporting detail (optional)
- `abstained`: whether the verifier declined to judge (optional)
