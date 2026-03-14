import type {
  ArrcChallengeCategory,
  ArrcInput,
  ArrcRiskTier,
  CandidateIssue,
  EvidenceClass,
  VulnerabilityAssessment,
} from "../types.js";
import { splitSentences, findSpan } from "../util.js";

// --- Patterns ---

const ABSOLUTE_PATTERN =
  /\b(always|never|guarantee(?:d|s)?|definitely|certainly|impossible|must|every\b(?!\s+(?:time|day|week|month|year))|none\b(?!\s+of))/i;

const HEDGE_PATTERN =
  /\b(might|maybe|possibly|could|perhaps|sometimes|occasionally|often|typically)\b/gi;

/**
 * Material evidence: citations, quantities, test references, tool output.
 * NOT discourse markers like "because", "therefore", "since".
 */
const MATERIAL_EVIDENCE_PATTERN =
  /(?:\bhttps?:\/\/\S+|\b(?:according to|source:|citation:|study shows|data shows|measured at|observed in|tested with|confirmed by)\b|\b\d+(?:\.\d+)?%\b|\b(?:test|experiment|benchmark|audit)\s+(?:shows?|results?|confirms?)\b)/i;

/**
 * Discourse markers: these explain but do not prove.
 */
const DISCOURSE_MARKER_PATTERN =
  /\b(because|therefore|thus|hence|so|since|as a result|it follows that|consequently)\b/i;

const CAUSAL_CONCLUSION_PATTERN =
  /\b(?:is|are|was|were|will be|remains?)\s+(?:\w+\s+)?(?:because|since|as)\b/i;

const SINGLE_REASON_SUFFICIENCY =
  /\b(?:is|are|was|were)\s+(\w+)\s+because\b/i;

const PREMISE_CONCLUSION_MISMATCH =
  /\b(?:because|since)\s+.{5,80}\b(?:always|never|guarantee|must|impossible|certainly|definitely)\b/i;

const HIDDEN_PREMISE_PATTERN =
  /\b(?:obviously|clearly|of course|naturally|inherently|by definition)\b/i;

const ILLICIT_GENERALIZATION =
  /\b(?:all|every|no one|everyone|nobody|nothing)\b.*\b(?:because|since|as)\b/i;

const SCHEMA_CONSTRAINT_PATTERN =
  /\b(type|required|enum|pattern|minimum|maximum|minLength|maxLength|format|properties|items|schema|constraint|validation)\b/i;

const PERSONA_TRAIT_PATTERN =
  /\b(voice|tone|character|persona|boundary|identity|role|style|manner)\b/i;

const PERSONA_BOUNDARY_PATTERN =
  /\b(never|refuse|will not|cannot|must not|won't|don't|do not)\b/i;

const POLICY_ALLOW_PATTERN = /\b(allowed|permit|can|accept|approve)\b/i;
const POLICY_DENY_PATTERN = /\b(not allowed|forbidden|refuse|deny|reject|prohibit|block)\b/i;
const POLICY_ESCALATE_PATTERN = /\b(escalate|refer|forward|hand off|human review|manual)\b/i;
const VAGUE_POLICY_PATTERN =
  /\b(may be|in some cases|special cases|when appropriate|as needed|discretion|at .+ judgment)\b/i;

// --- Helpers ---

function classifyEvidence(text: string): EvidenceClass {
  if (MATERIAL_EVIDENCE_PATTERN.test(text)) {
    if (/\bhttps?:\/\/\S+/.test(text) || /\b(?:according to|source:|citation:)\b/i.test(text)) {
      return "citation-like";
    }
    if (/\b\d+(?:\.\d+)?%\b/.test(text) || /\bmeasured at\b/i.test(text)) {
      return "quantitative";
    }
    if (/\b(?:test|experiment|benchmark)\b/i.test(text)) {
      return "executable";
    }
    return "citation-like";
  }
  if (DISCOURSE_MARKER_PATTERN.test(text)) {
    return "explanatory";
  }
  return "none";
}

