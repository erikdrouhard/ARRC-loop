import type {
  ArcChallengeCategory,
  ArcJudgeInput,
  ArcRiskTier,
  VulnerabilityAssessment,
} from "../types.js";

// ── Text Analysis Utilities ──────────────────────────────────────────────────

const CLAIM_PATTERNS = [
  /\b(?:is|are|was|were|will be|has been|have been)\s+(?:always|never|the best|the worst|the only|the most|the least|essential|critical|impossible|guaranteed)\b/gi,
  /\b(?:always|never|every|all|none|no one|everyone|nobody|nothing|everything)\b/gi,
  /\b(?:must|shall|will definitely|is certain|is guaranteed|is impossible|cannot fail)\b/gi,
  /\b(?:proven|established|known fact|undeniable|unquestionable|indisputable)\b/gi,
  /\b(?:causes?|leads? to|results? in|ensures?|prevents?|eliminates?)\b/gi,
];

const HEDGE_PATTERNS = [
  /\b(?:might|may|could|possibly|perhaps|likely|unlikely|probably|sometimes)\b/gi,
  /\b(?:in some cases|under certain conditions|depending on|it depends|generally|typically|usually|often|tends to)\b/gi,
  /\b(?:appears? to|seems? to|suggests?|indicates?|implies?)\b/gi,
  /\b(?:approximately|roughly|about|around|estimated|uncertain)\b/gi,
];

const EVIDENCE_PATTERNS = [
  /\b(?:according to|source|citation|reference|study|research|data shows|evidence)\b/gi,
  /\b(?:measured|tested|verified|confirmed|observed|documented|reported)\b/gi,
  /https?:\/\/\S+/gi,
  /\b(?:figure|table|appendix|section)\s+\d/gi,
  /\[\d+\]/g, // citation markers like [1], [2]
  /\b(?:because|since|given that|due to|as shown by|demonstrated by)\b/gi,
];

const SCHEMA_KEYWORDS = /\b(?:type|required|enum|properties|items|string|number|boolean|integer|array|object|null|format|pattern|minimum|maximum|minLength|maxLength)\b/gi;
const PERSONA_KEYWORDS = /\b(?:voice|tone|character|persona|personality|style|manner|attitude|boundary|trait|behavior)\b/gi;
const POLICY_KEYWORDS = /\b(?:policy|allowed|not allowed|forbidden|prohibited|must not|shall not|escalate|boundary|rule|guideline|exception|permit|deny|refuse|reject)\b/gi;

function countPatternMatches(text: string, patterns: RegExp[]): number {
  let count = 0;
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) {
      count += matches.length;
    }
  }
  return count;
}

function splitSentences(text: string): string[] {
  return text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
}

function splitParagraphs(text: string): string[] {
  return text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
}

// ── Metric Computation ───────────────────────────────────────────────────────

function computeClaimDensity(draft: string): number {
  const paragraphs = splitParagraphs(draft);
  if (paragraphs.length === 0) return 0;

  const claimCount = countPatternMatches(draft, CLAIM_PATTERNS);
  const density = claimCount / paragraphs.length;

  // Normalize to 0-1 range: 0 claims/paragraph = 0, 5+ claims/paragraph = 1
  return Math.min(1, density / 5);
}

function computeHedgeRatio(draft: string): number {
  const sentences = splitSentences(draft);
  if (sentences.length === 0) return 1; // no sentences = fully hedged (safe)

  const hedgeCount = countPatternMatches(draft, HEDGE_PATTERNS);
  const claimCount = countPatternMatches(draft, CLAIM_PATTERNS);
  const total = hedgeCount + claimCount;

  if (total === 0) return 0.5; // neutral
  return hedgeCount / total;
}

function computeEvidenceCitationRate(draft: string): number {
  const sentences = splitSentences(draft);
  if (sentences.length === 0) return 0;

  const evidenceCount = countPatternMatches(draft, EVIDENCE_PATTERNS);
  const claimCount = countPatternMatches(draft, CLAIM_PATTERNS);

  if (claimCount === 0) return 1; // no claims = no evidence needed
  return Math.min(1, evidenceCount / claimCount);
}

function computeStructuralAlignment(draft: string, input: ArcJudgeInput): number {
  const taskType = input.taskType ?? "general";
  let score = 0.5; // neutral baseline

  // Check if draft structure matches task expectations
  switch (taskType) {
    case "schema": {
      const schemaMatches = draft.match(SCHEMA_KEYWORDS);
      score = schemaMatches ? Math.min(1, schemaMatches.length / 5) : 0.1;
      break;
    }
    case "persona": {
      const personaMatches = draft.match(PERSONA_KEYWORDS);
      score = personaMatches ? Math.min(1, personaMatches.length / 3) : 0.1;
      break;
    }
    case "policy": {
      const policyMatches = draft.match(POLICY_KEYWORDS);
      score = policyMatches ? Math.min(1, policyMatches.length / 3) : 0.1;
      break;
    }
    case "reasoning": {
      // Reasoning drafts should have connective tissue
      const connectives = countPatternMatches(draft, [
        /\b(?:therefore|thus|hence|because|since|so|consequently|as a result|it follows)\b/gi,
      ]);
      score = Math.min(1, connectives / 3);
      break;
    }
    default:
      // For general/support, check rubric coverage
      if (input.rubric && input.rubric.length > 0) {
        const normalizedDraft = draft.toLowerCase();
        const covered = input.rubric.filter((item) => {
          const keywords = item.toLowerCase().split(/[^a-z0-9]+/).filter((k) => k.length > 3);
          return keywords.length > 0 && keywords.some((k) => normalizedDraft.includes(k));
        });
        score = covered.length / input.rubric.length;
      }
      break;
  }

  return score;
}

