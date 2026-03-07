# Persona Drift ARC Trace

## Draft
Turn 1: Agent responds in character as a concise technical advisor.
Turn 3: Agent still in character but slightly more verbose.
Turn 5: Agent drops the advisory tone and starts hedging like a general assistant.

## Rebuttal
"By turn 5, the agent has abandoned its persona constraints. The response no longer matches the defined voice, and hedging language contradicts the 'concise technical advisor' role."

## Verifier result
- persona drift: valid
- tone shift at turn 3: partially valid (minor, within tolerance)
- full drift at turn 5: valid (clear departure from role)

## Revision
Turn 5 response is rewritten to match the original persona constraints: concise, direct, technical, no hedging.

## ARC Judge decision
- decision: revise
- confidence: 0.85
- accepted rebuttals:
  - persona drift at turn 5
- rejected rebuttals:
  - tone shift at turn 3 (within acceptable range)

## Why this matters
A regular judge evaluating turn 5 in isolation might score it as helpful and correct.
ARC Judge caught that the output had drifted from the persona contract established at turn 1.