/**
 * Classify vulnerability of a draft for ARRC routing.
 *
 * Emits candidate issues at the span/sentence level with evidence classification.
 * "because" and friends are classified as "explanatory", not evidence.
 * Logical routing fires without requiring absolute wording.
 */
export function classifyVulnerability(
  draft: string,
  input: ArrcInput,
): VulnerabilityAssessment {
  const candidates: CandidateIssue[] = [];
  const reasons: string[] = [];
  let score = 0;

  const sentences = splitSentences(draft);
  const taskType = input.taskType ?? "general";

  // --- Per-sentence analysis ---
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i]!;
    const span = findSpan(draft, sentence.trim());
    if (!span) continue;
    span.sentenceIndex = i;

    const evClass = classifyEvidence(sentence);
    const hasAbsolute = ABSOLUTE_PATTERN.test(sentence);
    const hasMaterialEvidence = evClass !== "none" && evClass !== "explanatory";

    // Factual: unsupported certainty
    if (hasAbsolute && !hasMaterialEvidence) {
      candidates.push({
        span,
        category: "factual",
        reason: `Absolute language without material evidence (evidence class: ${evClass}).`,
        evidenceClass: evClass,
        subtype: "unsupported-certainty",
      });
      score += 0.2;
    }

    // Logical: single-reason sufficiency (NO absolute-language gate)
    if (SINGLE_REASON_SUFFICIENCY.test(sentence)) {
      candidates.push({
        span,
        category: "logical",
        reason: "Single-reason sufficiency claim: conclusion rests on one stated reason.",
        evidenceClass: evClass,
        subtype: "single-reason-sufficiency",
      });
      score += 0.15;
    } else if (CAUSAL_CONCLUSION_PATTERN.test(sentence) && !SINGLE_REASON_SUFFICIENCY.test(sentence)) {
      // Broader causal overreach check
      if (PREMISE_CONCLUSION_MISMATCH.test(sentence)) {
        candidates.push({
          span,
          category: "logical",
          reason: "Conclusion strength exceeds premise strength.",
          evidenceClass: evClass,
          subtype: "premise-conclusion-mismatch",
        });
        score += 0.15;
      }
    }

    // Logical: hidden premise
    if (HIDDEN_PREMISE_PATTERN.test(sentence)) {
      candidates.push({
        span,
        category: "logical",
        reason: "Hidden premise dependency: appeals to obviousness rather than argument.",
        evidenceClass: evClass,
        subtype: "hidden-premise",
      });
      score += 0.1;
    }

    // Logical: illicit generalization
    if (ILLICIT_GENERALIZATION.test(sentence)) {
      candidates.push({
        span,
        category: "logical",
        reason: "Universal claim derived from limited premise.",
        evidenceClass: evClass,
        subtype: "illicit-generalization",
      });
      score += 0.15;
    }

    // Policy: vague boundary
    if ((taskType === "policy" || taskType === "support") && VAGUE_POLICY_PATTERN.test(sentence)) {
      candidates.push({
        span,
        category: "policy",
        reason: `Vague policy boundary language detected.`,
        evidenceClass: "none",
        subtype: "vague-boundary",
      });
      score += 0.15;
    }
  }

  // --- Document-level checks ---

  // Schema
  if (taskType === "schema" || input.metadata?.hasStrictSchema) {
    const firstSpan = findSpan(draft, sentences[0]?.trim() ?? draft.trim());
    if (firstSpan) {
      if (!SCHEMA_CONSTRAINT_PATTERN.test(draft)) {
        candidates.push({
          span: firstSpan,
          category: "schema",
          reason: "Schema task without constraint language.",
          evidenceClass: "none",
          subtype: "missing-constraints",
        });
        score += 0.2;
      } else {
        candidates.push({
          span: firstSpan,
          category: "schema",
          reason: "Schema constraints present but may be incomplete under adversarial input.",
          evidenceClass: "none",
          subtype: "potentially-incomplete",
        });
        score += 0.1;
      }
    }
  }

  // Persona
  if (taskType === "persona" || input.metadata?.requiresPersonaDurability) {
    const firstSpan = findSpan(draft, sentences[0]?.trim() ?? draft.trim());
    if (firstSpan) {
      if (!PERSONA_TRAIT_PATTERN.test(draft)) {
        candidates.push({
          span: firstSpan,
          category: "persona",
          reason: "No persona trait definitions found.",
          evidenceClass: "none",
          subtype: "missing-traits",
        });
        score += 0.15;
      } else if (!PERSONA_BOUNDARY_PATTERN.test(draft)) {
        candidates.push({
          span: firstSpan,
          category: "persona",
          reason: "Persona traits defined but no explicit boundaries.",
          evidenceClass: "none",
          subtype: "missing-boundaries",
        });
        score += 0.1;
      }
    }
  }

  // Policy: document-level boundary completeness
  if (taskType === "policy" || taskType === "support") {
    const firstSpan = findSpan(draft, sentences[0]?.trim() ?? draft.trim());
    if (firstSpan) {
      const hasAllow = POLICY_ALLOW_PATTERN.test(draft);
      const hasDeny = POLICY_DENY_PATTERN.test(draft);
      const hasEscalate = POLICY_ESCALATE_PATTERN.test(draft);
      const missing: string[] = [];
      if (!hasAllow) missing.push("allow");
      if (!hasDeny) missing.push("deny");
      if (!hasEscalate) missing.push("escalate");

      if (missing.length >= 2) {
        candidates.push({
          span: firstSpan,
          category: "policy",
          reason: `Policy missing ${missing.join(" and ")} boundaries.`,
          evidenceClass: "none",
          subtype: "missing-boundaries",
        });
        score += 0.2;
      }
    }
  }

  // Hedge ratio
  const hedgeCount = (draft.match(HEDGE_PATTERN) ?? []).length;
  const absoluteCount = (draft.match(new RegExp(ABSOLUTE_PATTERN.source, "gi")) ?? []).length;
  if (absoluteCount > 0 && hedgeCount === 0) {
    score += 0.1;
    reasons.push("No hedging alongside absolute claims.");
  }

  // Rubric mismatch
  if (input.rubric && input.rubric.length > 0) {
    const normalizedDraft = draft.toLowerCase();
    for (const item of input.rubric) {
      const keywords = item
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((part) => part.length > 3);
      if (keywords.length > 0 && !keywords.some((kw) => normalizedDraft.includes(kw))) {
        const firstSpan = findSpan(draft, sentences[0]?.trim() ?? draft.trim());
        if (firstSpan) {
          candidates.push({
            span: firstSpan,
            category: "factual",
            reason: `Rubric item "${item}" not addressed in draft.`,
            evidenceClass: "none",
            subtype: "rubric-mismatch",
          });
          score += 0.1;
        }
      }
    }
  }

  // Long draft
  if (draft.length > 500 && sentences.length > 8) {
    score += 0.05;
    reasons.push("Long draft with multiple claims increases challenge surface.");
  }

  // Build flagged dimensions from candidates
  const flaggedDimensions = [
    ...new Set(candidates.map((c) => c.category)),
  ] as ArrcChallengeCategory[];

  // Generate reasons from candidates
  for (const c of candidates) {
    reasons.push(`[${c.category}/${c.subtype}] ${c.reason}`);
  }

  // Cap score
  score = Math.min(score, 1.0);

  // Determine tier
  let recommendedTier: ArrcRiskTier = 0;
  if (score >= 0.5) {
    recommendedTier = 3;
  } else if (score >= 0.3) {
    recommendedTier = 2;
  } else if (score > 0.1) {
    recommendedTier = 1;
  }

  // Conservative overrides from metadata
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
    candidates,
  };
}