function computeConfidenceToEvidenceRatio(draft: string): number {
  const claimCount = countPatternMatches(draft, CLAIM_PATTERNS);
  const hedgeCount = countPatternMatches(draft, HEDGE_PATTERNS);
  const evidenceCount = countPatternMatches(draft, EVIDENCE_PATTERNS);

  const confidence = Math.max(1, claimCount - hedgeCount);
  const evidence = Math.max(1, evidenceCount);

  // Higher ratio = more confident relative to evidence = more vulnerable
  const ratio = confidence / evidence;
  return Math.min(1, ratio / 5); // normalize: ratio of 5+ = max vulnerability
}

// ── Dimension Flagging ───────────────────────────────────────────────────────

function flagDimensions(
  draft: string,
  input: ArcJudgeInput,
  metrics: VulnerabilityAssessment["metrics"],
): ArcChallengeCategory[] {
  const flagged: ArcChallengeCategory[] = [];
  const taskType = input.taskType ?? "general";

  // Factual: high claim density with low evidence
  if (metrics.claimDensity > 0.3 && metrics.evidenceCitationRate < 0.5) {
    flagged.push("factual");
  }

  // Logical: low hedge ratio with reasoning-type tasks, or explicit reasoning task
  if (taskType === "reasoning" || (metrics.hedgeRatio < 0.3 && metrics.confidenceToEvidenceRatio > 0.5)) {
    flagged.push("logical");
  }

  // Schema: schema task type or schema keywords present but incomplete
  if (taskType === "schema" || input.metadata?.hasStrictSchema) {
    if (metrics.structuralAlignment < 0.7) {
      flagged.push("schema");
    }
  }

  // Persona: persona task type or persona durability required
  if (taskType === "persona" || input.metadata?.requiresPersonaDurability) {
    if (metrics.structuralAlignment < 0.7) {
      flagged.push("persona");
    }
  }

  // Policy: policy task type or high-stakes context
  if (taskType === "policy" || (input.metadata?.highStakes && taskType !== "general")) {
    const policyMatches = draft.match(POLICY_KEYWORDS);
    if (!policyMatches || policyMatches.length < 2) {
      flagged.push("policy");
    }
  }

  return flagged;
}

// ── Vulnerability Score ──────────────────────────────────────────────────────

const VULNERABILITY_THRESHOLD = 0.4;

function computeVulnerabilityScore(
  metrics: VulnerabilityAssessment["metrics"],
  flaggedDimensions: ArcChallengeCategory[],
): number {
  // Weighted combination of metrics
  const metricScore =
    metrics.claimDensity * 0.2 +
    (1 - metrics.hedgeRatio) * 0.15 +
    (1 - metrics.evidenceCitationRate) * 0.2 +
    (1 - metrics.structuralAlignment) * 0.2 +
    metrics.confidenceToEvidenceRatio * 0.25;

  // Dimension count amplifier: more flagged dimensions = higher vulnerability
  const dimensionAmplifier = 1 + flaggedDimensions.length * 0.15;

  return Math.min(1, metricScore * dimensionAmplifier);
}

function recommendTier(
  score: number,
  input: ArcJudgeInput,
): ArcRiskTier {
  // Context-driven overrides
  if (
    input.metadata?.userRequestedVerification ||
    input.metadata?.hasStrictSchema ||
    input.metadata?.requiresPersonaDurability
  ) {
    return 3;
  }

  if (
    input.metadata?.highStakes ||
    input.metadata?.usedTools ||
    input.metadata?.agentDisagreement ||
    input.metadata?.lowConfidence
  ) {
    return score >= VULNERABILITY_THRESHOLD ? 3 : 2;
  }

  // Score-driven tiers
  if (score >= 0.7) return 3;
  if (score >= VULNERABILITY_THRESHOLD) return 2;
  if (score >= 0.2) return 1;
  return 0;
}

// ── Public API ───────────────────────────────────────────────────────────────

export function classifyVulnerability(
  draft: string,
  input: ArcJudgeInput,
): VulnerabilityAssessment {
  const metrics = {
    claimDensity: computeClaimDensity(draft),
    hedgeRatio: computeHedgeRatio(draft),
    evidenceCitationRate: computeEvidenceCitationRate(draft),
    structuralAlignment: computeStructuralAlignment(draft, input),
    confidenceToEvidenceRatio: computeConfidenceToEvidenceRatio(draft),
  };

  const flaggedDimensions = flagDimensions(draft, input, metrics);
  const score = computeVulnerabilityScore(metrics, flaggedDimensions);
  const tier = recommendTier(score, input);

  return {
    score,
    flaggedDimensions,
    recommendedTier: tier,
    metrics,
  };
}

export { VULNERABILITY_THRESHOLD };
