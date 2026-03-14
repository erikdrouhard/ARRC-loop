import type { ArrcInput } from "../types.js";
import { findSpan, splitSentences } from "../util.js";
import type { RawChallenge } from "./util.js";
import { isAdmissible } from "./util.js";

const ALLOW_PATTERN = /\b(allowed|permit|can|accept|approve)\b/i;
const DENY_PATTERN = /\b(not allowed|forbidden|refuse|deny|reject|prohibit|block)\b/i;
const ESCALATE_PATTERN = /\b(escalate|refer|forward|hand off|human review|manual)\b/i;
const VAGUE_POLICY_PATTERN =
  /\b(may be|in some cases|special cases|when appropriate|as needed|discretion|at .+ judgment)\b/i;

/**
 * Policy challenger:
 * - Requires explicit allow/deny/escalate structure
 * - Detects vague terms that are not operationalized
 * - Distinguishes "missing boundary" from "vague boundary"
 */
export function generatePolicyChallenges(
  draft: string,
  _input: ArrcInput,
): RawChallenge[] {
  const challenges: RawChallenge[] = [];

  const hasAllow = ALLOW_PATTERN.test(draft);
  const hasDeny = DENY_PATTERN.test(draft);
  const hasEscalate = ESCALATE_PATTERN.test(draft);

  // Missing boundary types
  const missing: string[] = [];
  if (!hasAllow) missing.push("allow");
  if (!hasDeny) missing.push("deny");
  if (!hasEscalate) missing.push("escalate");

  if (missing.length >= 2) {
    const firstSentence = splitSentences(draft)[0]?.trim() ?? draft.trim();
    const span = findSpan(draft, firstSentence);
    if (span) {
      const c: RawChallenge = {
        category: "policy",
        subtype: "missing-boundaries",
        severity: "high",
        target: span,
        counterargument:
          `The policy is missing explicit ${missing.join(" and ")} boundaries. ` +
          `A complete policy must define what is allowed, what is denied, and when to escalate.`,
        failureScenario:
          `A user requests an action at the boundary. Without explicit ` +
          `${missing.join("/")} rules, the system over-permits or over-denies ` +
          `with no escalation path.`,
        signal: 0.88,
      };
      if (isAdmissible(c)) challenges.push(c);
    }
  }

  // Vague boundary language: specific per-sentence detection
  const sentences = splitSentences(draft);
  for (const sentence of sentences) {
    const vagueMatch = sentence.match(VAGUE_POLICY_PATTERN);
    if (!vagueMatch) continue;

    const span = findSpan(draft, sentence.trim());
    if (!span) continue;

    const vagueTerm = vagueMatch[1]!;

    const c: RawChallenge = {
      category: "policy",
      subtype: "vague-boundary",
      severity: "medium",
      target: span,
      counterargument:
        `The phrase "${vagueTerm}" creates an ambiguous boundary. It does not specify ` +
        `who decides, under what criteria, or what the default action is.`,
      failureScenario:
        `A user argues they qualify for "${vagueTerm}". The system has no concrete ` +
        `criteria to evaluate the claim, so it grants inappropriately or refuses ` +
        `without justification.`,
      signal: 0.80,
    };
    if (isAdmissible(c)) challenges.push(c);
  }

  return challenges;
}
