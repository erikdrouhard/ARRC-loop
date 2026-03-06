# Concepts

This document defines the core vocabulary behind ARC Judge in crisp operational terms.

## Judge

A judge is a model-based evaluator that inspects an output, trace, or candidate artifact against a rubric and returns an assessment.

A judge may score, rank, classify, or gate. The key property is that it evaluates, rather than produces, the final artifact.

## Regular Judge

A regular judge evaluates the artifact in its current form.

It usually answers questions like:

- Is this correct?
- Is this safe?
- Which draft is better?
- Does this violate policy?

Its weakness is that it is often static. It checks the draft once, without explicitly modeling what happens after strong pushback.

## ARC Judge

An ARC Judge is a judge that evaluates whether an artifact remains properly calibrated after adversarial rebuttal.

It does not only ask whether the draft looks acceptable. It asks whether the draft should still be trusted after the strongest plausible challenge has been surfaced, filtered, and applied.

Operationally, ARC Judge combines:

- challenge generation
- rebuttal validation
- narrow revision
- a final ship / revise / escalate decision

## Rebuttal

A rebuttal is a plausible criticism that could change whether the artifact should ship.

A good rebuttal is:

- specific
- materially relevant
- falsifiable or inspectable
- able to change the decision if true

A bad rebuttal is noisy, stylistic, irrelevant, or merely confident.

ARC Judge cares about the distinction because a system should not cave to weak criticism.

## Calibration

Calibration has two closely related meanings in ARC Judge:

- confidence calibration: whether certainty matches the available evidence
- scope calibration: whether the claims are phrased at the right breadth, specificity, and conditionality

Taken together, calibration is the alignment between confidence, claims, and evidence.

In ARC terms, a calibrated output:

- makes claims at the right strength
- makes claims at the right scope
- updates when valid criticism appears
- resists invalid criticism
- explains the basis for change

Calibration is not the same thing as confidence. Both overconfidence and over-yielding are calibration failures.

## Verifier

The verifier is the component that decides which rebuttals are valid enough to matter.

This is usually the hardest part of an ARC system because it must distinguish:

- strong criticism from generic criticism
- material issues from stylistic nits
- valid challenge from confident noise
- evidence-bearing rebuttals from speculative ones

If the verifier is weak, the rest of the ARC loop becomes unstable. The system either caves too easily or refuses to move when it should.

## Durability

Durability is the ability of an output to remain acceptable after challenge.

Durability can show up in three ways:

- robustness: the output withstands challenge without meaningful degradation
- narrow revision: the output improves or tightens where challenge is valid
- instability: the output oscillates, caves, or drifts under pressure

ARC Judge is designed to separate robust or improving outputs from unstable ones.

## Handoff Gate

A handoff gate is the point in a system where an artifact is allowed to move downstream.

Examples:

- from planner to tool call
- from schema draft to generator
- from support draft to user
- from multi-agent synthesis to final answer

ARC Judge is useful when the expensive mistake is not merely producing a weak draft, but handing that weak draft off as if it were ready.

## Practical Summary

A regular judge asks:

> Does this pass inspection now?

ARC Judge asks:

> Does this still deserve to pass after serious opposition?
