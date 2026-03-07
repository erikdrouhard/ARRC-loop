import type {
  RevisionChange,
  ScopedRevision,
  ValidatedChallenge,
} from "../types.js";

function findClaimSpan(draft: string, claim: string): { start: number; end: number } | null {
  // Try exact match first
  let index = draft.indexOf(claim);
  if (index !== -1) {
    return { start: index, end: index + claim.length };
  }

  // Try case-insensitive match
  index = draft.toLowerCase().indexOf(claim.toLowerCase());
  if (index !== -1) {
    return { start: index, end: index + claim.length };
  }

  // Try matching a substantial prefix (first 40+ chars)
  const prefix = claim.slice(0, Math.min(claim.length, 60));
  if (prefix.length >= 20) {
    index = draft.toLowerCase().indexOf(prefix.toLowerCase());
    if (index !== -1) {
      // Find the end of the sentence containing this match
      const sentenceEnd = draft.indexOf(".", index + prefix.length);
      const end = sentenceEnd !== -1 ? sentenceEnd + 1 : index + claim.length;
      return { start: index, end: Math.min(end, draft.length) };
    }
  }

  return null;
}

function reviseFactualClaim(draft: string, challenge: ValidatedChallenge): RevisionChange | null {
  const span = findClaimSpan(draft, challenge.claim);
  if (!span) return null;

  const original = draft.slice(span.start, span.end);

  // Scope the specific absolute/causal/quantitative claim
  let revised = original;

  // Soften absolute language — but only within the matched span
  revised = revised.replace(/\b(always)\b/gi, "typically");
  revised = revised.replace(/\b(never)\b/gi, "rarely");
  revised = revised.replace(/\b(guaranteed)\b/gi, "expected");
  revised = revised.replace(/\b(guarantees)\b/gi, "is expected to provide");
  revised = revised.replace(/\b(impossible)\b/gi, "unlikely");
  revised = revised.replace(/\b(definitely|certainly)\b/gi, "likely");
  revised = revised.replace(/\b(must)\b/gi, "should");
  revised = revised.replace(/\b(every)\b/gi, "most");
  revised = revised.replace(/\b(all)\b/gi, "most");
  revised = revised.replace(/\b(none)\b/gi, "few");
  revised = revised.replace(/\b(proven fact)\b/gi, "supported conclusion");
  revised = revised.replace(/\b(known fact)\b/gi, "generally accepted");

  // Add evidence annotation if the claim is causal/quantitative
  if (/\b(?:causes?|leads?\s+to|results?\s+in)\b/i.test(original) ||
      /\b(?:\d+%|\d+x|twice|triple|half|double)\b/i.test(original)) {
    revised += " [citation needed]";
  }

  if (revised === original) return null;

  return {
    originalSpan: original,
    revisedSpan: revised,
    reason: `factual:${challenge.id} — ${challenge.counterargument.slice(0, 60)}`,
  };
}

function reviseLogicalClaim(draft: string, challenge: ValidatedChallenge): RevisionChange | null {
  const span = findClaimSpan(draft, challenge.claim);
  if (!span) return null;

  const original = draft.slice(span.start, span.end);
  let revised = original;

  // For non-sequiturs and circular reasoning: add qualifying language
  if (challenge.counterargument.includes("circular")) {
    revised = revised.replace(
      /\b(therefore|thus|hence|so|consequently)\b/i,
      "noting that this reasoning assumes the conclusion,",
    );
  } else if (challenge.counterargument.includes("does not follow") ||
             challenge.counterargument.includes("sequitur")) {
    revised = revised.replace(
      /\b(therefore|thus|hence|so|consequently)\b/i,
      "while this connection requires further justification,",
    );
  } else if (challenge.counterargument.includes("dichotomy")) {
    revised = revised.replace(
      /\b(either)\b/i,
      "among the options (which may not be exhaustive),",
    );
  } else if (challenge.counterargument.includes("conditional") ||
             challenge.counterargument.includes("condition is not met")) {
    // Add the missing else-branch acknowledgment
    revised += " (When this condition does not hold, the behavior should be explicitly defined.)";
  }

  if (revised === original) return null;

  return {
    originalSpan: original,
    revisedSpan: revised,
    reason: `logical:${challenge.id} — ${challenge.counterargument.slice(0, 60)}`,
  };
}

function reviseSchemaClaim(draft: string, challenge: ValidatedChallenge): RevisionChange | null {
  const span = findClaimSpan(draft, challenge.claim);
  if (!span) {
    // For schema challenges, the "claim" is often a description of what's missing
    // rather than a quote from the draft. Find the most relevant schema-related span.
    const schemaSpan = findSchemaRelevantSpan(draft, challenge);
    if (!schemaSpan) return null;

    const original = draft.slice(schemaSpan.start, schemaSpan.end);
    let revised = original;

    // Add the specific missing constraint inline
    if (challenge.counterargument.includes("type")) {
      revised += " (Types must be explicitly specified for each field.)";
    } else if (challenge.counterargument.includes("required")) {
      revised += " (Required fields must be explicitly declared.)";
    } else if (challenge.counterargument.includes("enum")) {
      revised += " (Allowed values must be enumerated for categorical fields.)";
    } else if (challenge.counterargument.includes("error") || challenge.counterargument.includes("invalid")) {
      revised += " (Error handling for invalid input must be specified.)";
    } else if (challenge.counterargument.includes("open-ended") || challenge.counterargument.includes("flexible")) {
      revised = revised.replace(/\b(flexible|any|whatever|dynamic|arbitrary)\b/gi, "constrained");
    }

    if (revised === original) return null;

    return {
      originalSpan: original,
      revisedSpan: revised,
      reason: `schema:${challenge.id} — ${challenge.counterargument.slice(0, 60)}`,
    };
  }

  // If we found the claim directly
  const original = draft.slice(span.start, span.end);
  let revised = original;

  if (challenge.counterargument.includes("open-ended") || challenge.counterargument.includes("flexible")) {
    revised = revised.replace(/\b(flexible|any|whatever|dynamic|arbitrary)\b/gi, "constrained");
  }

  if (revised === original) {
    revised += " [schema constraint needed]";
  }

  return {
    originalSpan: original,
    revisedSpan: revised,
    reason: `schema:${challenge.id} — ${challenge.counterargument.slice(0, 60)}`,
  };
}

