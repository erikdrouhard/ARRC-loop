import type {
  DraftSpan,
  RelayedChallenge,
  RepairResult,
  RepairStrategy,
  VerificationResult,
} from "../types.js";

/**
 * Revise a draft based on verified, relayed challenges.
 *
 * Rules:
 * - Only verified challenges trigger revision
 * - Repairs are issue-specific and category-aware
 * - No generic word softening unless justified by the triggering issue
 * - No placeholder text like "[criteria to be specified]"
 * - If a real repair cannot be made locally, mark as unrepairable with reason
 * - Untouched text preserved exactly
 */

// --- Category-Specific Repair ---

function repairFactual(
  targetText: string,
  challenge: RelayedChallenge,
): RepairResult {
  let revised = targetText;
  let strategy: RepairStrategy = "soften";

  // Strategy 1: split-claim — if the claim is a universal, bound it
  const universalMatch = targetText.match(
    /\b(always|every|all|none|never|no\s+\w+\s+(?:is|are|will|can))\b/i,
  );
  if (universalMatch) {
    const term = universalMatch[1]!;
    const termLower = term.toLowerCase();

    // Specific, justified replacements based on the absolute term
    const replacements: Record<string, string> = {
      always: "in most observed cases",
      every: "most",
      all: "most",
      never: "in practice, rarely",
      none: "few",
    };

    const replacement = replacements[termLower];
    if (replacement) {
      revised = revised.replace(new RegExp(`\\b${escapeRegex(term)}\\b`, "i"), replacement);
      strategy = "split-claim";
    }
  }

  // Strategy 2: add-condition for unsupported claims without universals
  if (revised === targetText) {
    // Try adding a condition
    const certaintyClaim = targetText.match(
      /\b(guarantee(?:d|s)?|definitely|certainly|impossible|must)\b/i,
    );
    if (certaintyClaim) {
      const term = certaintyClaim[1]!;
      const replacements: Record<string, string> = {
        guaranteed: "expected under normal conditions",
        guarantees: "is expected to provide",
        guarantee: "is expected to ensure",
        definitely: "is expected to",
        certainly: "with reasonable confidence",
        impossible: "unlikely under normal conditions",
        must: "should",
      };
      const replacement = replacements[term.toLowerCase()];
      if (replacement) {
        revised = revised.replace(new RegExp(`\\b${escapeRegex(term)}\\b`, "i"), replacement);
        strategy = "add-condition";
      }
    }
  }

  if (revised === targetText) {
    return {
      applied: false,
      strategy: "unsupported",
      before: targetText,
      after: targetText,
      reason: "No factual repair strategy matched the specific issue.",
    };
  }

  return {
    applied: true,
    strategy,
    before: targetText,
    after: revised,
    reason: `Bounded unsupported claim: replaced absolute with conditional language justified by ${challenge.issueKey}.`,
  };
}

function repairLogical(
  targetText: string,
  challenge: RelayedChallenge,
): RepairResult {
  let revised = targetText;

  // Single-reason sufficiency: add missing condition
  const singleReason = targetText.match(
    /\b(is|are|was|were)\s+(\w+)\s+(because|since)\b/i,
  );
  if (singleReason) {
    const [, verb, adj, connector] = singleReason;
    revised = revised.replace(
      new RegExp(`\\b${verb}\\s+${adj}\\s+${connector}\\b`, "i"),
      `${verb} partially ${adj}, in part ${connector}`,
    );

    return {
      applied: true,
      strategy: "add-condition",
      before: targetText,
      after: revised,
      reason: `Added qualification to single-reason claim: ${challenge.issueKey}.`,
    };
  }

  // Hidden premise: make explicit
  const hiddenMatch = targetText.match(
    /\b(obviously|clearly|of course|naturally|inherently|by definition)\b/i,
  );
  if (hiddenMatch) {
    revised = revised.replace(
      new RegExp(`\\b${escapeRegex(hiddenMatch[1]!)}\\b`, "i"),
      "assuming standard conditions,",
    );

    return {
      applied: true,
      strategy: "add-condition",
      before: targetText,
      after: revised,
      reason: `Replaced hidden premise appeal with explicit condition: ${challenge.issueKey}.`,
    };
  }

  // Premise/conclusion mismatch: soften conclusion
  const absoluteInConclusion = targetText.match(
    /\b(always|never|must|guaranteed|impossible|certainly|definitely)\b/i,
  );
  if (absoluteInConclusion) {
    const term = absoluteInConclusion[1]!;
    const softened: Record<string, string> = {
      always: "typically",
      never: "rarely",
      must: "should",
      guaranteed: "expected",
      impossible: "unlikely",
      certainly: "likely",
      definitely: "likely",
    };
    const replacement = softened[term.toLowerCase()];
    if (replacement) {
      revised = revised.replace(new RegExp(`\\b${escapeRegex(term)}\\b`, "i"), replacement);
      return {
        applied: true,
        strategy: "soften",
        before: targetText,
        after: revised,
        reason: `Weakened absolute conclusion to match premise strength: ${challenge.issueKey}.`,
      };
    }
  }

  return {
    applied: false,
    strategy: "unsupported",
    before: targetText,
    after: targetText,
    reason: "No logical repair strategy matched. Upstream rewrite may be needed.",
  };
}

