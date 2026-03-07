import type {
  RelayContext,
  RelayMode,
  RelayPayload,
  RelayResult,
  StructuredChallenge,
} from "../types.js";

/**
 * The relay is a first-class protocol role.
 *
 * It transports challenges, responses, and revisions between stages
 * while preserving protocol rules.
 *
 * Relay rules for v1:
 * - do not invent new arguments
 * - do not omit material content
 * - normalize shape if needed
 * - preserve target span and issue lineage
 * - keep identity-neutral by default
 * - v1 may always use relayMode: "auto", but the seam must exist
 */

function buildContext(relayMode: RelayMode): RelayContext {
  return {
    relayMode,
    identityMasked: true,
    normalizedFields: ["target", "counterargument", "failureScenario"],
    lineagePreserved: true,
  };
}

function normalizePayload(payload: RelayPayload): RelayPayload {
  return {
    issueKey: payload.issueKey,
    category: payload.category,
    target: {
      text: payload.target.text,
      start: payload.target.start,
      end: payload.target.end,
    },
    counterargument: payload.counterargument.trim(),
    failureScenario: payload.failureScenario.trim(),
  };
}

/**
 * Convert a StructuredChallenge to a RelayPayload.
 */
export function challengeToPayload(challenge: StructuredChallenge): RelayPayload {
  return {
    issueKey: challenge.issueKey,
    category: challenge.category,
    target: challenge.target,
    counterargument: challenge.counterargument,
    failureScenario: challenge.failureScenario,
  };
}

/**
 * Relay a challenge into the verification path.
 *
 * The relay does not invent new arguments or omit material content.
 * It normalizes shape and preserves lineage.
 */
export function relayChallenge(
  payload: RelayPayload,
  relayMode: RelayMode = "auto",
): RelayResult {
  const normalized = normalizePayload(payload);
  const context = buildContext(relayMode);

  const notes: string[] = [];

  // Validate lineage preservation
  if (!normalized.issueKey) {
    notes.push("Warning: issueKey missing, lineage may be broken.");
  }

  // Validate target span integrity
  if (!normalized.target.text || normalized.target.text.trim().length === 0) {
    notes.push("Warning: target span is empty.");
  }

  return {
    payload: normalized,
    context,
    ...(notes.length > 0 ? { notes } : {}),
  };
}

/**
 * Relay a revision back into the next pass.
 *
 * Same protocol rules apply: no invention, no omission, preserve lineage.
 */
export function relayRevision(
  payload: RelayPayload,
  relayMode: RelayMode = "auto",
): RelayResult {
  const normalized = normalizePayload(payload);
  const context = buildContext(relayMode);

  return {
    payload: normalized,
    context,
  };
}
