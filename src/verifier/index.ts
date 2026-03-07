import type {
  ArrcInput,
  StructuredChallenge,
  VerificationResult,
  VerificationStrategy,
} from "../types.js";

// --- Verification Strategies ---

/**
 * Factual verification: inspect whether the targeted claim is supported inside the draft.
 * Does not decide universal truth unless grounded evidence exists.
 */
const factualStrategy: VerificationStrategy = {
  verify(challenge, draft, _context): VerificationResult {
    const targetText = challenge.target.text;

    // Check if target actually exists in draft
    if (!draft.includes(targetText)) {
      return {
        accepted: false,
        confidence: 0.9,
        rationale: "Target text no longer present in draft. Challenge is stale.",
      };
    }

    // Look for evidence markers near the target
    const evidencePatterns = [
      /\b(according to|source|citation|evidence|because|study|data|measured|observed|tested|confirmed)\b/i,
      /\bhttps?:\/\//i,
      /\b\d+(\.\d+)?%\b/,
    ];

    const targetIndex = draft.indexOf(targetText);
    const surroundingContext = draft.slice(
      Math.max(0, targetIndex - 200),
      Math.min(draft.length, targetIndex + targetText.length + 200),
    );

    const hasLocalEvidence = evidencePatterns.some((p) => p.test(surroundingContext));

    if (hasLocalEvidence) {
      return {
        accepted: false,
        confidence: 0.7,
        rationale:
          "The targeted claim has evidence markers in its vicinity. " +
          "The challenge may still have merit, but local evidence reduces its signal.",
        evidence: "Evidence markers found near target span.",
      };
    }

    // Absolute claim without evidence: accept the challenge
    const absolutePattern = /\b(always|never|guarantee|must|every|none|impossible)\b/i;
    if (absolutePattern.test(targetText)) {
      return {
        accepted: true,
        confidence: 0.8,
        rationale:
          "The targeted claim uses absolute language without local evidence support. " +
          "The challenge is locally decision-relevant.",
        evidence: "Absolute language detected without grounding.",
      };
    }

    // Moderate claim without evidence: accept with lower confidence
    return {
      accepted: true,
      confidence: 0.65,
      rationale:
        "The targeted claim lacks evidence markers. The challenge identifies a real " +
        "grounding gap that could affect decision-making.",
    };
  },
};

/**
 * Logical verification: inspect premise → conclusion structure around the target span.
 * Determines whether the counterargument exposes a real inferential gap.
 */
const logicalStrategy: VerificationStrategy = {
  verify(challenge, draft, _context): VerificationResult {
    const targetText = challenge.target.text;

    if (!draft.includes(targetText)) {
      return {
        accepted: false,
        confidence: 0.9,
        rationale: "Target text no longer present in draft.",
      };
    }

    // Check for single-reason pattern (X because Y, with no additional reasons)
    const singleReasonPattern = /\b(is|are|was|were)\s+\w+\s+because\b/i;
    const multiReasonPattern = /\b(and|also|additionally|furthermore|moreover)\b/i;

    const hasSingleReason = singleReasonPattern.test(targetText);
    const hasMultipleReasons = multiReasonPattern.test(targetText);

    if (hasSingleReason && !hasMultipleReasons) {
      return {
        accepted: true,
        confidence: 0.8,
        rationale:
          "The target presents a single-reason justification for a broad conclusion. " +
          "The counterargument correctly identifies this as an inferential gap.",
        evidence: "Single causal chain without additional supporting reasons.",
      };
    }

    // Causal connector with absolute conclusion
    const causalPattern = /\b(because|therefore|thus|hence|so|since)\b/i;
    const absolutePattern = /\b(always|never|must|guaranteed|impossible|certain)\b/i;

    if (causalPattern.test(targetText) && absolutePattern.test(targetText)) {
      return {
        accepted: true,
        confidence: 0.75,
        rationale:
          "The target draws an absolute conclusion from a causal chain. " +
          "The inferential gap between premise and absolute conclusion is real.",
      };
    }

    if (causalPattern.test(targetText)) {
      return {
        accepted: true,
        confidence: 0.6,
        rationale:
          "The target contains a causal inference. The counterargument identifies a " +
          "potential gap, though the severity is moderate.",
      };
    }

    // No clear inferential structure found
    return {
      accepted: false,
      confidence: 0.5,
      rationale:
        "The target does not contain a clear inferential structure that the " +
        "counterargument can exploit.",
      abstained: true,
    };
  },
};

/**
 * Schema verification: attempt adversarial construction against the schema.
 * If a constructible failure case exists, accept.
 */
const schemaStrategy: VerificationStrategy = {
  verify(challenge, draft, _context): VerificationResult {
    const targetText = challenge.target.text;

    if (!draft.includes(targetText)) {
      return {
        accepted: false,
        confidence: 0.9,
        rationale: "Target text no longer present in draft.",
      };
    }

    // Check if failure scenario describes a constructible case
    const constructiblePatterns = [
      /\b(sends?|submit|input|pass|provide)\s/i,
      /\{[^}]*\}/,
      /\b(null|undefined|empty|"")\b/i,
    ];

    const hasConstructibleCase = constructiblePatterns.some((p) =>
      p.test(challenge.failureScenario),
    );

    if (hasConstructibleCase) {
      return {
        accepted: true,
        confidence: 0.85,
        rationale:
          "The failure scenario describes a constructible adversarial input " +
          "that could break the schema or bypass its constraints.",
        evidence: `Constructible failure case: ${challenge.failureScenario.slice(0, 100)}`,
      };
    }

    // Schema challenge without constructible case: abstain
    return {
      accepted: false,
      confidence: 0.4,
      rationale:
        "The challenge targets schema design but the failure scenario does not describe " +
        "a concretely constructible adversarial input.",
      abstained: true,
    };
  },
};

