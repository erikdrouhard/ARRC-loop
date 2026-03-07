import type { DraftSpan, StructuredChallenge } from "../types.js";

/**
 * Find the span of a substring within a draft.
 * Returns null if the text is not found in the draft.
 */
export function findSpan(draft: string, text: string): DraftSpan | null {
  const start = draft.indexOf(text);
  if (start === -1) return null;

  return {
    text,
    start,
    end: start + text.length,
  };
}

/**
 * Generate a stable ID for a challenge based on category and target span.
 */
export function makeId(prefix: string, span: DraftSpan): string {
  return `${prefix}:${span.start}-${span.end}`;
}

/**
 * Validate that a challenge meets admissibility requirements.
 *
 * A challenge is admissible only if:
 * - target points to actual draft text (non-empty span)
 * - counterargument is specific (not filler)
 * - failureScenario is concrete (not filler)
 * - issueKey is present
 *
 * Auto-rejects filler like "this seems wrong", "this could be better", etc.
 */
export function isAdmissible(challenge: StructuredChallenge): boolean {
  // Target must have non-empty text
  if (!challenge.target.text || challenge.target.text.trim().length === 0) {
    return false;
  }

  // issueKey must be present
  if (!challenge.issueKey || challenge.issueKey.trim().length === 0) {
    return false;
  }

  // counterargument must be specific — reject filler
  if (!challenge.counterargument || challenge.counterargument.trim().length < 20) {
    return false;
  }

  // failureScenario must be concrete — reject filler
  if (!challenge.failureScenario || challenge.failureScenario.trim().length < 20) {
    return false;
  }

  // Reject known filler patterns
  const fillerPatterns = [
    /^this seems wrong$/i,
    /^this could be better$/i,
    /^this is risky$/i,
    /^this feels overconfident$/i,
    /^needs improvement$/i,
  ];

  for (const pattern of fillerPatterns) {
    if (
      pattern.test(challenge.counterargument.trim()) ||
      pattern.test(challenge.failureScenario.trim())
    ) {
      return false;
    }
  }

  return true;
}
