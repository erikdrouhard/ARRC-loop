# Verifier

The verifier determines whether a rebuttal should change the ship decision.

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

## Verifier modes

### Same-model verifier
Best for:
- low latency
- low stakes
- light ARC

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

- verdict
- confidence
- rationale
- evidence
- whether revision is required
- whether escalation is required
