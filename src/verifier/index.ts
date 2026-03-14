import type {
  ArrcInput,
  EvidenceClass,
  RelayedChallenge,
  VerificationResult,
} from "../types.js";

// --- Evidence Classification ---

/**
 * Classify the evidence class of text near a target span.
 * "because", "therefore", "since" are EXPLANATORY, not material evidence.
 */
function classifyLocalEvidence(context: string): EvidenceClass {
  // Tool-verified
  if (/\b(?:tool output|verified by|validated by|automated check)\b/i.test(context)) {
    return "tool-verified";
  }
  // Executable
  if (/\b(?:test shows?|benchmark|experiment|audit confirms?|test results?)\b/i.test(context)) {
    return "executable";
  }
  // Quantitative
  if (/\b\d+(?:\.\d+)?%\b/.test(context) || /\bmeasured at\b/i.test(context)) {
    return "quantitative";
  }
  // Citation-like
  if (
    /\bhttps?:\/\/\S+/.test(context) ||
    /\b(?:according to|source:|citation:|study shows|data shows|confirmed by)\b/i.test(context)
  ) {
    return "citation-like";
  }
  // Explanatory (discourse markers — do NOT count as material evidence)
  if (/\b(?:because|therefore|thus|hence|so|since|as a result|consequently)\b/i.test(context)) {
    return "explanatory";
  }
  return "none";
}

function isMaterialEvidence(ec: EvidenceClass): boolean {
  return ec === "citation-like" || ec === "quantitative" || ec === "executable" || ec === "tool-verified";
}

// --- Verification Strategies ---

/**
 * Factual verification: inspect whether the targeted claim is supported by material evidence.
 * Discourse markers ("because") do NOT defeat a factual challenge.
 */
function verifyFactual(
  challenge: RelayedChallenge,
  draft: string,
): VerificationResult {
  const target = challenge.canonicalTarget.text;

  if (!draft.includes(challenge.canonicalTarget.text) &&
      !draft.toLowerCase().includes(target.toLowerCase())) {
    return {
      accepted: false,
      confidence: 0.9,
      rationale: "Target text no longer present in draft.",
      evidenceClass: "none",
    };
  }

  // Get surrounding context for evidence check
  const idx = draft.indexOf(challenge.canonicalTarget.text);
  const realIdx = idx >= 0 ? idx : draft.toLowerCase().indexOf(target.toLowerCase());
  const surrounding = draft.slice(
    Math.max(0, realIdx - 200),
    Math.min(draft.length, realIdx + target.length + 200),
  );

  const evClass = classifyLocalEvidence(surrounding);

  if (isMaterialEvidence(evClass)) {
    return {
      accepted: false,
      confidence: 0.75,
      rationale: `Material evidence (${evClass}) found near target. Challenge does not hold locally.`,
      evidenceClass: evClass,
      evidence: `Evidence class: ${evClass}`,
    };
  }

  // Explanatory support does NOT defeat a factual challenge
  if (evClass === "explanatory") {
    return {
      accepted: true,
      confidence: 0.78,
      rationale:
        "Only explanatory discourse markers found near target (e.g., 'because'). " +
        "These are not material evidence. Challenge holds.",
      evidenceClass: evClass,
      evidence: "Explanatory markers present but insufficient.",
    };
  }

  // No evidence at all
  return {
    accepted: true,
    confidence: 0.82,
    rationale: "No evidence support found for the targeted claim. Challenge holds.",
    evidenceClass: "none",
  };
}

/**
 * Logical verification: verify actual inferential gap.
 * Does NOT require absolute language to accept.
 */
