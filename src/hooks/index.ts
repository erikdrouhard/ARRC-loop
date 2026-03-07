import type { ArcJudgeInput, ArcRiskTier, ArcTriggerContext, VulnerabilityAssessment } from "../types.js";
import { classifyVulnerability, VULNERABILITY_THRESHOLD } from "../classifier/index.js";

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

export function shouldTriggerARC(
  input: ArcJudgeInput,
  assessment: VulnerabilityAssessment,
): boolean {
  // Context-driven triggers (metadata overrides)
  const contextTier = selectARCTier(input.metadata);
  if (contextTier > 0) return true;

  // Classifier-driven trigger
  return assessment.score >= VULNERABILITY_THRESHOLD;
}

export function effectiveTier(
  input: ArcJudgeInput,
  assessment: VulnerabilityAssessment,
): ArcRiskTier {
  const contextTier = selectARCTier(input.metadata);
  // Take the higher of context-driven tier and classifier-recommended tier
  return Math.max(contextTier, assessment.recommendedTier) as ArcRiskTier;
}
