import type {
  ArrcDecision,
  ArrcResult,
  ArrcRiskTier,
  ArrcTaskType,
  ChallengeCoverageV2,
  ConvergenceState,
  IssueRecord,
} from "../types.js";

/**
 * The resolver has workflow authority, not truth authority.
 *
 * It determines whether the loop has reached a justified termination state.
 * It reasons from issue lifecycle state, not just counts.
 *
 * Core invariant: Stability without adequate challenge coverage is not convergence.
 */

function pickDecision(
  issues: IssueRecord[],
  convergence: ConvergenceState,
  coverage: ChallengeCoverageV2,
  tier: ArrcRiskTier,
  taskType: ArrcTaskType,
  outputChanged: boolean,
): ArrcDecision {
  // Core invariant: stable + inadequate coverage → escalate
  if (convergence.isStable && !coverage.overallAdequate) {
    return "escalate";
  }

  // True oscillation → escalate
  if (convergence.hasOscillation) {
    return "escalate";
  }

  // Budget exceeded with unresolved issues → escalate
  if (convergence.budgetExceeded) {
    const unresolvedVerified = issues.filter((i) =>
      i.status === "verified" || i.status === "persistent" || i.status === "regressed",
    );
    if (unresolvedVerified.length > 0) {
      return "escalate";
    }
  }

  // Categorize issues by lifecycle status
  const resolved = issues.filter((i) => i.status === "resolved");
  const persistent = issues.filter((i) => i.status === "persistent");
  const unrepairable = issues.filter((i) => i.status === "unrepairable");
  const regressed = issues.filter((i) => i.status === "regressed");
  const verified = issues.filter((i) => i.status === "verified");
  const oscillating = issues.filter((i) => i.status === "oscillating");

  // Oscillating issues → escalate
  if (oscillating.length > 0) {
    return "escalate";
  }

  // Multiple high-severity unresolved issues with no repair path → reject
  const highSeverityUnresolved = [...verified, ...persistent, ...unrepairable].filter(
    (i) => i.challenge.severity === "high",
  );
  if (highSeverityUnresolved.length >= 2 && !outputChanged) {
    return "reject";
  }

  // High severity + high-stakes task + unrepairable → escalate
  if (highSeverityUnresolved.length > 0 && (taskType === "schema" || taskType === "policy" || tier === 3)) {
    return "escalate";
  }

  // Single high severity + no change → reject
  if (highSeverityUnresolved.length > 0 && !outputChanged) {
    return "reject";
  }

  // Unrepairable issues need upstream work → revise
  if (unrepairable.length > 0) {
    return "revise";
  }

  // Persistent issues → revise (repair failed, upstream needed)
  if (persistent.length > 0) {
    return "revise";
  }

  // Regressed issues → revise
  if (regressed.length > 0) {
    return "revise";
  }

  // No unresolved verified issues and adequate coverage
  const allVerifiedOrWorse = [...verified, ...persistent, ...unrepairable, ...regressed, ...oscillating];

  // All verified issues were resolved + output changed → narrow
  if (
    resolved.length > 0 &&
    allVerifiedOrWorse.length === 0 &&
    outputChanged &&
    convergence.isStable
  ) {
    return "narrow";
  }

  // No issues or all resolved with no output change → approve
  if (allVerifiedOrWorse.length === 0 && coverage.overallAdequate) {
    return "approve";
  }

  // Output changed but not fully converged → revise
  if (outputChanged && !convergence.isStable) {
    return "revise";
  }

  // Fallback
  return "revise";
}

function calculateConfidence(decision: ArrcDecision, issues: IssueRecord[]): number {
  const severityWeight = issues.reduce((total, issue) => {
    if (issue.status === "resolved" || issue.status === "abstained" || issue.status === "candidate") {
      return total;
    }
    switch (issue.challenge.severity) {
      case "high": return total + 3;
      case "medium": return total + 2;
      case "low": return total + 1;
      default: return total;
    }
  }, 0);

  switch (decision) {
    case "approve": return 0.9;
    case "narrow": return Math.max(0.62, 0.88 - severityWeight * 0.04);
    case "revise": return Math.max(0.3, 0.68 - severityWeight * 0.05);
    case "escalate": return Math.max(0.25, 0.6 - severityWeight * 0.04);
    case "reject": return Math.max(0.2, 0.55 - severityWeight * 0.04);
    default: return 0.5;
  }
}

export function resolveARRC(options: {
  originalDraft: string;
  currentDraft: string;
  taskType: ArrcTaskType;
  tier: ArrcRiskTier;
  issues: IssueRecord[];
  convergence: ConvergenceState;
  coverage: ChallengeCoverageV2;
}): ArrcResult {
  const { originalDraft, currentDraft, taskType, tier, issues, convergence, coverage } = options;

  const outputChanged = currentDraft !== originalDraft;
  const decision = pickDecision(issues, convergence, coverage, tier, taskType, outputChanged);
  const confidence = calculateConfidence(decision, issues);

  const reasons: string[] = [];

  // Explain the decision from issue lifecycle
  const resolved = issues.filter((i) => i.status === "resolved");
  const persistent = issues.filter((i) => i.status === "persistent");
  const unrepairable = issues.filter((i) => i.status === "unrepairable");
  const regressed = issues.filter((i) => i.status === "regressed");
  const oscillating = issues.filter((i) => i.status === "oscillating");
  const verified = issues.filter((i) => i.status === "verified");

  if (decision === "approve") {
    if (issues.length === 0) {
      reasons.push("No issues detected. Draft bypassed or no challenges survived.");
    } else {
      reasons.push(`All ${resolved.length} verified issue(s) resolved. Coverage adequate.`);
    }
  }

  if (decision === "narrow") {
    reasons.push(
      `${resolved.length} issue(s) resolved via scoped repair. Output changed but converged.`,
    );
  }

  for (const issue of verified) {
    reasons.push(`Verified [${issue.issueKey}]: ${issue.challenge.counterargument.slice(0, 100)}`);
  }

  for (const issue of persistent) {
    reasons.push(`Persistent [${issue.issueKey}]: repair failed or did nothing.`);
  }

  for (const issue of unrepairable) {
    const lastRepair = issue.repairHistory[issue.repairHistory.length - 1];
    reasons.push(
      `Unrepairable [${issue.issueKey}]: ${lastRepair?.reason ?? "no repair attempted"}.`,
    );
  }

  for (const issue of regressed) {
    reasons.push(`Regressed [${issue.issueKey}]: issue reappeared after repair.`);
  }

  for (const issue of oscillating) {
    reasons.push(`Oscillating [${issue.issueKey}]: meaningful state change followed by reappearance.`);
  }

  if (!coverage.overallAdequate) {
    reasons.push(
      "Stability without adequate challenge coverage is not convergence. " +
      `${coverage.notes.join("; ")}`,
    );
  }

  if (convergence.budgetExceeded) {
    reasons.push("Budget exceeded: maximum rounds reached without full convergence.");
  }

  const result: ArrcResult = {
    decision,
    confidence,
    reasons,
    issues,
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
