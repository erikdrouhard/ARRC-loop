import { generateChallenges } from "./challenger/index.js";
import { selectARCTier, shouldTriggerARC } from "./hooks/index.js";
import { judgeARC } from "./judge/index.js";
import { reviseDraft } from "./reviser/index.js";
import type {
  ArcJudgeInput,
  ArcJudgment,
  ArcRound,
  ArcTaskType,
} from "./types.js";
import { validateChallenges } from "./verifier/index.js";

export type {
  ArcChallenge,
  ArcChallengeCategory,
  ArcChallengeSeverity,
  ArcDecision,
  ArcJudgeInput,
  ArcJudgment,
  ArcRevision,
  ArcRiskTier,
  ArcRound,
  ArcTaskType,
  ArcTriggerContext,
  ArcValidatedChallenge,
} from "./types.js";

export { generateChallenges } from "./challenger/index.js";
export { selectARCTier, shouldTriggerARC } from "./hooks/index.js";
export { judgeARC } from "./judge/index.js";
export { reviseDraft } from "./reviser/index.js";
export { validateChallenges } from "./verifier/index.js";

function normalizeInput(input: ArcJudgeInput): Required<Pick<ArcJudgeInput, "draft" | "maxRounds">> &
  ArcJudgeInput & { taskType: ArcTaskType } {
  return {
    ...input,
    draft: input.draft.trim(),
    maxRounds: Math.max(1, input.maxRounds ?? 2),
    taskType: input.taskType ?? "general",
  };
}

export async function runARCJudge(input: ArcJudgeInput): Promise<ArcJudgment> {
  const normalized = normalizeInput(input);

  if (normalized.draft.length === 0) {
    return {
      decision: "reject",
      confidence: 0.2,
      reasons: ["An empty draft cannot survive challenge or ship safely."],
      acceptedRebuttals: [],
      rejectedRebuttals: [],
      rounds: [],
      tier: 0,
      shouldShip: false,
    };
  }

  const tier = selectARCTier(normalized.metadata);

  if (!shouldTriggerARC(normalized.metadata)) {
    return {
      decision: "approve",
      confidence: 0.91,
      output: normalized.draft,
      reasons: ["ARC bypassed because the trigger context does not indicate meaningful rebuttal risk."],
      acceptedRebuttals: [],
      rejectedRebuttals: [],
      rounds: [],
      tier,
      shouldShip: true,
    };
  }

  let currentDraft = normalized.draft;
  const rounds: ArcRound[] = [];

  for (let round = 1; round <= normalized.maxRounds; round += 1) {
    const challenges = generateChallenges(normalized, currentDraft);
    const { accepted, rejected } = validateChallenges(challenges);
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

    if (accepted.length === 0 || !revision.changed) {
      break;
    }
  }

  return judgeARC({
    originalDraft: normalized.draft,
    currentDraft,
    taskType: normalized.taskType,
    tier,
    rounds,
  });
}
