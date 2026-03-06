import type { ArcRiskTier, ArcTriggerContext } from "../types.js";

export function selectARCTier(context: ArcTriggerContext = {}): ArcRiskTier {
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

export function shouldTriggerARC(context: ArcTriggerContext = {}): boolean {
  return selectARCTier(context) > 0;
}
