import type { ArrcRiskTier, ArrcTriggerContext, VulnerabilityAssessment } from "../types.js";

/**
 * Tier selection.
 *
 * Tier 0: bypass
 * Tier 1: light screen, one pass
 * Tier 2: standard loop
 * Tier 3: deep loop — broader challenge coverage, stricter escalation sensitivity
 *
 * Tier 3 does NOT lower proof standards. It increases challenge breadth and escalation sensitivity.
 */
export function selectArrcTier(context: ArrcTriggerContext = {}): ArrcRiskTier {
  if (
    context.userRequestedVerification ||
    context.hasStrictSchema ||
    context.requiresPersonaDurability
  ) {
    return 3;
  }

  if (
    context.highStakes ||
    context.usedTools ||
    context.agentDisagreement ||
    context.lowConfidence
  ) {
    return 2;
  }

  return 0;
}

/**
 * Effective tier: max of trigger context tier and classifier tier.
 */
export function effectiveTier(
  context: ArrcTriggerContext = {},
  classifierAssessment?: VulnerabilityAssessment,
): ArrcRiskTier {
  const contextTier = selectArrcTier(context);
  const classifierTier = classifierAssessment?.recommendedTier ?? 0;
  return Math.max(contextTier, classifierTier) as ArrcRiskTier;
}

/**
 * Whether ARRC should trigger.
 */
export function shouldTriggerArrc(
  context: ArrcTriggerContext = {},
  classifierAssessment?: VulnerabilityAssessment,
): boolean {
  return effectiveTier(context, classifierAssessment) > 0;
}

/**
 * Max rounds for tier.
 */
export function maxRoundsForTier(tier: ArrcRiskTier): number {
  switch (tier) {
    case 0: return 0;
    case 1: return 1;
    case 2: return 2;
    case 3: return 3;
    default: return 2;
  }
}
