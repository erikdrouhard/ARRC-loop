import type {
  ArrcDecision,
  ArrcResult,
  ArrcRiskTier,
  ArrcRound,
  ArrcTaskType,
  ChallengeCoverage,
  ConvergenceState,
} from "../types.js";

/**
 * The resolver has workflow authority, not truth authority.
 *
 * It decides whether the loop has reached a justified termination state.
 * It does not decide truth.
 *
 * Core invariant: Stability without adequate challenge coverage is not convergence.
 */

function severityScore(rounds: ArrcRound[]): number {
  return rounds
    .flatMap((round) =>
      round.challenges
        .filter((_, i) => round.verifications[i]?.accepted)
        .map((c) => c.severity),
    )
    .reduce((total, severity) => {
      switch (severity) {
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

function hasOscillation(rounds: ArrcRound[]): boolean {
  if (rounds.length < 2) return false;

  // Track issueKeys that reappear after revision
  const resolvedKeys = new Set<string>();
  for (const round of rounds) {
    const verifiedKeys = round.challenges
      .filter((_, i) => round.verifications[i]?.accepted)
      .map((c) => c.issueKey);

    // Check if any previously resolved key has come back
    for (const key of verifiedKeys) {
      if (resolvedKeys.has(key)) {
        return true;
      }
    }

    // Mark all verified keys as resolved after revision
    for (const key of verifiedKeys) {
      resolvedKeys.add(key);
    }
  }

  return false;
}

function pickDecision(
  taskType: ArrcTaskType,
  tier: ArrcRiskTier,
  rounds: ArrcRound[],
  convergence: ConvergenceState,
  coverage: ChallengeCoverage,
  outputChanged: boolean,
): ArrcDecision {
  // Core invariant: stable + inadequate coverage → escalate
  if (convergence.isStable && !coverage.coverageAdequate) {
    return "escalate";
  }

  // Oscillating → escalate
  if (convergence.isOscillating) {
    return "escalate";
  }

  // Budget exceeded → escalate
  if (convergence.budgetExceeded) {
    return "escalate";
  }

  const allVerifiedChallenges = rounds.flatMap((round) =>
    round.challenges.filter((_, i) => round.verifications[i]?.accepted),
  );

  const highSeverity = allVerifiedChallenges.filter((c) => c.severity === "high").length;

  // No verified challenges + adequate coverage → approve
  if (allVerifiedChallenges.length === 0 && coverage.coverageAdequate) {
    return "approve";
  }

  // Severe verified challenges on high-stakes task → escalate
  if (highSeverity > 0 && (taskType === "schema" || taskType === "policy" || tier === 3)) {
    return "escalate";
  }

  // Multiple severe verified failures with no safe local repair → reject
  if (highSeverity >= 2 && !outputChanged) {
    return "reject";
  }

  // High severity with no change → reject
  if (highSeverity > 0 && !outputChanged) {
    return "reject";
  }

  // Check last round for unresolvable issues
  const lastRound = rounds[rounds.length - 1];
  const hasUnresolvable =
    lastRound?.revision?.unresolvable && lastRound.revision.unresolvable.length > 0;

  // Verified challenges remain that local reviser could not address → revise (upstream rewrite needed)
  if (hasUnresolvable) {
    return "revise";
  }

  // Output changed and converged → narrow
  if (outputChanged && convergence.isStable) {
    return "narrow";
  }

  // Output changed but not fully converged → revise
  if (outputChanged && !convergence.isStable) {
    return "revise";
  }

  // Fallback
  return "revise";
}

function calculateConfidence(decision: ArrcDecision, rounds: ArrcRound[]): number {
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

export function resolveARRC(options: {
  originalDraft: string;
  currentDraft: string;
  taskType: ArrcTaskType;
  tier: ArrcRiskTier;
  rounds: ArrcRound[];
  convergence: ConvergenceState;
  coverage: ChallengeCoverage;
}): ArrcResult {
  const { originalDraft, currentDraft, taskType, tier, rounds, convergence, coverage } =
    options;

  const outputChanged = currentDraft !== originalDraft;
  const decision = pickDecision(taskType, tier, rounds, convergence, coverage, outputChanged);
  const confidence = calculateConfidence(decision, rounds);

  const allVerified = rounds.flatMap((round) =>
    round.challenges.filter((_, i) => round.verifications[i]?.accepted),
  );

  const reasons: string[] = [];

  if (allVerified.length === 0 && coverage.coverageAdequate) {
    reasons.push("No verified challenge survived. Draft is stable under adequate coverage.");
  }

  for (const challenge of allVerified) {
    reasons.push(`Verified challenge [${challenge.issueKey}]: ${challenge.counterargument.slice(0, 100)}`);
  }

  if (!coverage.coverageAdequate) {
    reasons.push(
      "Stability without adequate challenge coverage is not convergence. " +
        `Coverage notes: ${coverage.coverageNotes.join("; ")}`,
    );
  }

  if (convergence.isOscillating) {
    reasons.push("Oscillation detected: same issueKey reappeared after revision.");
  }

  if (convergence.budgetExceeded) {
    reasons.push("Budget exceeded: maximum rounds reached without convergence.");
  }

  const result: ArrcResult = {
    decision,
    confidence,
    reasons,
    rounds,
    tier,
    convergence,
    coverage,
    shouldShip: decision === "approve" || decision === "narrow",
  };

  if (decision !== "reject") {
    result.output = currentDraft;
  }

  return result;
}

export { hasOscillation };
