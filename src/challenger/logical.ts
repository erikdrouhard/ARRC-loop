import type { ArrcInput, DraftSpan, StructuredChallenge } from "../types.js";
import { findSpan, isAdmissible, makeId } from "./util.js";

const CAUSAL_PATTERN =
  /\b(because|therefore|thus|hence|so|implies|follows that|since|as a result)\b/i;

const SINGLE_REASON_PATTERN =
  /\b(is secure|is safe|is reliable|is correct|is valid|will work|works)\s+because\b/i;

/**
 * Logical challenger: targets inferential gaps where conclusions don't follow from premises.
 *
 * Local-contract rule: must not emit speculative challenges assuming the verifier will filter.
 */
export function generateLogicalChallenges(
  draft: string,
  _input: ArrcInput,
): StructuredChallenge[] {
  const challenges: StructuredChallenge[] = [];
  const sentences = draft.split(/(?<=[.!?])\s+/);

  for (const sentence of sentences) {
    const causalMatch = sentence.match(CAUSAL_PATTERN);
    if (!causalMatch) continue;

    const singleReasonMatch = sentence.match(SINGLE_REASON_PATTERN);
    if (!singleReasonMatch && !causalMatch) continue;

    const span = findSpan(draft, sentence.trim());
    if (!span) continue;

    let counterargument: string;
    let failureScenario: string;
    let severity: StructuredChallenge["severity"];

    if (singleReasonMatch) {
      const conclusion = singleReasonMatch[1];
      const connector = causalMatch[1];
      counterargument =
        `The claim "${conclusion}" is justified by a single reason introduced by "${connector}". ` +
        `This is an inferential gap: the property "${conclusion}" typically depends on multiple ` +
        `independent conditions, not just the one cited.`;
      failureScenario =
        `The single cited reason holds, but the conclusion fails anyway because an uncited ` +
        `condition is violated. For example, a system "is secure because it uses encryption" ` +
        `can still fail via authentication bypass, injection, or misconfiguration.`;
      severity = "medium";
    } else {
      counterargument =
        `The causal chain in "${sentence.trim()}" uses "${causalMatch[1]}" but the ` +
        `conclusion may not follow from the stated premise alone. The inferential step ` +
        `assumes unstated conditions.`;
      failureScenario =
        `A reader accepts the conclusion as proven, but the unstated conditions don't hold ` +
        `in a real scenario, leading to a false sense of validity.`;
      severity = "low";
    }

    const challenge: StructuredChallenge = {
      id: makeId("logical", span),
      issueKey: `logical:${causalMatch![1]!.toLowerCase()}:${span.start}`,
      category: "logical",
      severity,
      target: span,
      counterargument,
      failureScenario,
      signal: singleReasonMatch ? 0.80 : 0.68,
    };

    if (isAdmissible(challenge)) {
      challenges.push(challenge);
    }
  }

  return challenges;
}
