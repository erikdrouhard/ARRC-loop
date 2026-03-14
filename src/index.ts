// ARRC Loop v2 — Adversarial Rebuttal Relay Convergence
// Core invariant: Stability without adequate challenge coverage is not convergence.

import { generateChallenges } from "./challenger/index.js";
import { classifyVulnerability } from "./classifier/index.js";
import { effectiveTier, maxRoundsForTier, shouldTriggerArrc } from "./hooks/index.js";
import { relayChallenges } from "./relay/index.js";
import { resolveARRC } from "./resolver/index.js";
import { reviseDraft } from "./reviser/index.js";
import type {
  ArrcChallengeCategory,
  ArrcInput,
  ArrcResult,
  ArrcTaskType,
  ChallengeCoverageV2,
  ConvergenceState,
  DimensionCoverage,
  IssueRecord,
  IssueStatus,
  RelayedChallenge,
  RoundCoverage,
  VerificationResult,
} from "./types.js";
import { verifyChallenges } from "./verifier/index.js";

// --- Re-exports ---

export type {
  ArrcChallengeCategory,
  ArrcChallengeSeverity,
  ArrcDecision,
  ArrcInput,
  ArrcResult,
  ArrcRiskTier,
  ArrcTaskType,
  ArrcTriggerContext,
  CandidateIssue,
  ChallengeCoverageV2,
  ConvergenceState,
  DimensionCoverage,
  DraftSpan,
  EvidenceClass,
  IssueRecord,
  IssueStatus,
  RelayedChallenge,
  RepairResult,
  RepairStrategy,
  RoundCoverage,
  VerificationResult,
  VulnerabilityAssessment,
} from "./types.js";

export { classifyVulnerability } from "./classifier/index.js";
export { generateChallenges } from "./challenger/index.js";
export { relayChallenges, relayChallenge } from "./relay/index.js";
export { verifyChallenges } from "./verifier/index.js";
export { reviseDraft } from "./reviser/index.js";
export { resolveARRC } from "./resolver/index.js";
export { selectArrcTier, shouldTriggerArrc, effectiveTier, maxRoundsForTier } from "./hooks/index.js";

// --- Orchestrator ---

function normalizeInput(
  input: ArrcInput,
): ArrcInput & { draft: string; taskType: ArrcTaskType; maxRounds: number } {
  return {
    ...input,
    draft: input.draft.trim(),
    maxRounds: Math.max(1, input.maxRounds ?? 2),
    taskType: input.taskType ?? "general",
  };
}

/**
 * Create or update an IssueRecord from a relayed challenge and verification.
 */
function upsertIssue(
  existing: IssueRecord | undefined,
  challenge: RelayedChallenge,
  verification: VerificationResult,
  round: number,
): IssueRecord {
  if (existing) {
    // Update existing issue
    existing.latestRound = round;
    const vhEntry: IssueRecord["verificationHistory"][number] = {
      round,
      accepted: verification.accepted,
      rationale: verification.rationale,
      evidenceClass: verification.evidenceClass,
      confidence: verification.confidence,
    };
    if (verification.abstained === true) vhEntry.abstained = true;
    existing.verificationHistory.push(vhEntry);

    // Update status based on new verification
    if (verification.accepted) {
      if (existing.status === "repaired" || existing.status === "resolved") {
        // Was repaired/resolved but reappeared
        // Check if there was a meaningful state change
        const lastRepair = existing.repairHistory[existing.repairHistory.length - 1];
        if (lastRepair && lastRepair.applied && lastRepair.before !== lastRepair.after) {
          // Meaningful repair happened but issue reappeared → oscillating
          existing.status = "oscillating";
        } else {
          // Repair didn't change anything → persistent
          existing.status = "persistent";
        }
      } else if (existing.status === "persistent") {
        // Still persistent
        existing.status = "persistent";
      } else {
        existing.status = "verified";
      }
    }
    return existing;
  }

  // Create new issue
  const status: IssueStatus = verification.accepted
    ? "verified"
    : verification.abstained === true
      ? "abstained"
      : "candidate";

  const targetSpan: IssueRecord["target"] = {
    text: challenge.canonicalTarget.text,
    start: challenge.canonicalTarget.start,
    end: challenge.canonicalTarget.end,
  };
  if (challenge.canonicalTarget.sentenceIndex !== undefined) {
    targetSpan.sentenceIndex = challenge.canonicalTarget.sentenceIndex;
  }

  const newVh: IssueRecord["verificationHistory"][number] = {
    round,
    accepted: verification.accepted,
    rationale: verification.rationale,
    evidenceClass: verification.evidenceClass,
    confidence: verification.confidence,
  };
  if (verification.abstained === true) newVh.abstained = true;

  return {
    issueKey: challenge.issueKey,
    category: challenge.category,
    fingerprint: challenge.fingerprint,
    discoveredRound: round,
    latestRound: round,
    target: targetSpan,
    challenge: {
      counterargument: challenge.counterargument,
      failureScenario: challenge.failureScenario,
      severity: challenge.severity,
      signal: challenge.signal,
    },
    relay: {
      canonicalTargetText: challenge.canonicalTarget.text,
      lineageToken: challenge.lineageToken,
      normalized: !challenge.downgraded,
      protocolWarnings: challenge.protocolWarnings,
    },
    verificationHistory: [newVh],
    repairHistory: [],
    status,
  };
}

