# Concepts

This document defines the core vocabulary behind ARRC Loop in crisp operational terms.

## Convergence Protocol

ARRC Loop is a relay-mediated convergence protocol. It determines whether a draft has reached a justified termination state — not whether the draft is "good" in a static sense, but whether it is stable under adequate challenge.

## Regular Judge vs ARRC Loop

A regular judge evaluates the artifact in its current form. It usually answers questions like:

- Is this correct?
- Is this safe?
- Which draft is better?
- Does this violate policy?

Its weakness is that it is often static. It checks the draft once, without explicitly modeling what happens after strong pushback.

ARRC Loop asks whether the draft should still be trusted after the strongest plausible challenge has been surfaced, relayed, verified, and applied.

## Core Invariant

> Stability without adequate challenge coverage is not convergence.

A draft is not considered converged unless it is both stable and adequately challenged. If the output stops changing because challenge coverage was weak, abstention-heavy, or underexplored, the correct result is **escalate**, not approve.

## Rebuttal

A rebuttal is a plausible criticism that could change whether the artifact should ship.

A good rebuttal is:

- specific
- materially relevant
- falsifiable or inspectable
- able to change the decision if true

A bad rebuttal is noisy, stylistic, irrelevant, or merely confident.

ARRC Loop cares about the distinction because a system should not cave to weak criticism.

## Calibration

Calibration has two closely related meanings in ARRC Loop:

- confidence calibration: whether certainty matches the available evidence
- scope calibration: whether the claims are phrased at the right breadth, specificity, and conditionality

Taken together, calibration is the alignment between confidence, claims, and evidence.

A calibrated output:

- makes claims at the right strength
- makes claims at the right scope
- updates when valid criticism appears
- resists invalid criticism
- explains the basis for change

Calibration is not the same thing as confidence. Both overconfidence and over-yielding are calibration failures.

## Relay

The relay is a first-class protocol role. It transports arguments between modules under protocol constraints: no invention, no omission, lineage preserved.

The relay is part of the method, not optional plumbing.

## Verifier

The verifier is the component that decides which rebuttals are valid enough to matter.

This is usually the hardest part of the system because it must distinguish:

- strong criticism from generic criticism
- material issues from stylistic nits
- valid challenge from confident noise
- evidence-bearing rebuttals from speculative ones

If the verifier is weak, the rest of the loop becomes unstable. The system either caves too easily or refuses to move when it should.

## Resolver

The resolver determines whether the loop has reached a justified termination state. It has workflow authority, not truth authority.

It enforces the core invariant: stable + inadequate coverage = escalate.

## Durability

Durability is the ability of an output to remain acceptable after challenge.

Durability can show up in three ways:

- robustness: the output withstands challenge without meaningful degradation
- narrow revision: the output improves or tightens where challenge is valid
- instability: the output oscillates, caves, or drifts under pressure

ARRC Loop is designed to separate robust or improving outputs from unstable ones.

## Handoff Gate

A handoff gate is the point in a system where an artifact is allowed to move downstream.

Examples:

- from planner to tool call
- from schema draft to generator
- from support draft to user
- from multi-agent synthesis to final answer

ARRC Loop is useful when the expensive mistake is not merely producing a weak draft, but handing that weak draft off as if it were ready.

## Practical Summary

A regular judge asks:

> Does this pass inspection now?

ARRC Loop asks:

> Has this reached a justified termination state under adequate challenge?
