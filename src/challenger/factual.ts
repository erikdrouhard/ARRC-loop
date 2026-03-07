import type { ArrcInput, DraftSpan, StructuredChallenge } from "../types.js";
import { findSpan, isAdmissible, makeId } from "./util.js";

const ABSOLUTE_CLAIM_PATTERN =
  /\b(always|never|guarantee(?:d|s)?|definitely|certainly|impossible|must|every|none)\b/i;

const UNGROUNDED_CLAIM_PATTERN =
  /\b(is|are|was|were|will|does|do)\s+(always|never|the only|the best|guaranteed|certain)\b/i;

/**
 * Factual challenger: targets claims that assert facts without grounding.
 *
 * Local-contract rule: must not emit weak challenges assuming the verifier will filter.
 * If a concrete counterargument cannot be formed, abstain.
 */
export function generateFactualChallenges(
  draft: string,
  _input: ArrcInput,
): StructuredChallenge[] {
  const challenges: StructuredChallenge[] = [];
  const sentences = draft.split(/(?<=[.!?])\s+/);

  for (const sentence of sentences) {
    const absoluteMatch = sentence.match(ABSOLUTE_CLAIM_PATTERN);
    const ungroundedMatch = sentence.match(UNGROUNDED_CLAIM_PATTERN);

    if (!absoluteMatch && !ungroundedMatch) continue;

    const span = findSpan(draft, sentence.trim());
    if (!span) continue;

    const matchedTerm = absoluteMatch?.[1] ?? ungroundedMatch?.[2] ?? "";
    const counterargument =
      `The claim "${sentence.trim()}" uses "${matchedTerm}" without citing evidence. ` +
      `Real-world systems exhibit exceptions — error states, edge cases, or environmental variation ` +
      `can produce outcomes contradicting this absolute assertion.`;

    const failureScenario =
      `A consumer trusts this claim literally. When an exception occurs ` +
      `(e.g., network timeout, malformed input, unexpected state), the system behavior ` +
      `contradicts the stated guarantee, causing silent failure or incorrect downstream decisions.`;

    const challenge: StructuredChallenge = {
      id: makeId("factual", span),
      issueKey: `factual:${matchedTerm.toLowerCase()}:${span.start}`,
      category: "factual",
      severity: "medium",
      target: span,
      counterargument,
      failureScenario,
      signal: 0.82,
    };

    if (isAdmissible(challenge)) {
      challenges.push(challenge);
    }
  }

  return challenges;
}