function verifyLogical(
  challenge: RelayedChallenge,
  draft: string,
): VerificationResult {
  const target = challenge.canonicalTarget.text;

  if (!draft.includes(challenge.canonicalTarget.text) &&
      !draft.toLowerCase().includes(target.toLowerCase())) {
    return {
      accepted: false,
      confidence: 0.9,
      rationale: "Target text no longer present in draft.",
      evidenceClass: "none",
    };
  }

  // Find the actual text in draft
  const idx = draft.indexOf(challenge.canonicalTarget.text);
  const actualText = idx >= 0
    ? draft.slice(idx, idx + challenge.canonicalTarget.text.length)
    : draft;

  const singleReasonPattern = /\b(?:is|are|was|were|remains?)\s+\w+\s+(?:because|since)\b/i;
  const multiReasonPattern = /\b(?:and also|additionally|furthermore|moreover|another reason|secondly|in addition)\b/i;
  const hiddenPremisePattern = /\b(?:obviously|clearly|of course|naturally|inherently|by definition|self-evident)\b/i;

  // Single-reason sufficiency
  if (singleReasonPattern.test(actualText) && !multiReasonPattern.test(actualText)) {
    return {
      accepted: true,
      confidence: 0.8,
      rationale:
        "Single-reason justification for broad conclusion. The inferential gap is real: " +
        "the property typically depends on conditions beyond the single cited reason.",
      evidenceClass: "none",
      evidence: "Single causal chain without additional supporting reasons.",
    };
  }

  // Hidden premise
  if (hiddenPremisePattern.test(actualText)) {
    return {
      accepted: true,
      confidence: 0.7,
      rationale:
        "Appeals to obviousness rather than argument. The hidden premise may not hold in all contexts.",
      evidenceClass: "none",
      evidence: "Hidden premise marker detected.",
    };
  }

  // Causal connector present — moderate logical concern
  if (/\b(?:because|since|therefore|thus|hence|so)\b/i.test(actualText)) {
    // Check if conclusion outruns premise
    const hasAbsoluteConclusion = /\b(?:always|never|must|guaranteed|impossible|certainly)\b/i.test(actualText);
    if (hasAbsoluteConclusion) {
      return {
        accepted: true,
        confidence: 0.75,
        rationale: "Absolute conclusion from bounded premise. The conclusion's strength exceeds premise support.",
        evidenceClass: "none",
      };
    }

    return {
      accepted: true,
      confidence: 0.6,
      rationale: "Causal inference with potential gap. Severity is moderate.",
      evidenceClass: "none",
    };
  }

  return {
    accepted: false,
    confidence: 0.5,
    rationale: "No clear inferential structure found for the counterargument to exploit.",
    evidenceClass: "none",
    abstained: true,
  };
}

/**
 * Schema verification: evaluate constructible counterexamples.
 */
function verifySchema(
  challenge: RelayedChallenge,
  draft: string,
): VerificationResult {
  if (!draft.includes(challenge.canonicalTarget.text)) {
    return {
      accepted: false,
      confidence: 0.9,
      rationale: "Target text no longer present in draft.",
      evidenceClass: "none",
    };
  }

  // Check if failure scenario describes constructible adversarial input
  const constructiblePatterns = [
    /\b(?:sends?|submit|input|pass|provide)\s/i,
    /\{[^}]*\}/,
    /\b(?:null|undefined|empty|"")\b/i,
    /"[^"]*":\s*"?[^"]*"?/,
  ];

  const hasConstructible = constructiblePatterns.some((p) =>
    p.test(challenge.failureScenario),
  );

  if (hasConstructible) {
    return {
      accepted: true,
      confidence: 0.85,
      rationale: "Constructible adversarial input can break the schema or bypass its constraints.",
      evidenceClass: "executable",
      evidence: `Constructible case: ${challenge.failureScenario.slice(0, 120)}`,
    };
  }

  return {
    accepted: false,
    confidence: 0.4,
    rationale: "No concretely constructible adversarial input in failure scenario.",
    evidenceClass: "none",
    abstained: true,
  };
}

/**
 * Persona verification: compare against persona contract.
 * If no contract exists, verify that persona durability is underspecified.
 */
