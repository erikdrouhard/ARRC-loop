import type { ArrcInput } from "../types.js";
import { splitSentences, findSpan } from "../util.js";
import type { RawChallenge } from "./util.js";
import { isAdmissible } from "./util.js";

/**
 * Single-reason sufficiency: "X is Y because Z" where Z is one reason.
 * Does NOT require absolute language.
 */
const SINGLE_REASON_PATTERN =
  /\b(is|are|was|were|remains?|will be)\s+(\w+)\s+(?:because|since|as)\b/i;

/**
 * Causal connector without the single-reason pattern — broader check.
 */
const CAUSAL_PATTERN =
  /\b(because|therefore|thus|hence|so|implies|follows that|since|as a result|consequently)\b/i;

/**
 * Multi-reason indicators that weaken a single-reason challenge.
 */
const MULTI_REASON_PATTERN =
  /\b(and also|additionally|furthermore|moreover|another reason|secondly|in addition)\b/i;

/**
 * Hidden premise markers.
 */
const HIDDEN_PREMISE_PATTERN =
  /\b(obviously|clearly|of course|naturally|inherently|by definition|self-evident)\b/i;

/**
 * Premise/conclusion strength mismatch: weak premise → absolute conclusion.
 */
const ABSOLUTE_CONCLUSION =
  /\b(always|never|guarantee|must|impossible|certainly|definitely|every|none)\b/i;

/**
 * Logical challenger: targets inferential gaps.
 *
 * Fires on:
 * - single-reason sufficiency claims (WITHOUT requiring absolute wording)
 * - causal overreach
 * - hidden premise dependency
 * - conclusion stronger than premise
 */
export function generateLogicalChallenges(
  draft: string,
  _input: ArrcInput,
): RawChallenge[] {
  const challenges: RawChallenge[] = [];
  const sentences = splitSentences(draft);

  for (const sentence of sentences) {
    const span = findSpan(draft, sentence.trim());
    if (!span) continue;

    const singleReasonMatch = sentence.match(SINGLE_REASON_PATTERN);
    const hasMultipleReasons = MULTI_REASON_PATTERN.test(sentence);
    const hasHiddenPremise = HIDDEN_PREMISE_PATTERN.test(sentence);
    const hasCausal = CAUSAL_PATTERN.test(sentence);
    const hasAbsoluteConclusion = ABSOLUTE_CONCLUSION.test(sentence);

    // Single-reason sufficiency: highest priority logical issue
    if (singleReasonMatch && !hasMultipleReasons) {
      const conclusion = singleReasonMatch[1] + " " + singleReasonMatch[2];
      const c: RawChallenge = {
        category: "logical",
        subtype: "single-reason-sufficiency",
        severity: "medium",
        target: span,
        counterargument:
          `The claim "${conclusion}" rests on a single stated reason. ` +
          `This property typically depends on multiple independent conditions. ` +
          `The single cited reason may be necessary but not sufficient.`,
        failureScenario:
          `The single cited reason holds, but the conclusion fails because an ` +
          `uncited condition is violated. For example, a system "is secure because ` +
          `it uses encryption" can still fail via authentication bypass, injection, ` +
          `or misconfiguration.`,
        signal: 0.80,
      };
      if (isAdmissible(c)) {
        challenges.push(c);
      }
      continue; // don't double-count
    }

    // Hidden premise dependency
    if (hasHiddenPremise) {
      const c: RawChallenge = {
        category: "logical",
        subtype: "hidden-premise",
        severity: "low",
        target: span,
        counterargument:
          `The sentence appeals to obviousness ("${sentence.match(HIDDEN_PREMISE_PATTERN)?.[1]}") ` +
          `rather than providing an argument. This hides a premise that may not hold ` +
          `in all contexts.`,
        failureScenario:
          `A reader accepts the hidden premise as given. In a context where the premise ` +
          `does not hold, the conclusion fails without the reader understanding why.`,
        signal: 0.65,
      };
      if (isAdmissible(c)) {
        challenges.push(c);
      }
      continue;
    }

    // Premise/conclusion strength mismatch: causal claim with absolute conclusion
    if (hasCausal && hasAbsoluteConclusion && !singleReasonMatch) {
      const c: RawChallenge = {
        category: "logical",
        subtype: "premise-conclusion-mismatch",
        severity: "medium",
        target: span,
        counterargument:
          `The conclusion uses absolute language but the supporting premise is bounded. ` +
          `The conclusion's strength exceeds what the premise can establish.`,
        failureScenario:
          `A reader treats the absolute conclusion as proven. The bounded premise ` +
          `does not support the conclusion's full scope, leading to false confidence.`,
        signal: 0.72,
      };
      if (isAdmissible(c)) {
        challenges.push(c);
      }
    }
  }

  return challenges;
}
