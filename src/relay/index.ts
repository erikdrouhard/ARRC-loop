import type { PreRelayChallenge } from "../challenger/util.js";
import type { ArrcChallengeSeverity, RelayedChallenge } from "../types.js";
import { canonicalize, lineageToken } from "../util.js";

/**
 * Relay — first-class protocol stage.
 *
 * The relay is NOT a pass-through. It:
 * 1. Canonicalizes target text (whitespace normalization)
 * 2. Assigns lineage tokens for tracking across rounds
 * 3. Validates protocol invariants and records warnings
 * 4. Rejects malformed challenges (returns null)
 * 5. Downgrades confidence for challenges with protocol issues
 *
 * Verifier and reviser consume RelayedChallenge, not raw challenges.
 * If the relay is bypassed, downstream behavior changes:
 * - no lineage tokens → tracking breaks
 * - no canonicalization → span matching becomes brittle
 * - no protocol validation → malformed challenges reach verifier
 */

export interface RelayOptions {
  round: number;
  /** If true, reject challenges with protocol warnings instead of downgrading */
  strict?: boolean;
}

/**
 * Relay a pre-relay challenge into the verification path.
 *
 * Returns null if the challenge is fundamentally malformed and cannot be relayed.
 * In strict mode, also rejects challenges with any protocol warning.
 */
export function relayChallenge(
  challenge: PreRelayChallenge,
  options: RelayOptions,
): RelayedChallenge | null {
  const warnings: string[] = [];
  let downgraded = false;

  // Validate: target text must exist and be non-empty
  if (!challenge.target.text || challenge.target.text.trim().length === 0) {
    return null; // fundamentally malformed, reject
  }

  // Validate: counterargument and failure scenario must be substantive
  if (challenge.counterargument.trim().length < 20) {
    return null;
  }
  if (challenge.failureScenario.trim().length < 20) {
    return null;
  }

  // Validate: issueKey must exist
  if (!challenge.issueKey || challenge.issueKey.trim().length === 0) {
    warnings.push("Missing issueKey: lineage tracking will be broken.");
    downgraded = true;
  }

  // Validate: span bounds
  if (challenge.target.start < 0 || challenge.target.end <= challenge.target.start) {
    warnings.push("Invalid span bounds: start/end are inconsistent.");
    downgraded = true;
  }

  // Validate: fingerprint must exist for stable tracking
  if (!challenge.fingerprint || challenge.fingerprint.length === 0) {
    warnings.push("Missing fingerprint: cross-round deduplication will fail.");
    downgraded = true;
  }

  // Strict mode: reject on any warning
  if (options.strict && warnings.length > 0) {
    return null;
  }

  // Canonicalize target text
  const canonical = canonicalize(challenge.target.text);

  // Determine effective severity — downgrade if protocol issues exist
  let effectiveSeverity = challenge.severity;
  let effectiveSignal = challenge.signal;
  if (downgraded) {
    effectiveSignal = Math.max(0.1, effectiveSignal - 0.2);
    if (effectiveSeverity === "high") {
      effectiveSeverity = "medium";
    } else if (effectiveSeverity === "medium") {
      effectiveSeverity = "low";
    }
  }

  const ct: RelayedChallenge["canonicalTarget"] = {
    text: canonical,
    start: challenge.target.start,
    end: challenge.target.end,
  };
  if (challenge.target.sentenceIndex !== undefined) {
    ct.sentenceIndex = challenge.target.sentenceIndex;
  }

  return {
    issueKey: challenge.issueKey,
    category: challenge.category,
    severity: effectiveSeverity,
    canonicalTarget: ct,
    counterargument: challenge.counterargument.trim(),
    failureScenario: challenge.failureScenario.trim(),
    lineageToken: lineageToken(challenge.issueKey, options.round),
    signal: effectiveSignal,
    protocolWarnings: warnings,
    downgraded,
    fingerprint: challenge.fingerprint,
  };
}

/**
 * Relay a batch of pre-relay challenges.
 * Filters out null (rejected) challenges and returns the relayed set.
 */
export function relayChallenges(
  challenges: PreRelayChallenge[],
  options: RelayOptions,
): RelayedChallenge[] {
  const results: RelayedChallenge[] = [];
  for (const c of challenges) {
    const relayed = relayChallenge(c, options);
    if (relayed !== null) {
      results.push(relayed);
    }
  }
  return results;
}
