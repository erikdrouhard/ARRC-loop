// ARRC Loop — Adversarial Rebuttal Relay Convergence
// Core invariant: Stability without adequate challenge coverage is not convergence.

// --- Decisions & Classifications ---

export type ArrcDecision =
  | "approve"
  | "revise"
  | "narrow"
  | "escalate"
  | "reject";

export type ArrcTaskType =
  | "general"
  | "reasoning"
  | "persona"
  | "policy"
  | "schema"
  | "support";

export type ArrcRiskTier = 0 | 1 | 2 | 3;

export type ArrcChallengeCategory =
  | "factual"
  | "logical"
  | "schema"
  | "persona"
  | "policy";

export type ArrcChallengeSeverity = "low" | "medium" | "high";

// --- Trigger Context ---

export interface ArrcTriggerContext {
  usedTools?: boolean;
  lowConfidence?: boolean;
  agentDisagreement?: boolean;
  highStakes?: boolean;
  hasStrictSchema?: boolean;
  requiresPersonaDurability?: boolean;
  userRequestedVerification?: boolean;
}

// --- Input ---

export interface ArrcInput {
  draft: string;
  taskType?: ArrcTaskType;
  taskDescription?: string;
  context?: string;
  rubric?: string[];
  metadata?: ArrcTriggerContext;
  maxRounds?: number;
}

// --- Spans ---

export interface DraftSpan {
  text: string;
  start: number;
  end: number;
}

// --- Classifier ---

export interface VulnerabilityAssessment {
  score: number;
  flaggedDimensions: ArrcChallengeCategory[];
  recommendedTier: ArrcRiskTier;
  reasons: string[];
}

// --- Challenger ---

export interface StructuredChallenge {
  id: string;
  issueKey: string;
  category: ArrcChallengeCategory;
  severity: ArrcChallengeSeverity;
  target: DraftSpan;
  counterargument: string;
  failureScenario: string;
  signal: number;
}

// --- Relay ---

export type RelayMode = "auto" | "manual";

export interface RelayPayload {
  issueKey: string;
  category: ArrcChallengeCategory;
  target: DraftSpan;
  counterargument: string;
  failureScenario: string;
}

export interface RelayContext {
  relayMode: RelayMode;
  identityMasked: boolean;
  normalizedFields: Array<"target" | "counterargument" | "failureScenario">;
  lineagePreserved: boolean;
}

export interface RelayResult {
  payload: RelayPayload;
  context: RelayContext;
  notes?: string[];
}

// --- Verifier ---

export interface VerificationResult {
  accepted: boolean;
  confidence: number;
  rationale: string;
  evidence?: string;
  abstained?: boolean;
}

export interface VerificationStrategy {
  verify(
    challenge: StructuredChallenge,
    draft: string,
    context: ArrcInput,
  ): VerificationResult;
}

// --- Reviser ---

export interface ScopedRevision {
  output: string;
  changes: Array<{
    issueKey: string;
    originalSpan: DraftSpan;
    revisedSpan: DraftSpan;
    reason: string;
  }>;
  unchanged: boolean;
  unresolvable: string[];
}

// --- Coverage ---

export interface ChallengeCoverage {
  dimensionsAttempted: ArrcChallengeCategory[];
  dimensionsAbstained: ArrcChallengeCategory[];
  admissibleChallengesProduced: number;
  verifiedChallengesProduced: number;
  coverageAdequate: boolean;
  coverageNotes: string[];
}

// --- Convergence ---

export interface ConvergenceState {
  isStable: boolean;
  isOscillating: boolean;
  budgetExceeded: boolean;
  roundsCompleted: number;
}

// --- Round ---

export interface ArrcRound {
  round: number;
  challenges: StructuredChallenge[];
  verifications: VerificationResult[];
  revision?: ScopedRevision;
}

// --- Result ---

export interface ArrcResult {
  decision: ArrcDecision;
  confidence: number;
  output?: string;
  reasons: string[];
  rounds: ArrcRound[];
  tier: ArrcRiskTier;
  convergence: ConvergenceState;
  coverage: ChallengeCoverage;
  shouldShip: boolean;
}