/**
 * Re-verify a specific issue after repair.
 * Checks whether the original triggering issue is resolved in the new draft.
 */
function reverifyIssue(
  issue: IssueRecord,
  newDraft: string,
  input: ArrcInput,
  round: number,
): void {
  // Build a synthetic relayed challenge from the issue for re-verification
  const synTarget: RelayedChallenge["canonicalTarget"] = {
    text: issue.target.text,
    start: issue.target.start,
    end: issue.target.end,
  };
  if (issue.target.sentenceIndex !== undefined) {
    synTarget.sentenceIndex = issue.target.sentenceIndex;
  }

  const syntheticChallenge: RelayedChallenge = {
    issueKey: issue.issueKey,
    category: issue.category,
    severity: issue.challenge.severity,
    canonicalTarget: synTarget,
    counterargument: issue.challenge.counterargument,
    failureScenario: issue.challenge.failureScenario,
    lineageToken: issue.relay.lineageToken,
    signal: issue.challenge.signal,
    protocolWarnings: [],
    downgraded: false,
    fingerprint: issue.fingerprint,
  };

  const [verification] = verifyChallenges([syntheticChallenge], newDraft, input);
  if (!verification) return;

  const reVh: IssueRecord["verificationHistory"][number] = {
    round,
    accepted: verification.accepted,
    rationale: `Re-verification after repair: ${verification.rationale}`,
    evidenceClass: verification.evidenceClass,
    confidence: verification.confidence,
  };
  if (verification.abstained === true) reVh.abstained = true;
  issue.verificationHistory.push(reVh);

  if (!verification.accepted) {
    issue.status = "resolved";
  } else {
    // Issue still present after repair
    const lastRepair = issue.repairHistory[issue.repairHistory.length - 1];
    if (lastRepair && lastRepair.applied && lastRepair.before !== lastRepair.after) {
      // Repair changed text but issue persists → regressed
      issue.status = "regressed";
    } else {
      issue.status = "persistent";
    }
  }
}

/**
 * Build round-aware coverage report.
 */
function buildCoverage(
  flaggedDimensions: ArrcChallengeCategory[],
  issues: IssueRecord[],
  roundData: Array<{
    round: number;
    dimensionsAttempted: ArrcChallengeCategory[];
    abstentions: Array<{ dimension: ArrcChallengeCategory; reason: string }>;
    issueKeysChallenged: string[];
    issueKeysVerified: string[];
    issueKeysResolved: string[];
  }>,
): ChallengeCoverageV2 {
  // Build per-dimension coverage
  const allDimensions = [...new Set([
    ...flaggedDimensions,
    ...issues.map((i) => i.category),
  ])] as ArrcChallengeCategory[];

  const byDimension: DimensionCoverage[] = allDimensions.map((dim) => {
    const dimIssues = issues.filter((i) => i.category === dim);
    const attemptedRounds = roundData
      .filter((r) => r.dimensionsAttempted.includes(dim))
      .map((r) => r.round);
    const abstainedRounds = roundData
      .filter((r) => r.abstentions.some((a) => a.dimension === dim))
      .map((r) => r.round);

    const admissibleKeys = dimIssues
      .filter((i) => i.status !== "candidate")
      .map((i) => i.issueKey);
    const verifiedKeys = dimIssues
      .filter((i) =>
        i.verificationHistory.some((v) => v.accepted),
      )
      .map((i) => i.issueKey);
    const resolvedKeys = dimIssues
      .filter((i) => i.status === "resolved")
      .map((i) => i.issueKey);
    const unresolvedKeys = dimIssues
      .filter((i) =>
        i.status === "verified" ||
        i.status === "persistent" ||
        i.status === "unrepairable" ||
        i.status === "regressed" ||
        i.status === "oscillating",
      )
      .map((i) => i.issueKey);

    const notes: string[] = [];

    // Coverage is adequate for this dimension if:
    // - it was attempted in at least one round
    // - it was not abstained in ALL attempted rounds
    const attemptedCount = attemptedRounds.length;
    const abstainedCount = abstainedRounds.length;
    const realAttempts = attemptedCount - abstainedCount;

    let coverageAdequate = false;
    if (!flaggedDimensions.includes(dim)) {
      coverageAdequate = true; // not flagged, coverage N/A
    } else if (realAttempts > 0 && admissibleKeys.length > 0) {
      coverageAdequate = true;
    } else if (realAttempts > 0 && admissibleKeys.length === 0) {
      // Attempted but produced nothing admissible — still counts as coverage
      // (challenger tried honestly and found nothing)
      coverageAdequate = true;
      notes.push(`Dimension ${dim}: attempted but no admissible challenges produced.`);
    } else {
      notes.push(`Dimension ${dim}: not adequately covered (${abstainedCount}/${attemptedCount} rounds abstained).`);
    }

    return {
      dimension: dim,
      flagged: flaggedDimensions.includes(dim),
      attemptedRounds,
      abstainedRounds,
      admissibleIssueKeys: admissibleKeys,
      verifiedIssueKeys: verifiedKeys,
      resolvedIssueKeys: resolvedKeys,
      unresolvedIssueKeys: unresolvedKeys,
      coverageAdequate,
      notes,
    };
  });

  const byRound: RoundCoverage[] = roundData.map((r) => ({
    round: r.round,
    dimensionsAttempted: r.dimensionsAttempted,
    issueKeysChallenged: r.issueKeysChallenged,
    issueKeysVerified: r.issueKeysVerified,
    issueKeysResolved: r.issueKeysResolved,
    abstentions: r.abstentions,
  }));

  // Overall adequacy: all flagged dimensions must be adequate
  const flaggedCoverage = byDimension.filter((d) => d.flagged);
  const overallAdequate =
    flaggedCoverage.length > 0 &&
    flaggedCoverage.every((d) => d.coverageAdequate);

  const notes: string[] = [];
  if (!overallAdequate && flaggedDimensions.length > 0) {
    const inadequate = flaggedCoverage
      .filter((d) => !d.coverageAdequate)
      .map((d) => d.dimension);
    notes.push(
      `Inadequate coverage on: ${inadequate.join(", ")}. ` +
      "Stability under weak coverage is not convergence.",
    );
  }
  if (flaggedDimensions.length === 0) {
    notes.push("No dimensions flagged for challenge.");
  }

  return { byDimension, byRound, overallAdequate, notes };
}

