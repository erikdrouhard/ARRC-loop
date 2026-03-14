import type { ArrcChallengeCategory, ArrcChallengeSeverity, DraftSpan, RelayedChallenge } from "../types.js";
import { canonicalize, fingerprint as fp, lineageToken } from "../util.js";

export { findSpan, splitSentences } from "../util.js";

export interface RawChallenge {
  category: ArrcChallengeCategory;
  subtype: string;
  severity: ArrcChallengeSeverity;
  target: DraftSpan;
  counterargument: string;
  failureScenario: string;
  signal: number;
}

/**
 * Validate that a raw challenge meets admissibility requirements.
 */
export function isAdmissible(c: RawChallenge): boolean {
  if (!c.target.text || c.target.text.trim().length === 0) return false;
  if (!c.counterargument || c.counterargument.trim().length < 20) return false;
  if (!c.failureScenario || c.failureScenario.trim().length < 20) return false;
  return true;
}

/**
 * Build an issue key from category, subtype, and fingerprint.
 */
export function makeIssueKey(category: string, subtype: string, targetText: string): string {
  return `${category}:${subtype}:${fp(category, subtype, targetText)}`;
}

/**
 * Convert a raw challenge to the pre-relay format used by the challenger dispatcher.
 * The relay module will then process this into a RelayedChallenge.
 */
export function toPreRelayChallenge(c: RawChallenge): PreRelayChallenge {
  const key = makeIssueKey(c.category, c.subtype, c.target.text);
  return {
    issueKey: key,
    category: c.category,
    subtype: c.subtype,
    severity: c.severity,
    target: c.target,
    counterargument: c.counterargument,
    failureScenario: c.failureScenario,
    signal: c.signal,
    fingerprint: fp(c.category, c.subtype, c.target.text),
  };
}

export interface PreRelayChallenge {
  issueKey: string;
  category: ArrcChallengeCategory;
  subtype: string;
  severity: ArrcChallengeSeverity;
  target: DraftSpan;
  counterargument: string;
  failureScenario: string;
  signal: number;
  fingerprint: string;
}
