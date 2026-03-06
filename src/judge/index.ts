import type {
  ArcDecision,
  ArcJudgment,
  ArcRiskTier,
  ArcRound,
  ArcTaskType,
} from "../types.js";

function severityScore(rounds: ArcRound[]): number {
  return rounds.flatMap((round) => round.accepted).reduce((total, challenge) => {
    switch (challenge.severity) {
      case "high":
        return total + 3;
      case "medium":
        return total + 2;
      case "low":
        return total + 1;
      default:
        return total;
    }
  }, 0);
}

function pickDecision(
  taskType: ArcTaskType,
  tier: ArcRiskTier,
  rounds: ArcRound[],
  outputChanged: boolean,
): ArcDecision {
  const accepted = rounds.flatMap((round) => round.accepted);
  const highSeverity = accepted.filter((challenge) => challenge.severity === "high").length;

  if (accepted.length === 0) {
    return "approve";
  }

  if (highSeverity > 0 && (taskType === "schema" || taskType === "policy" || tier === 3)) {
    return "escalate";
  }

  if (highSeverity > 0 && !outputChanged) {
    return "reject";
  }

  if (outputChanged) {
    return "narrow";
  }

  return "revise";
}

function calculateConfidence(decision: ArcDecision, rounds: ArcRound[]): number {
  const score = severityScore(rounds);

  switch (decision) {
    case "approve":
      return 0.9;
    case "narrow":
      return Math.max(0.62, 0.88 - score * 0.04);
    case "revise":
      return Math.max(0.3, 0.68 - score * 0.05);
    case "escalate":
      return Math.max(0.25, 0.6 - score * 0.04);
    case "reject":
      return Math.max(0.2, 0.55 - score * 0.04);
    default:
      return 0.5;
  }
}

export function judgeARC(options: {
  originalDraft: string;
  currentDraft: string;
  taskType: ArcTaskType;
  tier: ArcRiskTier;
  rounds: ArcRound[];
}): ArcJudgment {
  const { originalDraft, currentDraft, taskType, tier, rounds } = options;
  const acceptedRebuttals = rounds.flatMap((round) => round.accepted.map((item) => item.title));
  const rejectedRebuttals = rounds.flatMap((round) => round.rejected.map((item) => item.title));
  const revisionTargets = rounds.flatMap((round) => round.revision.revisionTargets);
  const notes = rounds.flatMap((round) => round.revision.notes);
  const outputChanged = currentDraft !== originalDraft;
  const decision = pickDecision(taskType, tier, rounds, outputChanged);
  const confidence = calculateConfidence(decision, rounds);

  const reasons =
    acceptedRebuttals.length === 0
      ? ["No material rebuttal survived validation at the current ARC tier."]
      : acceptedRebuttals.map((title) => `Accepted rebuttal: ${title}`);

  const judgment: ArcJudgment = {
    decision,
    confidence,
    reasons,
    acceptedRebuttals,
    rejectedRebuttals,
    rounds,
    tier,
    shouldShip: decision === "approve" || decision === "narrow",
  };

  if (decision !== "reject") {
    judgment.output = currentDraft;
  }

  if (revisionTargets.length > 0) {
    judgment.revisionTargets = revisionTargets;
  }

  if (notes.length > 0) {
    judgment.notes = notes;
  }

  return judgment;
}
