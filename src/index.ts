// ARRC Loop — Adversarial Rebuttal Relay Convergence
// Core invariant: Stability without adequate challenge coverage is not convergence.

import { generateChallenges } from "./challenger/index.js";
import { classifyVulnerability } from "./classifier/index.js";
import { effectiveTier, maxRoundsForTier, shouldTriggerArrc } from "./hooks/index.js";
import { challengeToPayload, relayChallenge } from "./relay/index.js";
import { hasOscillation, resolveARRC } from "./resolver/index.js";
import { reviseDraft } from "./reviser/index.js";
import type {
  ArrcChallengeCategory,
  ArrcInput,
  ArrcResult,
  ArrcRound,
  ArrcTaskType,
  ChallengeCoverage,
  ConvergenceState,
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
  ArrcRound,
  ArrcTaskType,
  ArrcTriggerContext,
  ChallengeCoverage,
  ConvergenceState,
  DraftSpan,
  RelayContext,
  RelayMode,
  RelayPayload,
  RelayResult,
  ScopedRevision,
  StructuredChallenge,
  VerificationResult,
  VerificationStrategy,
  VulnerabilityAssessment,
} from "./types.js";

export { classifyVulnerability } from "./classifier/index.js";
export { generateChallenges } from "./challenger/index.js";
export { relayChallenge, relayRevision, challengeToPayload } from "./relay/index.js";
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

function buildCoverage(
  flaggedDimensions: ArrcChallengeCategory[],
  abstainedDimensions: ArrcChallengeCategory[],
  clearedDimensions: ArrcChallengeCategory[],
  rounds: ArrcRound[],
): ChallengeCoverage {
  const admissibleCount = rounds.reduce((sum, r) => sum + r.challenges.length, 0);
  const verifiedCount = rounds.reduce(
    (sum, r) => sum + r.verifications.filter((v) => v.accepted).length,
    0,
  );

  const coverageNotes: string[] = [];

  if (flaggedDimensions.length === 0) {
    coverageNotes.push("No dimensions were flagged for challenge.");
  }

  if (abstainedDimensions.length > 0) {
    coverageNotes.push(
      `Abstained on dimensions: ${abstainedDimensions.join(", ")}. ` +
        "Challenger could not produce concrete challenges for these.",
    );
  }

  if (clearedDimensions.length > 0) {
    coverageNotes.push(
      `Re-challenge of revised dimensions produced no admissible challenges: ${clearedDimensions.join(", ")}. ` +
        "Scoped revisions held.",
    );
  }

  if (admissibleCount === 0 && flaggedDimensions.length > 0) {
    coverageNotes.push("Flagged dimensions produced zero admissible challenges.");
  }

  // Coverage is adequate if:
  // 1. At least some dimensions were attempted
  // 2. Abstention rate is not too high relative to flagged dimensions
  // 3. At least some admissible challenges were produced
  const attemptedCount = flaggedDimensions.length - abstainedDimensions.length;
  const abstentionRate =
    flaggedDimensions.length > 0
      ? abstainedDimensions.length / flaggedDimensions.length
      : 0;

  const coverageAdequate =
    flaggedDimensions.length > 0 &&
    attemptedCount > 0 &&
    abstentionRate < 0.5 &&
    admissibleCount > 0;

  if (!coverageAdequate && flaggedDimensions.length > 0) {
    coverageNotes.push(
      "Coverage is inadequate. Stability under weak coverage is not convergence.",
    );
  }

  return {
    dimensionsAttempted: flaggedDimensions.filter((d) => !abstainedDimensions.includes(d)),
    dimensionsAbstained: abstainedDimensions,
    admissibleChallengesProduced: admissibleCount,
    verifiedChallengesProduced: verifiedCount,
    coverageAdequate,
    coverageNotes,
  };
}

/**
 * Run the ARRC Loop.
 *
 * The orchestrator manages sequencing, coverage, convergence, and termination.
 * It does not determine truth.
 *
 * Core invariant: Stability without adequate challenge coverage is not convergence.
 */