function findSchemaRelevantSpan(draft: string, challenge: ValidatedChallenge): { start: number; end: number } | null {
  // Find the first sentence that mentions fields/properties/schema-like concepts
  const patterns = [
    /\b(?:field|property|attribute|key|column|schema|object|return)[^.]*\./gi,
    /\b(?:status|type|kind|category|role|state|mode)[^.]*\./gi,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(draft);
    if (match) {
      return { start: match.index, end: match.index + match[0].length };
    }
  }

  // Fall back to first sentence
  const firstSentenceEnd = draft.indexOf(".");
  if (firstSentenceEnd !== -1) {
    return { start: 0, end: firstSentenceEnd + 1 };
  }

  return { start: 0, end: Math.min(draft.length, 100) };
}

function revisePersonaClaim(draft: string, challenge: ValidatedChallenge): RevisionChange | null {
  const span = findClaimSpan(draft, challenge.claim);
  if (!span) return null;

  const original = draft.slice(span.start, span.end);
  let revised = original;

  if (challenge.counterargument.includes("Without defined")) {
    // Missing traits entirely — add a marker for where they should go
    revised += " [Persona traits, boundaries, and pressure-handling guidance should be defined here.]";
  } else if (challenge.counterargument.includes("boundary") || challenge.counterargument.includes("boundaries")) {
    revised += " [Non-negotiable boundaries must be explicitly stated.]";
  } else if (challenge.counterargument.includes("contradict")) {
    revised += " [Contradictory traits should be reconciled with explicit priority ordering.]";
  } else if (challenge.counterargument.includes("pushback") || challenge.counterargument.includes("pressure")) {
    revised += " [Pressure-handling behavior should be specified.]";
  } else if (challenge.counterargument.includes("vague")) {
    revised += " [Trait definitions should include concrete examples.]";
  }

  if (revised === original) return null;

  return {
    originalSpan: original,
    revisedSpan: revised,
    reason: `persona:${challenge.id} — ${challenge.counterargument.slice(0, 60)}`,
  };
}

function revisePolicyClaim(draft: string, challenge: ValidatedChallenge): RevisionChange | null {
  const span = findClaimSpan(draft, challenge.claim);
  if (!span) return null;

  const original = draft.slice(span.start, span.end);
  let revised = original;

  if (challenge.counterargument.includes("deny")) {
    revised += " [Explicit deny conditions must be added: what is refused and why.]";
  } else if (challenge.counterargument.includes("soft") || challenge.counterargument.includes("try to")) {
    // Replace soft boundary language with hard boundaries
    revised = revised.replace(/\btry to\b/gi, "must");
    revised = revised.replace(/\battempt to\b/gi, "must");
    revised = revised.replace(/\bgenerally\b/gi, "always");
    revised = revised.replace(/\busually\b/gi, "always");
    revised = revised.replace(/\bin most cases\b/gi, "in all cases");
    revised = revised.replace(/\bwhere possible\b/gi, "without exception");
    revised = revised.replace(/\bideally\b/gi, "required:");
  } else if (challenge.counterargument.includes("escalat")) {
    revised += " [Escalation path must be defined: when to escalate and to whom.]";
  } else if (challenge.counterargument.includes("allow")) {
    revised += " [Explicit allow list must be defined alongside deny conditions.]";
  }

  if (revised === original) return null;

  return {
    originalSpan: original,
    revisedSpan: revised,
    reason: `policy:${challenge.id} — ${challenge.counterargument.slice(0, 60)}`,
  };
}

const REVISION_MAP: Record<string, (draft: string, challenge: ValidatedChallenge) => RevisionChange | null> = {
  factual: reviseFactualClaim,
  logical: reviseLogicalClaim,
  schema: reviseSchemaClaim,
  persona: revisePersonaClaim,
  policy: revisePolicyClaim,
};

export function reviseDraft(
  draft: string,
  acceptedChallenges: ValidatedChallenge[],
): ScopedRevision {
  if (acceptedChallenges.length === 0) {
    return { output: draft, changes: [], unchanged: true };
  }

  let currentDraft = draft;
  const changes: RevisionChange[] = [];

  for (const challenge of acceptedChallenges) {
    const reviseFn = REVISION_MAP[challenge.category];
    if (!reviseFn) continue;

    const change = reviseFn(currentDraft, challenge);
    if (change) {
      // Apply the change to the current draft
      currentDraft = currentDraft.replace(change.originalSpan, change.revisedSpan);
      changes.push(change);
    }
  }

  return {
    output: currentDraft,
    changes,
    unchanged: changes.length === 0,
  };
}
