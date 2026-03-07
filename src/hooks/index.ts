import type { ArrcRiskTier, ArrcTriggerContext, VulnerabilityAssessment } from "../types.js";

/**
 * Select ARRC tier based on trigger context.
 *
 * Tier 0: bypass — no meaningful rebuttal risk
 * Tier 1: light screen, one pass
 * Tier 2: standard loop
 * Tier 3: deep loop with broader challenge coverage and stricter escalation sensitivity
 *
 * Important: Tier 3 does not lower proof standards.
 * It increases challenge breadth and escalation sensitivity.
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
 * Determine the effective tier by combining trigger context with classifier output.
 * Takes the higher of the two tiers.
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
 * Determine whether ARRC should trigger for this input.
 */
export function shouldTriggerArrc(
  context: ArrcTriggerContext = {},
  classifierAssessment?: VulnerabilityAssessment,
): boolean {
  return effectiveTier(context, classifierAssessment) > 0;
}

/**
 * Get the maximum number of rounds for a given tier.
 */
export function maxRoundsForTier(tier: ArrcRiskTier): number {
  switch (tier) {
    case 0:
      return 0;
    case 1:
      return 1;
    case 2:
      return 2;
    case 3:
      return 3;
    default:
      return 2;
  }
}
