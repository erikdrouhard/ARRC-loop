import { classifyVulnerability } from "./classifier/index.js";
import { generateChallenges } from "./challenger/index.js";
import { shouldTriggerARC, effectiveTier } from "./hooks/index.js";
import { judgeARC } from "./judge/index.js";
import { reviseDraft } from "./reviser/index.js";
import { validateChallenges } from "./verifier/index.js";
import type {
  ArcJudgeInput,
  ArcJudgment,
  ArcRound,
  ArcTaskType,
  ConvergenceState,
  ValidatedChallenge,
} from "./types.js";

// ── Re-exports ───────────────────────────────────────────────────────────────

export type {
  ArcChallengeCategory,
  ArcChallengeSeverity,
  ArcDecision,
  ArcJudgeInput,
  ArcJudgment,
  ArcRiskTier,
  ArcRound,
  ArcTaskType,
  ArcTriggerContext,
  ConvergenceState,
  RevisionChange,
  ScopedRevision,
  StructuredChallenge,
  ValidatedChallenge,
  VerificationResult,
  VulnerabilityAssessment,
} from "./types.js";

export { classifyVulnerability } from "./classifier/index.js";
export { generateChallenges } from "./challenger/index.js";
export { shouldTriggerARC, effectiveTier, selectARCTier } from "./hooks/index.js";
export { judgeARC } from "./judge/index.js";
export { reviseDraft } from "./reviser/index.js";
export { validateChallenges } from "./verifier/index.js";

// ── Input Normalization ──────────────────────────────────────────────────────

function normalizeInput(input: ArcJudgeInput): Required<Pick<ArcJudgeInput, "draft" | "maxRounds">> &
  ArcJudgeInput & { taskType: ArcTaskType } {
  return {
    ...input,
    draft: input.draft.trim(),
    maxRounds: Math.max(1, input.maxRounds ?? 3),
    taskType: input.taskType ?? "general",
  };
}

// ── Convergence Detection ────────────────────────────────────────────────────

function detectOscillation(rounds: ArcRound[]): boolean {
  if (rounds.length < 2) return false;

  // Check if a previously-addressed challenge category reappeared
  const addressedCategories = new Set<string>();

  for (let i = 0; i < rounds.length; i++) {
    const round = rounds[i]!;
    const currentCategories = new Set(round.accepted.map((c: ValidatedChallenge) => c.category));

    // If any category was previously addressed (had changes applied) and reappeared
    for (const cat of currentCategories) {
      if (addressedCategories.has(cat)) {
        return true; // Oscillation detected
      }
    }

    // Mark categories that were addressed (revised) this round
    if (!round.revision.unchanged) {
      for (const change of round.revision.changes) {
        // Extract category from the reason (format: "category:id — ...")
        const catMatch = change.reason.match(/^(\w+):/);
        if (catMatch?.[1]) {
          addressedCategories.add(catMatch[1]);
        }
      }
    }
  }

  return false;
}

function computeConvergence(
  rounds: ArcRound[],
  maxRounds: number,
): ConvergenceState {
  const lastRound = rounds[rounds.length - 1];
  const isStable = lastRound ? lastRound.accepted.length === 0 : true;
  const isOscillating = detectOscillation(rounds);
  const budgetExceeded = rounds.length >= maxRounds;

  return {
    isStable,
    isOscillating,
    budgetExceeded,
    roundsCompleted: rounds.length,
  };
}

// ── Main Entry Point ─────────────────────────────────────────────────────────

export function runARCJudge(input: ArcJudgeInput): ArcJudgment {
  const normalized = normalizeInput(input);

  // Empty draft → immediate reject
  if (normalized.draft.length === 0) {
    const emptyAssessment = classifyVulnerability("", normalized);
    return {
      decision: "reject",
      confidence: 0.2,
      reasons: ["An empty draft cannot survive challenge or ship safely."],
      acceptedChallenges: [],
      rejectedChallenges: [],
      rounds: [],
      tier: 0,
      convergence: { isStable: true, isOscillating: false, budgetExceeded: false, roundsCompleted: 0 },
      vulnerabilityAssessment: emptyAssessment,
      shouldShip: false,
    };
  }

  // Run the vulnerability classifier (cheap, fast, no LLM)
  const assessment = classifyVulnerability(normalized.draft, normalized);
  const tier = effectiveTier(normalized, assessment);

  // Gate: if not vulnerable and no context triggers, skip ARC loop
  if (!shouldTriggerARC(normalized, assessment)) {
    return {
      decision: "approve",
      confidence: 0.93,
      output: normalized.draft,
      reasons: ["Vulnerability classifier determined the draft does not need adversarial challenge."],
      acceptedChallenges: [],
      rejectedChallenges: [],
      rounds: [],
      tier,
      convergence: { isStable: true, isOscillating: false, budgetExceeded: false, roundsCompleted: 0 },
      vulnerabilityAssessment: assessment,
      shouldShip: true,
    };
  }

  // ── ARC Loop with Convergence Detection ──────────────────────────────────

  let currentDraft = normalized.draft;
  const rounds: ArcRound[] = [];

  for (let round = 1; round <= normalized.maxRounds; round++) {
    // Generate dimension-specific challenges
    const challenges = generateChallenges(currentDraft, normalized, assessment);

    // If no challenges generated (nothing to challenge), we're done
    if (challenges.length === 0) {
      rounds.push({
        round,
        draft: currentDraft,
        challenges: [],
        accepted: [],
        rejected: [],
        revision: { output: currentDraft, changes: [], unchanged: true },
      });
      break;
    }

    // Verify challenges with grounded strategies
    const { accepted, rejected } = validateChallenges(challenges, currentDraft, normalized);

    // Revise only if there are verified challenges
    const revision = reviseDraft(currentDraft, accepted);

    rounds.push({
      round,
      draft: currentDraft,
      challenges,
      accepted,
      rejected,
      revision,
    });

    currentDraft = revision.output;

    // Check convergence
    const convergence = computeConvergence(rounds, normalized.maxRounds);

    // Exit conditions
    if (convergence.isStable) break;       // No new verified challenges → done
    if (convergence.isOscillating) break;  // Flip-flopping → escalate
    if (convergence.budgetExceeded) break; // Safety valve
  }

  // Final convergence state
  const convergence = computeConvergence(rounds, normalized.maxRounds);

  return judgeARC({
    originalDraft: normalized.draft,
    currentDraft,
    taskType: normalized.taskType,
    tier,
    rounds,
    convergence,
    vulnerabilityAssessment: assessment,
  });
}