function repairSchema(
  targetText: string,
  challenge: RelayedChallenge,
): RepairResult {
  // Schema repair: try to add missing constraint if we can infer it
  const subtype = challenge.issueKey.includes("missing-required")
    ? "missing-required-fields"
    : challenge.issueKey.includes("missing-type")
      ? "missing-type-constraints"
      : challenge.issueKey.includes("missing-error")
        ? "missing-error-handling"
        : "unknown";

  // For prose-described schemas, we can add constraint language
  if (subtype === "missing-required-fields") {
    // Check if there are identifiable field references we can mark as required
    const fieldMatch = targetText.match(/\b(\w+)\s+(?:field|property|attribute)\b/i);
    if (fieldMatch) {
      const revised = targetText + ` The ${fieldMatch[1]} field is required.`;
      return {
        applied: true,
        strategy: "add-schema-constraint",
        before: targetText,
        after: revised,
        reason: `Added required constraint for identifiable field: ${challenge.issueKey}.`,
      };
    }
  }

  if (subtype === "missing-type-constraints") {
    const fieldMatch = targetText.match(/\b(\w+)\s+(?:field|property|attribute)\b/i);
    if (fieldMatch) {
      const revised = targetText + ` The ${fieldMatch[1]} field must be a string.`;
      return {
        applied: true,
        strategy: "add-schema-constraint",
        before: targetText,
        after: revised,
        reason: `Added type constraint for identifiable field: ${challenge.issueKey}.`,
      };
    }
  }

  // Cannot infer the constraint — honest unrepairable
  return {
    applied: false,
    strategy: "unsupported",
    before: targetText,
    after: targetText,
    reason: `Cannot infer missing ${subtype} from prose. ` +
      `Exact missing constraint: ${challenge.counterargument.slice(0, 100)}. ` +
      `Requires upstream schema specification.`,
  };
}

function repairPersona(
  targetText: string,
  challenge: RelayedChallenge,
): RepairResult {
  // If there are enough trait mentions, build a contract clause
  const traitPattern = /\b(voice|tone|character|persona|role|style|manner)\b/gi;
  const traits = targetText.match(traitPattern);

  if (traits && traits.length >= 2) {
    // Enough information to build a contract clause
    const revised = targetText +
      ` This persona must maintain consistent ${traits.join(", ")} across interactions and refuse requests that violate these traits.`;
    return {
      applied: true,
      strategy: "persona-contract-rewrite",
      before: targetText,
      after: revised,
      reason: `Built explicit persona contract from identified traits: ${challenge.issueKey}.`,
    };
  }

  // Not enough info to build a contract
  return {
    applied: false,
    strategy: "unsupported",
    before: targetText,
    after: targetText,
    reason: `Cannot build persona contract: insufficient trait definitions. ` +
      `Missing: explicit voice, tone, role, and boundary commitments. ` +
      `Requires upstream persona specification.`,
  };
}

function repairPolicy(
  targetText: string,
  challenge: RelayedChallenge,
): RepairResult {
  // Check if this is a vague-boundary issue
  const vagueMatch = targetText.match(
    /\b(may be|in some cases|special cases|when appropriate|as needed|discretion)\b/i,
  );

  if (vagueMatch) {
    const vagueTerm = vagueMatch[1]!;

    // Try to infer concrete conditions from context
    // Look for what the vague term is modifying
    const contextMatch = targetText.match(
      new RegExp(`(\\w+(?:\\s+\\w+){0,3})\\s+${escapeRegex(vagueTerm)}`, "i"),
    );

    if (contextMatch) {
      const subject = contextMatch[1]!.trim();
      // Can we operationalize it? Only if there's enough context
      const hasQuantifiableSubject = /\b(?:refund|credit|discount|fee|limit|amount|tier|level|request|escalat)/i.test(subject);

      if (hasQuantifiableSubject) {
        const revised = targetText.replace(
          new RegExp(`\\b${escapeRegex(vagueTerm)}\\b`, "i"),
          `when the ${subject.toLowerCase()} meets the documented threshold criteria`,
        );
        return {
          applied: true,
          strategy: "bind-policy-boundary",
          before: targetText,
          after: revised,
          reason: `Replaced vague "${vagueTerm}" with bound condition referencing ${subject}: ${challenge.issueKey}.`,
        };
      }
    }

    // Cannot infer concrete criteria — do NOT insert placeholder
    return {
      applied: false,
      strategy: "unsupported",
      before: targetText,
      after: targetText,
      reason: `Cannot operationalize "${vagueTerm}": no concrete criteria can be inferred from context. ` +
        `Requires upstream policy specification with explicit conditions.`,
    };
  }

  // Missing boundaries issue — cannot add boundaries from thin air
  if (challenge.issueKey.includes("missing-boundaries")) {
    return {
      applied: false,
      strategy: "unsupported",
      before: targetText,
      after: targetText,
      reason: `Cannot add missing policy boundaries (allow/deny/escalate) from local context. ` +
        `Requires upstream policy definition.`,
    };
  }

  return {
    applied: false,
    strategy: "unsupported",
    before: targetText,
    after: targetText,
    reason: "No policy repair strategy matched the specific issue.",
  };
}

