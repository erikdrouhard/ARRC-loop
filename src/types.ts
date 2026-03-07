// ── Decision & Classification Types ──────────────────────────────────────────

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
  | "factual"
  | "logical"
  | "schema"
  | "persona"
  | "policy";

export type ArcChallengeSeverity = "low" | "medium" | "high";

// ── Vulnerability Classifier ─────────────────────────────────────────────────

export interface VulnerabilityAssessment {
  score: number; // 0-1, likelihood the draft needs full ARC loop
  flaggedDimensions: ArcChallengeCategory[];
  recommendedTier: ArcRiskTier;
  metrics: {
    claimDensity: number;
    hedgeRatio: number;
    evidenceCitationRate: number;
    structuralAlignment: number;
    confidenceToEvidenceRatio: number;
  };
}

// ── Trigger Context ──────────────────────────────────────────────────────────

export interface ArcTriggerContext {
  usedTools?: boolean;
  lowConfidence?: boolean;
  agentDisagreement?: boolean;
  highStakes?: boolean;
  hasStrictSchema?: boolean;
  requiresPersonaDurability?: boolean;
  userRequestedVerification?: boolean;
}

// ── Input ────────────────────────────────────────────────────────────────────

export interface ArcJudgeInput {
  draft: string;
  taskType?: ArcTaskType;
  taskDescription?: string;
  context?: string;
  rubric?: string[];
  metadata?: ArcTriggerContext;
  maxRounds?: number;
}

// ── Structured Challenge ─────────────────────────────────────────────────────

export interface StructuredChallenge {
  id: string;
  category: ArcChallengeCategory;
  severity: ArcChallengeSeverity;
  claim: string;           // The specific claim being challenged (quoted from draft)
  counterargument: string; // The specific counter-case
  failureScenario: string; // A concrete scenario where the draft's claim fails
  signal: number;          // Computed from structural analysis, 0-1
}

// ── Verification ─────────────────────────────────────────────────────────────

export interface VerificationResult {
  accepted: boolean;
  confidence: number;
  rationale: string;
  evidence?: string; // What grounded evidence supports acceptance/rejection
}

export interface ValidatedChallenge extends StructuredChallenge {
  verification: VerificationResult;
}

// ── Scoped Revision ──────────────────────────────────────────────────────────

export interface RevisionChange {
  originalSpan: string;  // What was in the draft
  revisedSpan: string;   // What replaced it
  reason: string;        // Which challenge drove this change
}

export interface ScopedRevision {
  output: string;
  changes: RevisionChange[];
  unchanged: boolean;
}

// ── Convergence ──────────────────────────────────────────────────────────────

export interface ConvergenceState {
  isStable: boolean;       // No new verified challenges on the latest revision
  isOscillating: boolean;  // A revision re-introduced a previously addressed issue
  budgetExceeded: boolean; // Hit max rounds (safety valve)
  roundsCompleted: number;
}

// ── Round ────────────────────────────────────────────────────────────────────

export interface ArcRound {
  round: number;
  draft: string;
  challenges: StructuredChallenge[];
  accepted: ValidatedChallenge[];
  rejected: ValidatedChallenge[];
  revision: ScopedRevision;
}

// ── Judgment ─────────────────────────────────────────────────────────────────

export interface ArcJudgment {
  decision: ArcDecision;
  confidence: number;
  output?: string;
  reasons: string[];
  acceptedChallenges: ValidatedChallenge[];
  rejectedChallenges: ValidatedChallenge[];
  rounds: ArcRound[];
  tier: ArcRiskTier;
  convergence: ConvergenceState;
  vulnerabilityAssessment: VulnerabilityAssessment;
  shouldShip: boolean;
}
