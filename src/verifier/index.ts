import type {
  ArcChallengeCategory,
  ArcJudgeInput,
  StructuredChallenge,
  ValidatedChallenge,
  VerificationResult,
} from "../types.js";

// ── Verification Strategy Interface ──────────────────────────────────────────

interface VerificationStrategy {
  verify(challenge: StructuredChallenge, draft: string, context: ArcJudgeInput): VerificationResult;
}

// ── Factual Verification Strategy ────────────────────────────────────────────

const EVIDENCE_MARKERS =
  /(?:\b(?:according to|source|citation|study|research|data|evidence|measured|tested|verified|confirmed|observed|documented|reported|because|since|given that|as shown)\b|https?:\/\/|\[\d+\])/gi;

const factualStrategy: VerificationStrategy = {
  verify(challenge, draft, _context) {
    let confidence = 0.5;
    const reasons: string[] = [];

    // Check if the challenged claim actually exists in the draft
    const claimInDraft = draft.includes(challenge.claim) ||
      draft.toLowerCase().includes(challenge.claim.toLowerCase().slice(0, 40));
    if (!claimInDraft) {
      return {
        accepted: false,
        confidence: 0.9,
        rationale: "The challenged claim does not appear in the draft. Challenge is stale or misquoted.",
      };
    }

    // Check if the claim has evidence markers nearby
    const claimIndex = draft.toLowerCase().indexOf(challenge.claim.toLowerCase().slice(0, 40));
    const surrounding = draft.slice(
      Math.max(0, claimIndex - 100),
      Math.min(draft.length, claimIndex + challenge.claim.length + 200),
    );
    const evidenceMatches = surrounding.match(EVIDENCE_MARKERS) ?? [];

    if (evidenceMatches.length === 0) {
      confidence += 0.2;
      reasons.push("Claim lacks evidence markers in surrounding context.");
    } else {
      confidence -= 0.2;
      reasons.push(`Claim has ${evidenceMatches.length} evidence marker(s) nearby.`);
    }

    // Check if the counterargument is internally consistent (not self-contradicting)
    const counterargHasLogic = challenge.counterargument.length > 30 &&
      /\b(?:because|since|without|assumes|asserts|claims)\b/i.test(challenge.counterargument);
    if (counterargHasLogic) {
      confidence += 0.1;
      reasons.push("Counterargument provides reasoning structure.");
    } else {
      confidence -= 0.1;
      reasons.push("Counterargument lacks reasoning structure.");
    }

    // Check if failure scenario is plausible (specific enough)
    const scenarioSpecific = challenge.failureScenario.length > 40 &&
      /\b(?:when|if|user|system|request|input|scenario|case|context)\b/i.test(challenge.failureScenario);
    if (scenarioSpecific) {
      confidence += 0.1;
      reasons.push("Failure scenario describes a specific situation.");
    }

    // Bias toward rejection: challenge needs to be clearly valid
    const accepted = confidence >= 0.6;

    return {
      accepted,
      confidence,
      rationale: reasons.join(" "),
      evidence: accepted
        ? `Claim "${challenge.claim.slice(0, 50)}..." lacks sufficient grounding.`
        : `Challenge does not meet the burden of proof for factual revision.`,
    };
  },
};

// ── Logical Verification Strategy ────────────────────────────────────────────