/**
 * Run the ARRC Loop.
 *
 * The orchestrator manages:
 * - Issue lifecycle tracking across rounds
 * - Round-aware coverage accounting
 * - Re-verification after repair
 * - Convergence detection (persistence vs oscillation vs regression)
 *
 * Core invariant: Stability without adequate challenge coverage is not convergence.
 */
export function runARRC(input: ArrcInput): ArrcResult {
  const normalized = normalizeInput(input);

  // Reject empty drafts
  if (normalized.draft.length === 0) {
    return {
      decision: "reject",
      confidence: 0.2,
      reasons: ["Empty draft cannot ship."],
      issues: [],
      tier: 0,
      convergence: {
        isStable: false,
        hasPersistentIssues: false,
        hasOscillation: false,
        hasRegression: false,
        budgetExceeded: false,
        roundsCompleted: 0,
      },
      coverage: {
        byDimension: [],
        byRound: [],
        overallAdequate: false,
        notes: ["Empty draft."],
      },
      shouldShip: false,
    };
  }

  // Classify
  const assessment = classifyVulnerability(normalized.draft, normalized);
  const tier = effectiveTier(normalized.metadata, assessment);

  // Check trigger
  if (!shouldTriggerArrc(normalized.metadata, assessment)) {
    return {
      decision: "approve",
      confidence: 0.91,
      output: normalized.draft,
      reasons: ["ARRC bypassed. Low-risk draft."],
      issues: [],
      tier,
      convergence: {
        isStable: true,
        hasPersistentIssues: false,
        hasOscillation: false,
        hasRegression: false,
        budgetExceeded: false,
        roundsCompleted: 0,
      },
      coverage: {
        byDimension: [],
        byRound: [],
        overallAdequate: true,
        notes: ["Low-risk draft bypassed full loop."],
      },
      shouldShip: true,
    };
  }

  // Determine budget
  const maxRounds = Math.min(normalized.maxRounds, maxRoundsForTier(tier));

  let currentDraft = normalized.draft;
  const issueMap = new Map<string, IssueRecord>();
  const roundCoverageData: Array<{
    round: number;
    dimensionsAttempted: ArrcChallengeCategory[];
    abstentions: Array<{ dimension: ArrcChallengeCategory; reason: string }>;
    issueKeysChallenged: string[];
    issueKeysVerified: string[];
    issueKeysResolved: string[];
  }> = [];

  for (let roundNum = 1; roundNum <= maxRounds; roundNum++) {
    // Determine dimensions to challenge
    let dimensionsToChallenge: ArrcChallengeCategory[];

    if (roundNum === 1) {
      dimensionsToChallenge = assessment.flaggedDimensions;
    } else {
      // Re-challenge dimensions with unresolved or persistent issues
      const unresolvedDims = new Set<ArrcChallengeCategory>();
      for (const issue of issueMap.values()) {
        if (
          issue.status === "verified" ||
          issue.status === "persistent" ||
          issue.status === "regressed" ||
          issue.status === "unrepairable"
        ) {
          unresolvedDims.add(issue.category);
        }
      }
      dimensionsToChallenge = [...unresolvedDims];

      if (dimensionsToChallenge.length === 0) break;
    }

    // Generate challenges
    const { challenges: preRelay, abstainedDimensions } = generateChallenges(
      currentDraft,
      normalized,
      dimensionsToChallenge,
    );

    // Relay challenges — this is the material protocol step
    const relayed = relayChallenges(preRelay, { round: roundNum });

    // Verify relayed challenges
    const verifications = verifyChallenges(relayed, currentDraft, normalized);

    // Track round coverage
    const roundIssueKeys: string[] = [];
    const roundVerifiedKeys: string[] = [];

    // Update issue lifecycle
    for (let i = 0; i < relayed.length; i++) {
      const challenge = relayed[i]!;
      const verification = verifications[i]!;

      const existing = issueMap.get(challenge.issueKey);
      const issue = upsertIssue(existing, challenge, verification, roundNum);
      issueMap.set(challenge.issueKey, issue);

      roundIssueKeys.push(challenge.issueKey);
      if (verification.accepted) {
        roundVerifiedKeys.push(challenge.issueKey);
      }
    }

    // Revise draft based on verified challenges
    const verifiedChallenges = relayed.filter((_, i) => verifications[i]?.accepted);
    const verifiedVerifications = verifications.filter((v) => v.accepted);

    const revision = reviseDraft(currentDraft, relayed, verifications);

    // Record repairs in issue lifecycle
    for (const repairEntry of revision.repairs) {
      const issue = issueMap.get(repairEntry.issueKey);
      if (issue) {
        issue.repairHistory.push({
          round: roundNum,
          applied: repairEntry.repair.applied,
          reason: repairEntry.repair.reason,
          strategy: repairEntry.repair.strategy,
          before: repairEntry.repair.before,
          after: repairEntry.repair.after,
        });

        if (repairEntry.repair.applied) {
          issue.status = "repaired";
        } else if (repairEntry.repair.strategy === "unsupported") {
          issue.status = "unrepairable";
        }
      }
    }

    const previousDraft = currentDraft;
    currentDraft = revision.output;

    // Re-verify repaired issues against the NEW draft
    const roundResolvedKeys: string[] = [];
    for (const repairEntry of revision.repairs) {
      if (repairEntry.repair.applied) {
        const issue = issueMap.get(repairEntry.issueKey);
        if (issue) {
          reverifyIssue(issue, currentDraft, normalized, roundNum);
          if (issue.status === "resolved") {
            roundResolvedKeys.push(issue.issueKey);
          }
        }
      }
    }

    // Record round coverage
    roundCoverageData.push({
      round: roundNum,
      dimensionsAttempted: dimensionsToChallenge.filter(
        (d) => !abstainedDimensions.includes(d),
      ),
      abstentions: abstainedDimensions.map((d) => ({
        dimension: d,
        reason: "Challenger could not produce concrete challenges.",
      })),
      issueKeysChallenged: roundIssueKeys,
      issueKeysVerified: roundVerifiedKeys,
      issueKeysResolved: roundResolvedKeys,
    });

    // Early exit: no verified challenges this round
    if (verifiedChallenges.length === 0) break;

    // Early exit: nothing changed
    if (revision.unchanged) break;
  }

  // Build convergence state
  const issues = [...issueMap.values()];
  const hasPersistentIssues = issues.some((i) => i.status === "persistent");
  const hasOscillation = issues.some((i) => i.status === "oscillating");
  const hasRegression = issues.some((i) => i.status === "regressed");

  const lastRoundHadUnresolved = issues.some((i) =>
    i.status === "verified" || i.status === "persistent" || i.status === "regressed",
  );

  const convergence: ConvergenceState = {
    isStable: !hasOscillation && !hasRegression && !lastRoundHadUnresolved,
    hasPersistentIssues,
    hasOscillation,
    hasRegression,
    budgetExceeded: roundCoverageData.length >= maxRounds && lastRoundHadUnresolved,
    roundsCompleted: roundCoverageData.length,
  };

  // Build coverage
  const coverage = buildCoverage(
    assessment.flaggedDimensions,
    issues,
    roundCoverageData,
  );

  // Resolve
  return resolveARRC({
    originalDraft: normalized.draft,
    currentDraft,
    taskType: normalized.taskType,
    tier,
    issues,
    convergence,
    coverage,
  });
}