export function runARRC(input: ArrcInput): ArrcResult {
  const normalized = normalizeInput(input);

  // Reject empty drafts immediately
  if (normalized.draft.length === 0) {
    return {
      decision: "reject",
      confidence: 0.2,
      reasons: ["An empty draft cannot survive challenge or ship safely."],
      rounds: [],
      tier: 0,
      convergence: {
        isStable: false,
        isOscillating: false,
        budgetExceeded: false,
        roundsCompleted: 0,
      },
      coverage: {
        dimensionsAttempted: [],
        dimensionsAbstained: [],
        admissibleChallengesProduced: 0,
        verifiedChallengesProduced: 0,
        coverageAdequate: false,
        coverageNotes: ["Empty draft."],
      },
      shouldShip: false,
    };
  }

  // Classify vulnerability
  const assessment = classifyVulnerability(normalized.draft, normalized);
  const tier = effectiveTier(normalized.metadata, assessment);

  // Check if ARRC should trigger
  if (!shouldTriggerArrc(normalized.metadata, assessment)) {
    return {
      decision: "approve",
      confidence: 0.91,
      output: normalized.draft,
      reasons: [
        "ARRC bypassed. Classifier and trigger context do not indicate meaningful rebuttal risk.",
      ],
      rounds: [],
      tier,
      convergence: {
        isStable: true,
        isOscillating: false,
        budgetExceeded: false,
        roundsCompleted: 0,
      },
      coverage: {
        dimensionsAttempted: [],
        dimensionsAbstained: [],
        admissibleChallengesProduced: 0,
        verifiedChallengesProduced: 0,
        coverageAdequate: true,
        coverageNotes: ["Low-risk draft bypassed full loop."],
      },
      shouldShip: true,
    };
  }

  // Determine rounds budget
  const maxRounds = Math.min(
    normalized.maxRounds,
    maxRoundsForTier(tier),
  );

  let currentDraft = normalized.draft;
  const rounds: ArrcRound[] = [];
  // Abstention is judged on the round-1 sweep over every flagged dimension.
  // In round 2+, a re-challenged dimension that yields nothing means the scoped
  // revision held; counting that as abstention would make "narrow" unreachable.
  let abstainedDimensions: ArrcChallengeCategory[] = [];
  const clearedDimensions = new Set<ArrcChallengeCategory>();

  for (let roundNum = 1; roundNum <= maxRounds; roundNum += 1) {
    // Determine which dimensions to challenge this round
    let dimensionsToChallenge: ArrcChallengeCategory[];

    if (roundNum === 1) {
      dimensionsToChallenge = assessment.flaggedDimensions;
    } else {
      // Round 2+: focus on revised spans, unresolved issueKeys, regressions
      const prevRound = rounds[rounds.length - 1];
      const unresolvedKeys = prevRound?.revision?.unresolvable ?? [];
      const changedCategories = prevRound?.revision?.changes.map((c) => {
        // Re-challenge categories that were revised
        const matchingChallenge = prevRound.challenges.find(
          (ch) => ch.issueKey === c.issueKey,
        );
        return matchingChallenge?.category;
      }).filter((c): c is ArrcChallengeCategory => c !== undefined) ?? [];

      // Also re-challenge dimensions with unresolvable issues
      const unresolvedCategories = prevRound?.challenges
        .filter((ch) => unresolvedKeys.includes(ch.issueKey))
        .map((ch) => ch.category) ?? [];

      dimensionsToChallenge = [...new Set([...changedCategories, ...unresolvedCategories])];

      // If nothing specific to re-challenge, break early
      if (dimensionsToChallenge.length === 0) {
        break;
      }
    }

    // Generate challenges
    const generated = generateChallenges(currentDraft, normalized, dimensionsToChallenge);
    const { challenges } = generated;
    if (roundNum === 1) {
      abstainedDimensions = generated.abstainedDimensions;
    } else {
      for (const dimension of generated.abstainedDimensions) {
        clearedDimensions.add(dimension);
      }
    }

    // Relay challenges (preserve protocol constraints)
    for (const challenge of challenges) {
      const payload = challengeToPayload(challenge);
      relayChallenge(payload);
    }

    // Verify challenges
    const verifications = verifyChallenges(challenges, currentDraft, normalized);

    // Revise draft based on verified challenges
    const revision = reviseDraft(currentDraft, challenges, verifications);

    const roundEntry: ArrcRound = {
      round: roundNum,
      challenges,
      verifications,
    };
    if (!revision.unchanged) {
      roundEntry.revision = revision;
    }
    rounds.push(roundEntry);

    currentDraft = revision.output;

    // Early exit: no verified challenges survived
    const acceptedCount = verifications.filter((v) => v.accepted).length;
    if (acceptedCount === 0) {
      break;
    }

    // Early exit: nothing changed
    if (revision.unchanged) {
      break;
    }
  }

  // Build convergence state
  const convergence: ConvergenceState = {
    isStable:
      rounds.length > 0 &&
      (rounds[rounds.length - 1]?.revision === undefined ||
        rounds[rounds.length - 1]?.revision?.unchanged === true ||
        rounds[rounds.length - 1]?.verifications.every((v) => !v.accepted) === true),
    isOscillating: hasOscillation(rounds),
    budgetExceeded:
      rounds.length >= maxRounds &&
      rounds[rounds.length - 1]?.verifications.some((v) => v.accepted) === true,
    roundsCompleted: rounds.length,
  };

  // Build coverage
  const coverage = buildCoverage(
    assessment.flaggedDimensions,
    abstainedDimensions,
    [...clearedDimensions],
    rounds,
  );

  // Resolve
  return resolveARRC({
    originalDraft: normalized.draft,
    currentDraft,
    taskType: normalized.taskType,
    tier,
    rounds,
    convergence,
    coverage,
  });
}