/**
 * Persona verification: compare targeted span against explicit persona traits or voice constraints.
 */
const personaStrategy: VerificationStrategy = {
  verify(challenge, draft, _context): VerificationResult {
    const targetText = challenge.target.text;

    if (!draft.includes(targetText)) {
      return {
        accepted: false,
        confidence: 0.9,
        rationale: "Target text no longer present in draft.",
      };
    }

    // Check if draft actually defines persona elements
    const personaElements = /\b(voice|tone|character|persona|boundary|identity|role|style)\b/i;
    const hasSomePersona = personaElements.test(draft);

    if (!hasSomePersona) {
      return {
        accepted: true,
        confidence: 0.75,
        rationale:
          "The draft contains no explicit persona trait definitions. " +
          "The challenge correctly identifies a durability vulnerability.",
      };
    }

    // Has some persona elements but boundaries may be weak
    const boundaryElements = /\b(never|refuse|will not|cannot|must not|won't)\b/i;
    if (!boundaryElements.test(draft)) {
      return {
        accepted: true,
        confidence: 0.7,
        rationale:
          "Persona traits are mentioned but no explicit refusal boundaries are defined. " +
          "The persona is vulnerable to erosion under persistent pressure.",
      };
    }

    return {
      accepted: false,
      confidence: 0.6,
      rationale:
        "The draft contains both persona trait definitions and boundary constraints. " +
        "The current persona specification may be sufficient.",
    };
  },
};

/**
 * Policy verification: inspect allow/deny/escalate language.
 * Accept if the challenged boundary is genuinely missing or ambiguous.
 */
const policyStrategy: VerificationStrategy = {
  verify(challenge, draft, _context): VerificationResult {
    const targetText = challenge.target.text;

    if (!draft.includes(targetText)) {
      return {
        accepted: false,
        confidence: 0.9,
        rationale: "Target text no longer present in draft.",
      };
    }

    // Check for complete policy boundaries
    const hasAllow = /\b(allowed|permit|can|may|accept|approve)\b/i.test(draft);
    const hasDeny = /\b(not allowed|forbidden|refuse|deny|reject|prohibit|block)\b/i.test(draft);
    const hasEscalate = /\b(escalate|refer|forward|hand off|human review|manual)\b/i.test(draft);

    const missingCount = [hasAllow, hasDeny, hasEscalate].filter((v) => !v).length;

    if (missingCount >= 2) {
      return {
        accepted: true,
        confidence: 0.85,
        rationale:
          "The policy is missing multiple boundary types (allow/deny/escalate). " +
          "The challenge correctly identifies a genuine gap in policy specification.",
        evidence: `Missing: ${[!hasAllow && "allow", !hasDeny && "deny", !hasEscalate && "escalate"].filter(Boolean).join(", ")}`,
      };
    }

    // Check for vague language in the target
    const vaguePattern = /\b(may be|in some cases|special cases|when appropriate|as needed|discretion)\b/i;
    if (vaguePattern.test(targetText)) {
      return {
        accepted: true,
        confidence: 0.8,
        rationale:
          "The target span contains vague boundary language that leaves the policy " +
          "open to interpretation under adversarial pressure.",
        evidence: `Vague boundary language: "${targetText.slice(0, 80)}"`,
      };
    }

    if (missingCount === 1) {
      return {
        accepted: true,
        confidence: 0.65,
        rationale:
          "The policy is missing one boundary type. While partially specified, " +
          "the gap could be exploited under pressure.",
      };
    }

    return {
      accepted: false,
      confidence: 0.6,
      rationale:
        "The policy appears to define allow, deny, and escalate boundaries. " +
        "The current specification may be adequate.",
    };
  },
};

// --- Strategy Registry ---

const STRATEGIES: Record<string, VerificationStrategy> = {
  factual: factualStrategy,
  logical: logicalStrategy,
  schema: schemaStrategy,
  persona: personaStrategy,
  policy: policyStrategy,
};

/**
 * Verify a set of challenges against the draft.
 *
 * Each challenge is verified using a dimension-specific strategy.
 * The verifier determines whether each challenge is locally valid.
 *
 * Local-contract rule: the verifier must not accept weak or borderline challenges
 * assuming later modules will safely absorb the error.
 */
export function verifyChallenges(
  challenges: StructuredChallenge[],
  draft: string,
  context: ArrcInput,
): VerificationResult[] {
  return challenges.map((challenge) => {
    const strategy = STRATEGIES[challenge.category];
    if (!strategy) {
      return {
        accepted: false,
        confidence: 0.3,
        rationale: `No verification strategy for category "${challenge.category}".`,
        abstained: true,
      };
    }

    return strategy.verify(challenge, draft, context);
  });
}
