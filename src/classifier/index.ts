import type {
  ArrcChallengeCategory,
  ArrcInput,
  ArrcRiskTier,
  VulnerabilityAssessment,
} from "../types.js";

const ABSOLUTE_PATTERN =
  /\b(always|never|guarantee(?:d|s)?|definitely|certainly|impossible|must|every|none)\b/i;

const HEDGE_PATTERN =
  /\b(might|maybe|possibly|could|perhaps|sometimes|occasionally)\b/gi;

const EVIDENCE_PATTERN =
  /\b(according to|source|citation|evidence|because|study|data|measured|observed|tested|confirmed)\b/i;

const SCHEMA_PATTERN =
  /\b(type|required|enum|properties|items|schema|field|constraint|validation)\b/i;

const POLICY_PATTERN =
  /\b(policy|allowed|not allowed|forbidden|escalate|boundary|refuse|deny|permit)\b/i;

function countMatches(text: string, pattern: RegExp): number {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

function countSentences(text: string): number {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  return Math.max(sentences.length, 1);
}

/**
 * Classify vulnerability of a draft for ARRC routing.
 *
 * The classifier routes risk conservatively. It does not determine truth.
 * When in doubt, route into the loop.
 */
export function classifyVulnerability(
  draft: string,
  input: ArrcInput,
): VulnerabilityAssessment {
  const flaggedDimensions: ArrcChallengeCategory[] = [];
  const reasons: string[] = [];
  let score = 0;

  const sentenceCount = countSentences(draft);
  const absoluteCount = countMatches(draft, ABSOLUTE_PATTERN);
  const hedgeCount = countMatches(draft, HEDGE_PATTERN);
  const hasEvidence = EVIDENCE_PATTERN.test(draft);

  // Claim density: absolute language relative to sentence count
  const claimDensity = absoluteCount / sentenceCount;
  if (claimDensity > 0.3) {
    score += 0.25;
    reasons.push(`High absolute-language density (${absoluteCount} absolute terms in ${sentenceCount} sentences).`);
  }

  // Hedge ratio: low hedging with high claims suggests overconfidence
  if (absoluteCount > 0 && hedgeCount === 0) {
    score += 0.15;
    reasons.push("No hedging detected alongside absolute claims.");
  }

  // Evidence citation rate
  if (!hasEvidence && absoluteCount > 0) {
    score += 0.2;
    flaggedDimensions.push("factual");
    reasons.push("Absolute claims without evidence markers.");
  }

  // Confidence-to-evidence ratio
  if (absoluteCount > 2 && !hasEvidence) {
    score += 0.1;
    if (!flaggedDimensions.includes("factual")) {
      flaggedDimensions.push("factual");
    }
    reasons.push("High confidence-to-evidence ratio.");
  }

  // Logical structure: check for because/therefore/if-then patterns
  const hasLogicalConnectors =
    /\b(because|therefore|thus|hence|so|if .+ then|implies|follows that)\b/i.test(draft);
  if (hasLogicalConnectors && absoluteCount > 0) {
    flaggedDimensions.push("logical");
    score += 0.1;
    reasons.push("Logical connectors with absolute conclusions may contain inferential gaps.");
  }

  // Schema markers
  const taskType = input.taskType ?? "general";
  if (taskType === "schema" || input.metadata?.hasStrictSchema) {
    if (!SCHEMA_PATTERN.test(draft)) {
      flaggedDimensions.push("schema");
      score += 0.2;
      reasons.push("Schema task without explicit constraint language.");
    } else {
      // Even with schema keywords, flag for adversarial testing
      flaggedDimensions.push("schema");
      score += 0.1;
      reasons.push("Schema constraints present but may be incomplete under adversarial input.");
    }
  }

  // Persona markers
  if (taskType === "persona" || input.metadata?.requiresPersonaDurability) {
    flaggedDimensions.push("persona");
    score += 0.15;
    reasons.push("Persona durability requires challenge coverage.");
  }

  // Policy markers
  if (taskType === "policy") {
    if (!POLICY_PATTERN.test(draft)) {
      flaggedDimensions.push("policy");
      score += 0.2;
      reasons.push("Policy task without explicit allow/deny/escalate boundaries.");
    } else {
      flaggedDimensions.push("policy");
      score += 0.1;
      reasons.push("Policy boundaries present but may be ambiguous under pressure.");
    }
  }

  // Branching depth / complexity
  if (draft.length > 500 && sentenceCount > 8) {
    score += 0.05;
    reasons.push("Long draft with multiple claims increases challenge surface.");
  }

  // Instruction-response alignment
  if (input.rubric && input.rubric.length > 0) {
    const normalizedDraft = draft.toLowerCase();
    const missedItems = input.rubric.filter((item) => {
      const keywords = item
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((part) => part.length > 3);
      return keywords.length > 0 && !keywords.some((kw) => normalizedDraft.includes(kw));
    });
    if (missedItems.length > 0) {
      score += 0.15;
      reasons.push(`Draft may miss ${missedItems.length} rubric item(s).`);
    }
  }

  // Cap score at 1.0
  score = Math.min(score, 1.0);

  // If nothing was flagged but we still got signal, add factual as default dimension
  if (flaggedDimensions.length === 0 && score > 0.2) {
    flaggedDimensions.push("factual");
  }

  // Determine recommended tier
  let recommendedTier: ArrcRiskTier = 0;
  if (score >= 0.6) {
    recommendedTier = 3;
  } else if (score >= 0.35) {
    recommendedTier = 2;
  } else if (score > 0.15) {
    recommendedTier = 1;
  }

  // Conservative override: if metadata says high risk, bump up
  if (input.metadata?.highStakes && recommendedTier < 2) {
    recommendedTier = 2;
  }
  if (input.metadata?.userRequestedVerification && recommendedTier < 3) {
    recommendedTier = 3;
  }

  return {
    score,
    flaggedDimensions,
    recommendedTier,
    reasons,
  };
}
