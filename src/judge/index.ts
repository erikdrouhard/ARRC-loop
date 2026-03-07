import type {
  ArcDecision,
  ArcJudgment,
  ArcRiskTier,
  ArcRound,
  ArcTaskType,
  ConvergenceState,
  ValidatedChallenge,
  VulnerabilityAssessment,
} from "../types.js";

// ── Decision Logic ───────────────────────────────────────────────────────────

function pickDecision(
  taskType: ArcTaskType,
  tier: ArcRiskTier,
  rounds: ArcRound[],
  convergence: ConvergenceState,
): ArcDecision {
  const allAccepted = rounds.flatMap((r) => r.accepted);
  const highSeverity = allAccepted.filter((c) => c.severity === "high");
  const lastRound = rounds[rounds.length - 1];
  const lastRoundAccepted = lastRound?.accepted ?? [];
  const lastRoundChanged = lastRound ? !lastRound.revision.unchanged : false;

  // No verified challenges survived at all → approve
  if (allAccepted.length === 0) {
    return "approve";
  }

  // Oscillating → escalate
  if (convergence.isOscillating) {
    return "escalate";
  }

  // Budget exceeded without stability → escalate
  if (convergence.budgetExceeded && !convergence.isStable) {
    return "escalate";
  }

  // High-severity challenges on high-stakes tasks → escalate
  if (highSeverity.length > 0 && (taskType === "schema" || taskType === "policy" || tier === 3)) {
    return "escalate";
  }

  // Multiple high-severity challenges that weren't addressed → reject
  if (highSeverity.length >= 2 && !lastRoundChanged) {
    return "reject";
  }

  // Stable: no new verified challenges on latest revision → narrow (revision was successful)
  if (convergence.isStable && lastRoundChanged) {
    return "narrow";
  }

  // Last round had no accepted challenges (even if earlier rounds did) → approve
  if (lastRoundAccepted.length === 0) {
    return "approve";
  }

  // Verified challenges exist but reviser couldn't address in-place → revise
  if (!lastRoundChanged && allAccepted.length > 0) {
    return "revise";
  }

  // Changes were made → narrow
  if (lastRoundChanged) {
    return "narrow";
  }

  return "revise";
}

// ── Confidence Calculation ───────────────────────────────────────────────────

function severityWeight(challenges: ValidatedChallenge[]): number {
  return challenges.reduce((total, c) => {
    switch (c.severity) {
      case "high": return total + 3;
      case "medium": return total + 2;
      case "low": return total + 1;
      default: return total;
    }
  }, 0);
}

function calculateConfidence(
  decision: ArcDecision,
  rounds: ArcRound[],
  convergence: ConvergenceState,
): number {
  const allAccepted = rounds.flatMap((r) => r.accepted);
  const weight = severityWeight(allAccepted);

  let base: number;
  switch (decision) {
    case "approve":
      base = 0.92;
      break;
    case "narrow":
      base = 0.82;
      break;
    case "revise":
      base = 0.6;
      break;
    case "escalate":
      base = 0.5;
      break;
    case "reject":
      base = 0.45;
      break;
    default:
      base = 0.5;
  }

  // Deduct for severity
  const severityPenalty = weight * 0.03;

  // Bonus for convergence (draft stabilized)
  const convergenceBonus = convergence.isStable ? 0.05 : 0;

  // Penalty for oscillation
  const oscillationPenalty = convergence.isOscillating ? 0.1 : 0;

  return Math.max(0.15, Math.min(0.98, base - severityPenalty + convergenceBonus - oscillationPenalty));
}

// ── Reason Generation ────────────────────────────────────────────────────────

function generateReasons(
  decision: ArcDecision,
  rounds: ArcRound[],
  convergence: ConvergenceState,
): string[] {
  const allAccepted = rounds.flatMap((r) => r.accepted);
  const reasons: string[] = [];

  if (allAccepted.length === 0) {
    reasons.push("No challenges survived verification. Draft is durable at the current risk tier.");
    return reasons;
  }

  for (const challenge of allAccepted) {
    reasons.push(
      `Verified ${challenge.category} challenge (${challenge.severity}): ${challenge.counterargument.slice(0, 80)}`,
    );
  }

  if (convergence.isOscillating) {
    reasons.push("Draft oscillated between states — revision introduced issues that were previously resolved.");
  }

  if (convergence.budgetExceeded) {
    reasons.push(`Budget exceeded after ${convergence.roundsCompleted} rounds without full convergence.`);
  }

  if (convergence.isStable && decision === "narrow") {
    reasons.push("Draft converged: latest revision produced no new verified challenges.");
  }

  return reasons;
}

// ── Public API ───────────────────────────────────────────────────────────────

export function judgeARC(options: {
  originalDraft: string;
  currentDraft: string;
  taskType: ArcTaskType;
  tier: ArcRiskTier;
  rounds: ArcRound[];
  convergence: ConvergenceState;
  vulnerabilityAssessment: VulnerabilityAssessment;
}): ArcJudgment {
  const { currentDraft, taskType, tier, rounds, convergence, vulnerabilityAssessment } = options;

  const allAccepted = rounds.flatMap((r) => r.accepted);
  const allRejected = rounds.flatMap((r) => r.rejected);

  const decision = pickDecision(taskType, tier, rounds, convergence);
  const confidence = calculateConfidence(decision, rounds, convergence);
  const reasons = generateReasons(decision, rounds, convergence);

  const judgment: ArcJudgment = {
    decision,
    confidence,
    reasons,
    acceptedChallenges: allAccepted,
    rejectedChallenges: allRejected,
    rounds,
    tier,
    convergence,
    vulnerabilityAssessment,
    shouldShip: decision === "approve" || decision === "narrow",
  };

  if (decision !== "reject") {
    judgment.output = currentDraft;
  }

  return judgment;
}
