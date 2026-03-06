export type ArcDecision =
  | "approve"
  | "revise"
  | "narrow"
  | "escalate"
  | "reject";

export type ArcTaskType =
  | "general"
  | "reasoning"
  | "persona"
  | "policy"
  | "schema"
  | "support";

export type ArcRiskTier = 0 | 1 | 2 | 3;

export type ArcChallengeCategory =
  | "overconfidence"
  | "missing-evidence"
  | "unsupported-assumption"
  | "instruction-coverage"
  | "tool-mismatch"
  | "persona-drift"
  | "policy-drift"
  | "schema-brittleness"
  | "ambiguity";

export type ArcChallengeSeverity = "low" | "medium" | "high";

export interface ArcTriggerContext {
  usedTools?: boolean;
  lowConfidence?: boolean;
  agentDisagreement?: boolean;
  highStakes?: boolean;
  hasStrictSchema?: boolean;
  requiresPersonaDurability?: boolean;
  userRequestedVerification?: boolean;
}

export interface ArcJudgeInput {
  draft: string;
  taskType?: ArcTaskType;
  taskDescription?: string;
  context?: string;
  rubric?: string[];
  metadata?: ArcTriggerContext;
  maxRounds?: number;
}

export interface ArcChallenge {
  id: string;
  title: string;
  category: ArcChallengeCategory;
  severity: ArcChallengeSeverity;
  critique: string;
  target: string;
  signal: number;
}

export interface ArcValidatedChallenge extends ArcChallenge {
  accepted: boolean;
  rationale: string;
}

export interface ArcRevision {
  output: string;
  revisionTargets: string[];
  notes: string[];
  changed: boolean;
}

export interface ArcRound {
  round: number;
  draft: string;
  challenges: ArcChallenge[];
  accepted: ArcValidatedChallenge[];
  rejected: ArcValidatedChallenge[];
  revision: ArcRevision;
}

export interface ArcJudgment {
  decision: ArcDecision;
  confidence: number;
  output?: string;
  reasons: string[];
  acceptedRebuttals: string[];
  rejectedRebuttals: string[];
  revisionTargets?: string[];
  notes?: string[];
  rounds: ArcRound[];
  tier: ArcRiskTier;
  shouldShip: boolean;
}