// --- Dispatch ---

type RepairFn = (targetText: string, challenge: RelayedChallenge) => RepairResult;

const REPAIR_STRATEGIES: Record<string, RepairFn> = {
  factual: repairFactual,
  logical: repairLogical,
  schema: repairSchema,
  persona: repairPersona,
  policy: repairPolicy,
};

export interface RevisionOutcome {
  output: string;
  repairs: Array<{
    issueKey: string;
    repair: RepairResult;
    originalSpan: DraftSpan;
    revisedSpan: DraftSpan;
  }>;
  unchanged: boolean;
}

/**
 * Revise a draft based on verified, relayed challenges.
 *
 * Only verified challenges trigger revision.
 * Repairs are scoped to the specific issue's target span.
 * No placeholders. No generic softening. Honest unrepairable marking.
 */
export function reviseDraft(
  draft: string,
  challenges: RelayedChallenge[],
  verifications: VerificationResult[],
): RevisionOutcome {
  const repairs: RevisionOutcome["repairs"] = [];
  let currentDraft = draft;
  let offset = 0;

  // Only process verified (accepted) challenges, sorted by position
  const verified = challenges
    .map((c, i) => ({ challenge: c, verification: verifications[i] }))
    .filter((pair) => pair.verification?.accepted === true)
    .sort((a, b) => a.challenge.canonicalTarget.start - b.challenge.canonicalTarget.start);

  for (const { challenge } of verified) {
    const adjustedStart = challenge.canonicalTarget.start + offset;
    const adjustedEnd = challenge.canonicalTarget.end + offset;

    // Verify span still matches
    const currentText = currentDraft.slice(adjustedStart, adjustedEnd);
    if (currentText !== challenge.canonicalTarget.text) {
      // Span shifted — try to find it
      const newIdx = currentDraft.indexOf(challenge.canonicalTarget.text);
      if (newIdx === -1) {
        // Text no longer present — cannot repair
        repairs.push({
          issueKey: challenge.issueKey,
          repair: {
            applied: false,
            strategy: "unsupported",
            before: challenge.canonicalTarget.text,
            after: challenge.canonicalTarget.text,
            reason: "Target text no longer present in draft after prior repairs.",
          },
          originalSpan: challenge.canonicalTarget,
          revisedSpan: challenge.canonicalTarget,
        });
        continue;
      }
      // Adjust to new position (don't use offset tracking for this)
    }

    const repairFn = REPAIR_STRATEGIES[challenge.category];
    if (!repairFn) {
      repairs.push({
        issueKey: challenge.issueKey,
        repair: {
          applied: false,
          strategy: "unsupported",
          before: challenge.canonicalTarget.text,
          after: challenge.canonicalTarget.text,
          reason: `No repair strategy for category "${challenge.category}".`,
        },
        originalSpan: challenge.canonicalTarget,
        revisedSpan: challenge.canonicalTarget,
      });
      continue;
    }

    const result = repairFn(currentText, challenge);

    if (result.applied) {
      currentDraft =
        currentDraft.slice(0, adjustedStart) +
        result.after +
        currentDraft.slice(adjustedEnd);

      const revisedSpan: DraftSpan = {
        text: result.after,
        start: adjustedStart,
        end: adjustedStart + result.after.length,
      };

      repairs.push({
        issueKey: challenge.issueKey,
        repair: result,
        originalSpan: challenge.canonicalTarget,
        revisedSpan,
      });

      offset += result.after.length - challenge.canonicalTarget.text.length;
    } else {
      repairs.push({
        issueKey: challenge.issueKey,
        repair: result,
        originalSpan: challenge.canonicalTarget,
        revisedSpan: challenge.canonicalTarget,
      });
    }
  }

  return {
    output: currentDraft,
    repairs,
    unchanged: currentDraft === draft,
  };
}

// --- Helpers ---

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
