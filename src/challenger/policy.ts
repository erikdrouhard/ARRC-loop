import type { ArrcInput, StructuredChallenge } from "../types.js";
import { findSpan, isAdmissible, makeId } from "./util.js";

const ALLOW_PATTERN = /\b(allowed|permit|can|may|accept|approve)\b/i;
const DENY_PATTERN = /\b(not allowed|forbidden|refuse|deny|reject|prohibit|block)\b/i;
const ESCALATE_PATTERN = /\b(escalate|refer|forward|hand off|human review|manual)\b/i;
const VAGUE_POLICY_PATTERN = /\b(may be|in some cases|special cases|when appropriate|as needed|discretion)\b/i;

/**
 * Policy challenger: targets policy boundaries that are missing or ambiguous.
 *
 * Local-contract rule: challenges must cite specific missing boundary types,
 * not generic "policy is unclear" warnings.
 */
export function generatePolicyChallenges(
  draft: string,
  _input: ArrcInput,
): StructuredChallenge[] {
  const challenges: StructuredChallenge[] = [];

  const hasAllow = ALLOW_PATTERN.test(draft);
  const hasDeny = DENY_PATTERN.test(draft);
  const hasEscalate = ESCALATE_PATTERN.test(draft);
  const hasVaguePolicy = VAGUE_POLICY_PATTERN.test(draft);

  // Missing boundary type: need allow + deny + escalate for complete policy
  const missingBoundaries: string[] = [];
  if (!hasAllow) missingBoundaries.push("allow");
  if (!hasDeny) missingBoundaries.push("deny");
  if (!hasEscalate) missingBoundaries.push("escalate");

  if (missingBoundaries.length >= 2) {
    const span = findSpan(draft, draft.trim().split(/[.!?\n]/)[0]?.trim() ?? draft.trim());
    if (span) {
      const challenge: StructuredChallenge = {
        id: makeId("policy-missing-boundaries", span),
        issueKey: `policy:missing-boundaries:${missingBoundaries.join(",")}`,
        category: "policy",
        severity: "high",
        target: span,
        counterargument:
          `The policy is missing explicit ${missingBoundaries.join(" and ")} boundaries. ` +
          `A complete policy must define what is allowed, what is denied, and when to escalate. ` +
          `Without these, the system must improvise under pressure.`,
        failureScenario:
          `A user requests an action at the boundary of the policy. Without explicit ` +
          `${missingBoundaries.join("/")} rules, the system either over-permits (risk) or ` +
          `over-denies (poor experience), with no escalation path for ambiguous cases.`,
        signal: 0.88,
      };
      if (isAdmissible(challenge)) {
        challenges.push(challenge);
      }
    }
  }

  // Vague policy language
  if (hasVaguePolicy) {
    const sentences = draft.split(/(?<=[.!?])\s+/);
    for (const sentence of sentences) {
      const vagueMatch = sentence.match(VAGUE_POLICY_PATTERN);
      if (!vagueMatch) continue;

      const span = findSpan(draft, sentence.trim());
      if (!span) continue;

      const challenge: StructuredChallenge = {
        id: makeId("policy-vague", span),
        issueKey: `policy:vague-boundary:${vagueMatch[1]!.toLowerCase().replace(/\s+/g, "-")}:${span.start}`,
        category: "policy",
        severity: "medium",
        target: span,
        counterargument:
          `The phrase "${vagueMatch[1]!}" creates an ambiguous boundary. ` +
          `It does not specify who decides, under what criteria, or what the default action is. ` +
          `This leaves the boundary open to interpretation under adversarial pressure.`,
        failureScenario:
          `A user argues they qualify for the vague condition ("${vagueMatch[1]}"). ` +
          `The system has no concrete criteria to evaluate the claim, so it either ` +
          `grants the request inappropriately or refuses without justification.`,
        signal: 0.80,
      };
      if (isAdmissible(challenge)) {
        challenges.push(challenge);
      }
    }
  }

  return challenges;
}
