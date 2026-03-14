// ARRC Loop v2 — Adversarial Rebuttal Relay Convergence
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

// --- Evidence Taxonomy ---

export type EvidenceClass =
  | "none"
  | "explanatory"
  | "citation-like"
  | "quantitative"
  | "executable"
  | "tool-verified";

/**
 * Only these evidence classes can materially reduce factual vulnerability.
 * "none" and "explanatory" do not count as evidence.
 */
export const MATERIAL_EVIDENCE_CLASSES: ReadonlySet<EvidenceClass> = new Set([
  "citation-like",
  "quantitative",
  "executable",
  "tool-verified",
]);

// --- Issue Lifecycle ---

export type IssueStatus =
  | "candidate"
  | "admissible"
  | "verified"
  | "repaired"
  | "rechecked"
  | "resolved"
  | "persistent"
  | "regressed"
  | "oscillating"
  | "unrepairable"
  | "abstained";

export type RepairStrategy =
  | "soften"
  | "split-claim"
  | "add-condition"
  | "bind-policy-boundary"
  | "add-schema-constraint"
  | "persona-contract-rewrite"
  | "unsupported";

export interface DraftSpan {
  text: string;
  start: number;
  end: number;
  sentenceIndex?: number;
}

export interface IssueRecord {
  issueKey: string;
  category: ArrcChallengeCategory;
  fingerprint: string;
  discoveredRound: number;
  latestRound: number;
  target: DraftSpan;
  challenge: {
    counterargument: string;
    failureScenario: string;
    severity: ArrcChallengeSeverity;
    signal: number;
  };
  relay: {
    canonicalTargetText: string;
    lineageToken: string;
    normalized: boolean;
    protocolWarnings: string[];
  };
  verificationHistory: Array<{
    round: number;
    accepted: boolean;
    abstained?: boolean;
    rationale: string;
    evidenceClass: EvidenceClass;
    confidence: number;
  }>;
  repairHistory: Array<{
    round: number;
    applied: boolean;
    reason: string;
    strategy: RepairStrategy;
    before: string;
    after: string;
  }>;
  status: IssueStatus;
}

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

// --- Classifier ---

export interface CandidateIssue {
  span: DraftSpan;
  category: ArrcChallengeCategory;
  reason: string;
  evidenceClass: EvidenceClass;
  subtype: string;
}

export interface VulnerabilityAssessment {
  score: number;
  flaggedDimensions: ArrcChallengeCategory[];
  recommendedTier: ArrcRiskTier;
  reasons: string[];
  candidates: CandidateIssue[];
}

// --- Relay ---

export interface RelayedChallenge {
  issueKey: string;
  category: ArrcChallengeCategory;
  severity: ArrcChallengeSeverity;
  canonicalTarget: DraftSpan;
  counterargument: string;
  failureScenario: string;
  lineageToken: string;
  signal: number;
  protocolWarnings: string[];
  downgraded: boolean;
  fingerprint: string;
}

// --- Verifier ---

export interface VerificationResult {
  accepted: boolean;
  confidence: number;
  rationale: string;
  evidenceClass: EvidenceClass;
  evidence?: string;
  abstained?: boolean;
}

// --- Reviser ---

export interface RepairResult {
  applied: boolean;
  strategy: RepairStrategy;
  before: string;
  after: string;
  reason: string;
}

// --- Coverage v2 ---

export interface DimensionCoverage {
  dimension: ArrcChallengeCategory;
  flagged: boolean;
  attemptedRounds: number[];
  abstainedRounds: number[];
  admissibleIssueKeys: string[];
  verifiedIssueKeys: string[];
  resolvedIssueKeys: string[];
  unresolvedIssueKeys: string[];
  coverageAdequate: boolean;
  notes: string[];
}

export interface RoundCoverage {
  round: number;
  dimensionsAttempted: ArrcChallengeCategory[];
  issueKeysChallenged: string[];
  issueKeysVerified: string[];
  issueKeysResolved: string[];
  abstentions: Array<{ dimension: ArrcChallengeCategory; reason: string }>;
}

export interface ChallengeCoverageV2 {
  byDimension: DimensionCoverage[];
  byRound: RoundCoverage[];
  overallAdequate: boolean;
  notes: string[];
}

// --- Convergence ---

export interface ConvergenceState {
  isStable: boolean;
  hasPersistentIssues: boolean;
  hasOscillation: boolean;
  hasRegression: boolean;
  budgetExceeded: boolean;
  roundsCompleted: number;
}

// --- Result ---

export interface ArrcResult {
  decision: ArrcDecision;
  confidence: number;
  output?: string;
  reasons: string[];
  issues: IssueRecord[];
  tier: ArrcRiskTier;
  convergence: ConvergenceState;
  coverage: ChallengeCoverageV2;
  shouldShip: boolean;
}