const logicalStrategy: VerificationStrategy = {
  verify(challenge, draft, _context) {
    let confidence = 0.5;
    const reasons: string[] = [];

    // Check if the challenged reasoning exists in the draft
    const claimInDraft = draft.includes(challenge.claim) ||
      draft.toLowerCase().includes(challenge.claim.toLowerCase().slice(0, 40));
    if (!claimInDraft) {
      return {
        accepted: false,
        confidence: 0.9,
        rationale: "The challenged reasoning chain does not appear in the draft.",
      };
    }

    // Check if the counterargument identifies a real gap vs just negating the claim
    const isNegation = challenge.counterargument.toLowerCase().includes("not " + challenge.claim.toLowerCase().slice(0, 20));
    if (isNegation) {
      confidence -= 0.2;
      reasons.push("Counterargument appears to simply negate the claim rather than identifying a structural gap.");
    } else {
      confidence += 0.15;
      reasons.push("Counterargument identifies an independent issue with the reasoning.");
    }

    // Check if the counterargument references logical structure
    const logicalTerms = /\b(?:premise|conclusion|follows|sequitur|circular|dichotomy|assumption|implies|entails|contradiction)\b/i;
    if (logicalTerms.test(challenge.counterargument)) {
      confidence += 0.15;
      reasons.push("Counterargument uses logical reasoning terminology.");
    }

    // Check that the failure scenario is different from the counterargument
    const scenarioOverlap = computeWordOverlap(challenge.counterargument, challenge.failureScenario);
    if (scenarioOverlap > 0.6) {
      confidence -= 0.1;
      reasons.push("Failure scenario largely restates the counterargument.");
    } else {
      confidence += 0.1;
      reasons.push("Failure scenario describes a distinct situation from the counterargument.");
    }

    const accepted = confidence >= 0.6;

    return {
      accepted,
      confidence,
      rationale: reasons.join(" "),
      evidence: accepted
        ? `Logical gap identified in: "${challenge.claim.slice(0, 50)}..."`
        : `Challenge does not demonstrate a clear logical flaw.`,
    };
  },
};

// ── Schema Verification Strategy ─────────────────────────────────────────────

const schemaStrategy: VerificationStrategy = {
  verify(challenge, draft, _context) {
    let confidence = 0.5;
    const reasons: string[] = [];

    // Schema challenges are the most mechanically verifiable
    // Check if the adversarial input described in failureScenario is constructible

    // Does the failure scenario describe a concrete input?
    const hasConcreteInput = /\b(?:pass|submit|send|input|set|empty|null|object|string|number|array|{}|\[\])\b/i.test(
      challenge.failureScenario,
    );
    if (hasConcreteInput) {
      confidence += 0.2;
      reasons.push("Failure scenario describes a concrete adversarial input.");
    } else {
      confidence -= 0.1;
      reasons.push("Failure scenario does not describe a concrete input.");
    }

    // Does the draft actually lack the constraint the challenge identifies?
    const constraintTypes: Array<[string, RegExp]> = [
      ["type constraints", /\b(?:string|number|integer|boolean|array|object|null)\b/i],
      ["required fields", /\b(?:required|mandatory|must have)\b/i],
      ["enum constraints", /\b(?:enum|one of|allowed values)\b/i],
      ["validation rules", /\b(?:minimum|maximum|minLength|maxLength|pattern|format|regex)\b/i],
      ["error handling", /\b(?:error|invalid|reject|fail|default|fallback)\b/i],
    ];

    for (const [label, pattern] of constraintTypes) {
      if (challenge.counterargument.toLowerCase().includes(label.split(" ")[0]!) && !pattern.test(draft)) {
        confidence += 0.15;
        reasons.push(`Draft lacks ${label}, which the challenge correctly identifies.`);
      }
    }

    // Schema challenges at high signal are more likely valid
    if (challenge.signal >= 0.7) {
      confidence += 0.1;
      reasons.push("Challenge signal indicates structural weakness.");
    }

    const accepted = confidence >= 0.55; // Lower threshold for schema — more mechanically verifiable

    return {
      accepted,
      confidence,
      rationale: reasons.join(" "),
      evidence: accepted
        ? `Schema weakness verified: ${challenge.counterargument.slice(0, 60)}`
        : `Schema challenge does not demonstrate a concrete exploitable gap.`,
    };
  },
};

// ── Persona Verification Strategy ────────────────────────────────────────────

const PERSONA_TRAITS = /\b(?:voice|tone|character|persona|personality|style|manner|attitude|brand|identity|empathetic|friendly|professional|formal|casual|warm|cold|neutral)\b/gi;

