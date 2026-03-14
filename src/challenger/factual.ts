import type { ArrcInput } from "../types.js";
import { splitSentences, findSpan } from "../util.js";
import type { RawChallenge } from "./util.js";
import { isAdmissible } from "./util.js";

const ABSOLUTE_CLAIM_PATTERN =
  /\b(always|never|guarantee(?:d|s)?|definitely|certainly|impossible|must|every|none)\b/i;

const UNGROUNDED_PATTERN =
  /\b(is|are|was|were|will|does|do)\s+(always|never|the only|the best|guaranteed|certain)\b/i;

/**
 * Material evidence patterns — things that could actually ground a claim.
 * "because", "since", "therefore" are NOT evidence.
 */
const MATERIAL_EVIDENCE_NEARBY =
  /(?:\bhttps?:\/\/\S+|\b(?:according to|source:|citation:|study|data shows|measured|observed|tested|confirmed by)\b|\b\d+(?:\.\d+)?%\b)/i;

/**
 * Factual challenger: targets unsupported certainty, unsupported universals,
 * and claims lacking cited or testable support.
 */
export function generateFactualChallenges(
  draft: string,
  _input: ArrcInput,
): RawChallenge[] {
  const challenges: RawChallenge[] = [];
  const sentences = splitSentences(draft);

  for (const sentence of sentences) {
    const absoluteMatch = sentence.match(ABSOLUTE_CLAIM_PATTERN);
    const ungroundedMatch = sentence.match(UNGROUNDED_PATTERN);

    if (!absoluteMatch && !ungroundedMatch) continue;

    const span = findSpan(draft, sentence.trim());
    if (!span) continue;

    // Check for material evidence near target (not discourse markers)
    const targetIndex = draft.indexOf(sentence.trim());
    const context = draft.slice(
      Math.max(0, targetIndex - 200),
      Math.min(draft.length, targetIndex + sentence.length + 200),
    );
    const hasMaterialEvidence = MATERIAL_EVIDENCE_NEARBY.test(context);

    if (hasMaterialEvidence) continue; // grounded claim, skip

    const matchedTerm = absoluteMatch?.[1] ?? ungroundedMatch?.[2] ?? "";

    const counterargument =
      `The claim "${sentence.trim()}" uses "${matchedTerm}" without cited evidence, ` +
      `quantitative data, or testable support. Discourse markers like "because" do not ` +
      `constitute evidence. Real-world systems exhibit exceptions that can contradict ` +
      `this assertion.`;

    const failureScenario =
      `A consumer trusts this claim literally. An exception occurs ` +
      `(e.g., network timeout, malformed input, unexpected state) that contradicts ` +
      `the stated guarantee, causing silent failure or incorrect downstream decisions.`;

    const c: RawChallenge = {
      category: "factual",
      subtype: "unsupported-certainty",
      severity: "medium",
      target: span,
      counterargument,
      failureScenario,
      signal: 0.82,
    };

    if (isAdmissible(c)) {
      challenges.push(c);
    }
  }

  return challenges;
}
