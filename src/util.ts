import type { DraftSpan } from "./types.js";

/**
 * Split text into sentences. Handles common abbreviations minimally.
 */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Find the span of a substring within a draft.
 */
export function findSpan(draft: string, text: string): DraftSpan | null {
  const start = draft.indexOf(text);
  if (start === -1) return null;
  return { text, start, end: start + text.length };
}

/**
 * Generate a stable fingerprint for an issue based on normalized target text + category + subtype.
 * Does not depend on start offset, so it survives minor span shifts.
 */
export function fingerprint(
  category: string,
  subtype: string,
  targetText: string,
): string {
  const normalized = targetText.trim().toLowerCase().replace(/\s+/g, " ");
  return `${category}:${subtype}:${simpleHash(normalized)}`;
}

/**
 * Simple string hash for fingerprinting. Not cryptographic.
 */
function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

/**
 * Canonicalize target text: trim, collapse whitespace.
 */
export function canonicalize(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/**
 * Generate a lineage token for relay tracking.
 */
export function lineageToken(issueKey: string, round: number): string {
  return `${issueKey}@r${round}`;
}
