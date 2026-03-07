import type { ArcJudgeInput, StructuredChallenge } from "../types.js";

const ALLOW_PATTERN = /\b(?:allowed|permitted|can|may|accept|enable|support|approve)\b/i;
const DENY_PATTERN = /\b(?:not allowed|forbidden|prohibited|must not|shall not|cannot|deny|refuse|reject|block|disallow)\b/i;
const ESCALATE_PATTERN = /\b(?:escalate|refer|hand off|transfer|forward|contact|supervisor|manager|human|manual review)\b/i;
const CONDITIONAL_POLICY = /\b(?:if|when|unless|except|only when|only if|provided that|as long as)\b/i;
const SOFT_BOUNDARY = /\b(?:try to|attempt to|generally|usually|in most cases|where possible|ideally|prefer|we aim to)\b/i;

interface PolicyWeakness {
  type: "no-deny-conditions" | "no-escalation-path" | "soft-boundaries" | "no-allow-list" | "ambiguous-conditions" | "no-edge-cases";
  evidence: string;
  quote: string;
}

function extractPolicyWeaknesses(draft: string, _input: ArcJudgeInput): PolicyWeakness[] {
  const weaknesses: PolicyWeakness[] = [];

  const hasDenyRules = DENY_PATTERN.test(draft);
  const hasAllowRules = ALLOW_PATTERN.test(draft);
  const hasEscalation = ESCALATE_PATTERN.test(draft);
  const hasSoftBoundaries = SOFT_BOUNDARY.test(draft);
  const hasConditionals = CONDITIONAL_POLICY.test(draft);

  // Check for missing deny conditions
  if (!hasDenyRules) {
    weaknesses.push({
      type: "no-deny-conditions",
      evidence: "The draft does not define any deny/refuse conditions. A policy without explicit denial rules cannot enforce boundaries.",
      quote: draft.slice(0, 100),
    });
  }

  // Check for missing escalation path
  if (!hasEscalation && hasDenyRules) {
    weaknesses.push({
      type: "no-escalation-path",
      evidence: "The draft defines what to deny but provides no escalation path. When a denied request is legitimate but edge-case, there is no fallback.",
      quote: draft.slice(0, 100),
    });
  }

  // Check for soft boundaries
  if (hasSoftBoundaries) {
    const softMatch = draft.match(new RegExp(`.{0,30}(?:${SOFT_BOUNDARY.source}).{0,50}`, "i"));
    const quote = softMatch?.[0] ?? "";
    weaknesses.push({
      type: "soft-boundaries",
      evidence: `The draft uses soft boundary language ("${quote.slice(0, 60)}") that can be argued around. Policies need hard allow/deny lines, not aspirational language.`,
      quote,
    });
  }

  // Check for missing allow list
  if (!hasAllowRules && hasDenyRules) {
    weaknesses.push({
      type: "no-allow-list",
      evidence: "The draft defines deny conditions but no explicit allow conditions. Without an allow list, any request not explicitly denied is implicitly allowed, which may be too permissive.",
      quote: draft.slice(0, 100),
    });
  }

  // Check for ambiguous conditional policies
  if (hasConditionals) {
    const conditionalMatches = draft.match(new RegExp(`(?:${CONDITIONAL_POLICY.source})[^.]*\\.`, "gi")) ?? [];
    for (const match of conditionalMatches) {
      // Check if the conditional has both branches addressed
      const hasElseBranch = /\b(?:otherwise|else|if not|in other cases)\b/i.test(
        draft.slice(draft.indexOf(match) + match.length, draft.indexOf(match) + match.length + 100),
      );
      if (!hasElseBranch) {
        weaknesses.push({
          type: "ambiguous-conditions",
          evidence: `The conditional policy "${match.slice(0, 80)}" does not address what happens when the condition is not met.`,
          quote: match.slice(0, 100),
        });
        break; // One example is enough
      }
    }
  }

  // Check for missing edge case handling
  if (hasDenyRules && hasAllowRules && !hasConditionals) {
    weaknesses.push({
      type: "no-edge-cases",
      evidence: "The draft defines allow and deny rules but has no conditional logic for edge cases. Real-world policy enforcement requires handling ambiguous requests.",
      quote: draft.slice(0, 100),
    });
  }

  return weaknesses;
}