function verifyPersona(
  challenge: RelayedChallenge,
  draft: string,
): VerificationResult {
  if (!draft.includes(challenge.canonicalTarget.text)) {
    return {
      accepted: false,
      confidence: 0.9,
      rationale: "Target text no longer present in draft.",
      evidenceClass: "none",
    };
  }

  const personaElements = /\b(?:voice|tone|character|persona|boundary|identity|role|style)\b/i;
  const hasSomePersona = personaElements.test(draft);

  if (!hasSomePersona) {
    return {
      accepted: true,
      confidence: 0.75,
      rationale: "No persona contract found. Persona durability is underspecified.",
      evidenceClass: "none",
    };
  }

  // Has some persona elements — check for boundary constraints
  const boundaryElements = /\b(?:never|refuse|will not|cannot|must not|won't)\b/i;
  if (!boundaryElements.test(draft)) {
    return {
      accepted: true,
      confidence: 0.7,
      rationale: "Persona traits mentioned but no refusal boundaries defined. Vulnerable to erosion.",
      evidenceClass: "none",
    };
  }

  // Check for contradictions
  if (/\b(?:but|however|although|except|unless)\b/i.test(challenge.canonicalTarget.text)) {
    return {
      accepted: true,
      confidence: 0.65,
      rationale: "Contradictory persona clause detected. Adversary can exploit the ambiguity.",
      evidenceClass: "none",
    };
  }

  return {
    accepted: false,
    confidence: 0.6,
    rationale: "Persona contract with traits and boundaries appears adequate.",
    evidenceClass: "none",
  };
}

/**
 * Policy verification: check allow/deny/escalate completeness.
 * Rejects repairs that are merely placeholders.
 */
function verifyPolicy(
  challenge: RelayedChallenge,
  draft: string,
): VerificationResult {
  if (!draft.includes(challenge.canonicalTarget.text)) {
    return {
      accepted: false,
      confidence: 0.9,
      rationale: "Target text no longer present in draft.",
      evidenceClass: "none",
    };
  }

  // Check for complete policy boundaries in FULL document
  const hasAllow = /\b(?:allowed|permit|can|accept|approve)\b/i.test(draft);
  const hasDeny = /\b(?:not allowed|forbidden|refuse|deny|reject|prohibit|block)\b/i.test(draft);
  const hasEscalate = /\b(?:escalate|refer|forward|hand off|human review|manual)\b/i.test(draft);

  const missingCount = [hasAllow, hasDeny, hasEscalate].filter((v) => !v).length;

  if (missingCount >= 2) {
    return {
      accepted: true,
      confidence: 0.85,
      rationale: "Multiple boundary types missing from policy specification.",
      evidenceClass: "none",
      evidence: `Missing: ${[!hasAllow && "allow", !hasDeny && "deny", !hasEscalate && "escalate"].filter(Boolean).join(", ")}`,
    };
  }

  // Check for vague language in the TARGET SPAN specifically
  const vaguePattern = /\b(?:may be|in some cases|special cases|when appropriate|as needed|discretion)\b/i;
  if (vaguePattern.test(challenge.canonicalTarget.text)) {
    // Check if it's been "fixed" with a placeholder — that doesn't count
    const placeholderPattern = /\b(?:criteria to be specified|details TBD|appropriate safeguards|to be determined)\b/i;
    if (placeholderPattern.test(draft)) {
      return {
        accepted: true,
        confidence: 0.8,
        rationale: "Vague boundary was 'fixed' with placeholder text, which is not a real repair.",
        evidenceClass: "none",
        evidence: "Placeholder repair detected.",
      };
    }

    return {
      accepted: true,
      confidence: 0.8,
      rationale: "Vague boundary language leaves policy open to interpretation under pressure.",
      evidenceClass: "none",
      evidence: `Vague term: "${challenge.canonicalTarget.text.slice(0, 80)}"`,
    };
  }

  if (missingCount === 1) {
    return {
      accepted: true,
      confidence: 0.65,
      rationale: "One policy boundary type missing.",
      evidenceClass: "none",
    };
  }

  return {
    accepted: false,
    confidence: 0.6,
    rationale: "Policy appears to define allow, deny, and escalate boundaries.",
    evidenceClass: "none",
  };
}

// --- Strategy Registry ---

type VerifyFn = (challenge: RelayedChallenge, draft: string) => VerificationResult;

const STRATEGIES: Record<string, VerifyFn> = {
  factual: verifyFactual,
  logical: verifyLogical,
  schema: verifySchema,
  persona: verifyPersona,
  policy: verifyPolicy,
};

/**
 * Verify a set of relayed challenges against the draft.
 *
 * IMPORTANT: Takes RelayedChallenge[], not raw challenges.
 * The relay must process challenges before they reach the verifier.
 */
export function verifyChallenges(
  challenges: RelayedChallenge[],
  draft: string,
  _context: ArrcInput,
): VerificationResult[] {
  return challenges.map((challenge) => {
    const strategy = STRATEGIES[challenge.category];
    if (!strategy) {
      return {
        accepted: false,
        confidence: 0.3,
        rationale: `No verification strategy for category "${challenge.category}".`,
        evidenceClass: "none" as EvidenceClass,
        abstained: true,
      };
    }
    return strategy(challenge, draft);
  });
}
