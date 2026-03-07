# Basic ARC Trace

## Draft
"The answer is X because A, B, and C."

## Rebuttal
"Claim B is unsupported, and C only holds if assumption D is true."

## Verifier result
- B criticism: valid
- C criticism: partially valid
- D assumption: relevant and missing

## Revision
"The answer is likely X under assumption D, but B should be removed and C should be scoped more narrowly."

## ARC Judge decision
- decision: narrow
- confidence: 0.78
- accepted rebuttals:
  - unsupported claim B
  - missing assumption D
- rejected rebuttals:
  - none

## Why this matters
A regular judge might have passed the original answer because it sounded coherent.
ARC Judge caught that the answer was too broad for the evidence behind it.