function computeSignal(weakness: PolicyWeakness): number {
  switch (weakness.type) {
    case "no-deny-conditions":
      return 0.85;
    case "soft-boundaries":
      return 0.8;
    case "no-escalation-path":
      return 0.7;
    case "ambiguous-conditions":
      return 0.65;
    case "no-allow-list":
      return 0.6;
    case "no-edge-cases":
      return 0.5;
  }
}

function generateCounterargument(weakness: PolicyWeakness): string {
  switch (weakness.type) {
    case "no-deny-conditions":
      return `Without explicit deny conditions, the policy cannot enforce any boundaries. An adversarial user can make any request and the system has no rule-based reason to refuse.`;
    case "soft-boundaries":
      return `Soft boundary language like "try to" or "generally" gives adversarial users rhetorical leverage to argue that their edge case deserves an exception.`;
    case "no-escalation-path":
      return `Deny-only policies create dead ends. When a legitimate request hits a deny rule, the user has no recourse, leading to either policy circumvention or user frustration.`;
    case "ambiguous-conditions":
      return `The conditional policy has an unaddressed branch. When the stated condition is not met, the system behavior is undefined, which is exploitable.`;
    case "no-allow-list":
      return `Without explicit allow conditions, the deny-list approach is inherently permissive — everything not explicitly denied is implicitly allowed, including requests the policy authors didn't anticipate.`;
    case "no-edge-cases":
      return `Binary allow/deny without conditional handling means ambiguous requests will be forced into one bucket or the other, with no graceful middle ground.`;
  }
}

function generateFailureScenario(weakness: PolicyWeakness): string {
  switch (weakness.type) {
    case "no-deny-conditions":
      return `A user requests something clearly outside the intended scope. The system complies because there is no deny rule to trigger, creating a policy violation.`;
    case "soft-boundaries":
      return `A user says "I know you generally don't do X, but my case is special because Y." The soft boundary provides no firm basis for refusal, and the system caves.`;
    case "no-escalation-path":
      return `A user has a legitimate but unusual request that hits a deny rule. They cannot escalate and have no way to resolve their issue, abandoning the system entirely.`;
    case "ambiguous-conditions":
      return `The unaddressed branch of the conditional is triggered in production. The system produces inconsistent responses because no behavior was specified for that case.`;
    case "no-allow-list":
      return `A novel request type appears that the policy authors never considered. Because it is not on the deny list, it is implicitly allowed, even though it violates the policy's intent.`;
    case "no-edge-cases":
      return `An ambiguous request arrives that partially matches both allow and deny criteria. The system makes an arbitrary choice, and the result is inconsistent with user expectations.`;
  }
}

function computeSeverity(signal: number): StructuredChallenge["severity"] {
  if (signal >= 0.7) return "high";
  if (signal >= 0.5) return "medium";
  return "low";
}

export function challengePolicy(
  draft: string,
  input: ArcJudgeInput,
): StructuredChallenge[] {
  const weaknesses = extractPolicyWeaknesses(draft, input);
  const challenges: StructuredChallenge[] = [];

  for (const weakness of weaknesses) {
    const counterargument = generateCounterargument(weakness);
    const failureScenario = generateFailureScenario(weakness);

    if (counterargument.length < 20 || failureScenario.length < 20) continue;

    const signal = computeSignal(weakness);

    challenges.push({
      id: `policy:${challenges.length}`,
      category: "policy",
      severity: computeSeverity(signal),
      claim: weakness.quote,
      counterargument,
      failureScenario,
      signal,
    });
  }

  return challenges;
}
