import type {
  DraftSpan,
  ScopedRevision,
  StructuredChallenge,
  VerificationResult,
} from "../types.js";

const ABSOLUTE_REPLACEMENTS: ReadonlyArray<[RegExp, string]> = [
  [/\balways\b/gi, "usually"],
  [/\bnever\b/gi, "rarely"],
  [/\bguaranteed?\b/gi, "likely"],
  [/\bguarantees\b/gi, "strongly suggests"],
  [/\bdefinitely\b/gi, "likely"],
  [/\bcertainly\b/gi, "with reasonable confidence"],
  [/\bimpossible\b/gi, "unlikely"],
  [/\bmust\b/gi, "should"],
];

/**
 * Apply scoped repair to the targeted span only.
 * Preserves untouched regions exactly.
 *
 * Local-contract rule: the reviser must not emit partial or "good enough" fixes
 * assuming downstream modules will catch the leftover defect.
 */
function reviseSpan(
  draft: string,
  span: DraftSpan,
  category: string,
): { revisedText: string; reason: string } | null {
  const targetText = draft.slice(span.start, span.end);

  // Verify span still matches
  if (targetText !== span.text) {
    return null;
  }

  switch (category) {
    case "factual": {
      // Soften absolute claims within the targeted span only
      let revised = span.text;
      for (const [pattern, replacement] of ABSOLUTE_REPLACEMENTS) {
        revised = revised.replace(pattern, replacement);
      }
      if (revised === span.text) {
        return null;
      }
      return {
        revisedText: revised,
        reason: "Softened absolute language to reflect defensible confidence within targeted span.",
      };
    }

    case "logical": {
      // For logical gaps, qualify the conclusion
      let revised = span.text;
      // Only soften if there's a single-reason "because" pattern
      if (/\b(is|are)\s+\w+\s+because\b/i.test(revised)) {
        revised = revised.replace(
          /\b(is|are)\s+(\w+)\s+because\b/i,
          (match, verb, adj) => `${verb} partially ${adj} because`,
        );
      }
      for (const [pattern, replacement] of ABSOLUTE_REPLACEMENTS) {
        revised = revised.replace(pattern, replacement);
      }
      if (revised === span.text) {
        return null;
      }
      return {
        revisedText: revised,
        reason: "Qualified inferential conclusion to acknowledge gap between premise and conclusion.",
      };
    }

    case "schema": {
      // Cannot do safe local text repair for schema gaps — report as unresolvable
      return null;
    }

    case "persona": {
      // Cannot do safe local text repair for missing persona traits — report as unresolvable
      return null;
    }

    case "policy": {
      // Qualify vague policy language within the span
      let revised = span.text;
      revised = revised.replace(
        /\b(may be|in some cases|special cases|when appropriate)\b/gi,
        (match) => `${match} (criteria to be specified)`,
      );
      if (revised === span.text) {
        return null;
      }
      return {
        revisedText: revised,
        reason: "Marked vague policy boundary for explicit criteria specification.",
      };
    }

    default:
      return null;
  }
}

/**
 * Revise a draft based on verified challenges.
 *
 * Only verified challenges trigger revision.
 * Revision is scoped to challenged spans only.
 * Untouched regions are preserved exactly.
 *
 * Local-contract rule: the reviser must not emit partial or "good enough" fixes
 * assuming downstream modules will catch the leftover defect.
 * If local repair is not possible, report it in unresolvable.
 */
export function reviseDraft(
  draft: string,
  challenges: StructuredChallenge[],
  verifications: VerificationResult[],
): ScopedRevision {
  const changes: ScopedRevision["changes"] = [];
  const unresolvable: string[] = [];
  let currentDraft = draft;

  // Track offset adjustments as we modify the draft
  let offset = 0;

  // Only process verified (accepted) challenges
  const verifiedPairs = challenges
    .map((challenge, i) => ({ challenge, verification: verifications[i] }))
    .filter((pair) => pair.verification?.accepted === true)
    // Sort by start position to apply changes in order
    .sort((a, b) => a.challenge.target.start - b.challenge.target.start);

  for (const { challenge } of verifiedPairs) {
    const adjustedStart = challenge.target.start + offset;
    const adjustedEnd = challenge.target.end + offset;

    const adjustedSpan: DraftSpan = {
      text: challenge.target.text,
      start: adjustedStart,
      end: adjustedEnd,
    };

    const result = reviseSpan(currentDraft, adjustedSpan, challenge.category);

    if (result) {
      // Apply the revision
      currentDraft =
        currentDraft.slice(0, adjustedStart) +
        result.revisedText +
        currentDraft.slice(adjustedEnd);

      const revisedSpan: DraftSpan = {
        text: result.revisedText,
        start: adjustedStart,
        end: adjustedStart + result.revisedText.length,
      };

      changes.push({
        issueKey: challenge.issueKey,
        originalSpan: challenge.target,
        revisedSpan,
        reason: result.reason,
      });

      // Update offset for subsequent changes
      offset += result.revisedText.length - challenge.target.text.length;
    } else {
      unresolvable.push(challenge.issueKey);
    }
  }

  return {
    output: currentDraft,
    changes,
    unchanged: currentDraft === draft,
    unresolvable,
  };
}