const personaStrategy: VerificationStrategy = {
  verify(challenge, draft, _context) {
    let confidence = 0.5;
    const reasons: string[] = [];

    // Does the challenge reference a specific trait or quote?
    const challengeQuotesFromDraft = draft.includes(challenge.claim) ||
      draft.toLowerCase().includes(challenge.claim.toLowerCase().slice(0, 30));
    if (challengeQuotesFromDraft) {
      confidence += 0.15;
      reasons.push("Challenge references specific text from the draft.");
    } else {
      confidence -= 0.15;
      reasons.push("Challenge does not quote specific text from the draft.");
    }

    // Does the draft actually define the trait the challenge identifies as missing?
    const traitMatches = draft.match(PERSONA_TRAITS) ?? [];
    if (traitMatches.length < 2 && challenge.counterargument.includes("Without defined")) {
      confidence += 0.2;
      reasons.push("Draft has minimal persona trait definitions, supporting the challenge.");
    }

    // Does the challenge identify a specific trait violation?
    const hasSpecificTrait = /\b(?:voice|tone|boundary|trait|character|persona)\b/i.test(challenge.counterargument);
    if (hasSpecificTrait) {
      confidence += 0.1;
      reasons.push("Challenge identifies a specific persona dimension.");
    }

    const accepted = confidence >= 0.6;

    return {
      accepted,
      confidence,
      rationale: reasons.join(" "),
      evidence: accepted
        ? `Persona weakness: "${challenge.claim.slice(0, 50)}..."`
        : `Challenge does not identify a concrete persona durability issue.`,
    };
  },
};

// ── Policy Verification Strategy ─────────────────────────────────────────────

const policyStrategy: VerificationStrategy = {
  verify(challenge, draft, _context) {
    let confidence = 0.5;
    const reasons: string[] = [];

    // Does the draft have explicit allow/deny/escalate conditions?
    const hasAllow = /\b(?:allowed|permitted|can|may|accept)\b/i.test(draft);
    const hasDeny = /\b(?:not allowed|forbidden|prohibited|must not|cannot|deny|refuse)\b/i.test(draft);
    const hasEscalate = /\b(?:escalate|refer|hand off|transfer|human review)\b/i.test(draft);

    // If challenge says boundary is too soft, verify by checking for hard boundaries
    if (challenge.counterargument.toLowerCase().includes("soft") ||
        challenge.counterargument.toLowerCase().includes("try to") ||
        challenge.counterargument.toLowerCase().includes("generally")) {
      const softBoundaryInDraft = /\b(?:try to|attempt to|generally|usually|in most cases|where possible|ideally)\b/i.test(draft);
      if (softBoundaryInDraft) {
        confidence += 0.2;
        reasons.push("Draft contains soft boundary language that the challenge correctly identifies.");
      }
    }

    // Verify the specific gap the challenge identifies
    if (!hasDeny && challenge.counterargument.includes("deny")) {
      confidence += 0.2;
      reasons.push("Draft lacks deny conditions as the challenge states.");
    }
    if (!hasEscalate && challenge.counterargument.includes("escalat")) {
      confidence += 0.15;
      reasons.push("Draft lacks escalation path as the challenge states.");
    }
    if (!hasAllow && challenge.counterargument.includes("allow")) {
      confidence += 0.1;
      reasons.push("Draft lacks explicit allow conditions.");
    }

    const accepted = confidence >= 0.6;

    return {
      accepted,
      confidence,
      rationale: reasons.join(" "),
      evidence: accepted
        ? `Policy gap verified: ${challenge.counterargument.slice(0, 60)}`
        : `Challenge does not demonstrate a concrete policy enforcement gap.`,
    };
  },
};

// ── Utility ──────────────────────────────────────────────────────────────────

function computeWordOverlap(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  const wordsB = b.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  if (wordsB.length === 0) return 0;
  const overlap = wordsB.filter((w) => wordsA.has(w)).length;
  return overlap / wordsB.length;
}

// ── Strategy Router ──────────────────────────────────────────────────────────

const STRATEGY_MAP: Record<ArcChallengeCategory, VerificationStrategy> = {
  factual: factualStrategy,
  logical: logicalStrategy,
  schema: schemaStrategy,
  persona: personaStrategy,
  policy: policyStrategy,
};

// ── Public API ───────────────────────────────────────────────────────────────

export function validateChallenges(
  challenges: StructuredChallenge[],
  draft: string,
  context: ArcJudgeInput,
): { accepted: ValidatedChallenge[]; rejected: ValidatedChallenge[] } {
  const accepted: ValidatedChallenge[] = [];
  const rejected: ValidatedChallenge[] = [];

  for (const challenge of challenges) {
    const strategy = STRATEGY_MAP[challenge.category];
    const result = strategy.verify(challenge, draft, context);

    const validated: ValidatedChallenge = {
      ...challenge,
      verification: result,
    };

    if (result.accepted) {
      accepted.push(validated);
    } else {
      rejected.push(validated);
    }
  }

  return { accepted, rejected };
}
