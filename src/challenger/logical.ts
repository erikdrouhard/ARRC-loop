import type { ArcJudgeInput, StructuredChallenge } from "../types.js";

const PREMISE_MARKERS =
  /\b(?:because|since|given that|assuming|if|when|as long as|provided that|due to|considering)\b/i;

const CONCLUSION_MARKERS =
  /\b(?:therefore|thus|hence|so|consequently|as a result|it follows|this means|which means|we can conclude|in conclusion|accordingly)\b/i;

const CONDITIONAL_PATTERN =
  /\b(?:if|when|assuming|provided that|as long as|unless)\b\s+(.+?)(?:,\s*|\s+then\s+)(.+?)(?:\.|$)/gi;

interface ReasoningChain {
  premise: string;
  conclusion: string;
  fullText: string;
}

interface LogicalIssue {
  type: "non-sequitur" | "missing-premise" | "circular" | "false-dichotomy" | "conditional-gap";
  chain: ReasoningChain | null;
  text: string;
}

function extractSentences(draft: string): string[] {
  return draft
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function extractReasoningChains(draft: string): ReasoningChain[] {
  const sentences = extractSentences(draft);
  const chains: ReasoningChain[] = [];

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i]!;

    // Look for explicit premise-conclusion patterns
    if (CONCLUSION_MARKERS.test(sentence) && i > 0) {
      const premise = sentences[i - 1]!;
      chains.push({
        premise,
        conclusion: sentence,
        fullText: `${premise} ${sentence}`,
      });
    }

    // Look for because/since patterns within a sentence
    if (PREMISE_MARKERS.test(sentence)) {
      const parts = sentence.split(PREMISE_MARKERS);
      if (parts.length >= 2 && parts[0]!.trim().length > 0 && parts[1]!.trim().length > 0) {
        chains.push({
          premise: parts.slice(1).join(" ").trim(),
          conclusion: parts[0]!.trim(),
          fullText: sentence,
        });
      }
    }
  }

  return chains;
}

function findLogicalIssues(draft: string): LogicalIssue[] {
  const issues: LogicalIssue[] = [];
  const chains = extractReasoningChains(draft);
  const sentences = extractSentences(draft);

  // Check for non-sequiturs: conclusions that don't share key terms with premises
  for (const chain of chains) {
    const premiseWords = new Set(
      chain.premise.toLowerCase().split(/\W+/).filter((w) => w.length > 3),
    );
    const conclusionWords = chain.conclusion.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
    const overlap = conclusionWords.filter((w) => premiseWords.has(w));

    if (conclusionWords.length > 2 && overlap.length === 0) {
      issues.push({
        type: "non-sequitur",
        chain,
        text: chain.fullText,
      });
    }
  }

  // Check for circular reasoning: conclusion restates the premise
  for (const chain of chains) {
    const premiseNormalized = chain.premise.toLowerCase().replace(/\W+/g, " ").trim();
    const conclusionNormalized = chain.conclusion.toLowerCase().replace(/\W+/g, " ").trim();

    // Simple similarity: if >60% of conclusion words appear in premise
    const conclusionWords = conclusionNormalized.split(/\s+/).filter((w) => w.length > 3);
    const premiseWordSet = new Set(premiseNormalized.split(/\s+/));
    const overlapCount = conclusionWords.filter((w) => premiseWordSet.has(w)).length;

    if (conclusionWords.length > 2 && overlapCount / conclusionWords.length > 0.6) {
      issues.push({
        type: "circular",
        chain,
        text: chain.fullText,
      });
    }
  }

  // Check for false dichotomies
  for (const sentence of sentences) {
    if (/\b(?:either|only two|only option|must choose between)\b/i.test(sentence) &&
        /\b(?:or)\b/i.test(sentence)) {
      issues.push({
        type: "false-dichotomy",
        chain: null,
        text: sentence,
      });
    }
  }

  // Check for conditional gaps: if-then without handling the else
  const conditionals = draft.matchAll(CONDITIONAL_PATTERN);
  for (const match of conditionals) {
    const fullMatch = match[0]!;
    // Check if the draft addresses the negation of the condition
    const condition = match[1]?.trim() ?? "";
    if (condition.length > 0) {
      const negationPresent =
        draft.includes(`if not ${condition}`) ||
        draft.includes(`unless ${condition}`) ||
        draft.includes("otherwise") ||
        draft.includes("if not") ||
        draft.includes("in the other case") ||
        draft.includes("else");

      if (!negationPresent) {
        issues.push({
          type: "conditional-gap",
          chain: null,
          text: fullMatch,
        });
      }
    }
  }

  return issues;
}

function generateCounterargument(issue: LogicalIssue): string {
  switch (issue.type) {
    case "non-sequitur":
      return `The conclusion "${issue.chain?.conclusion.slice(0, 60) ?? ""}" does not follow from the premise "${issue.chain?.premise.slice(0, 60) ?? ""}". The premise and conclusion share no key concepts, suggesting a logical gap in the reasoning.`;
    case "circular":
      return `The reasoning in "${issue.text.slice(0, 80)}" is circular — the conclusion restates the premise in different words without providing independent support.`;
    case "false-dichotomy":
      return `"${issue.text.slice(0, 80)}" presents a false dichotomy. The framing as only two options may exclude viable alternatives that would change the recommendation.`;
    case "conditional-gap":
      return `"${issue.text.slice(0, 80)}" establishes a conditional but does not address what happens when the condition is not met, leaving a gap in the reasoning.`;
    case "missing-premise":
      return `The argument in "${issue.text.slice(0, 80)}" relies on an unstated premise that may not hold in all contexts.`;
  }
}

function generateFailureScenario(issue: LogicalIssue): string {
  switch (issue.type) {
    case "non-sequitur":
      return `A reviewer traces the reasoning from premise to conclusion and finds no logical connection, causing them to reject the entire argument chain and request a rewrite.`;
    case "circular":
      return `When pressed for justification, the argument collapses because the only support for the conclusion is a restatement of itself, providing no actual evidence or independent reasoning.`;
    case "false-dichotomy":
      return `A stakeholder identifies a third option that was excluded by the false dichotomy, rendering the forced choice and its recommendation invalid.`;
    case "conditional-gap":
      return `The unaddressed condition occurs in production, and the response provides no guidance for that case, leaving the user without a clear path forward.`;
    case "missing-premise":
      return `The unstated assumption turns out to be false in a specific deployment context, invalidating the conclusion that depends on it.`;
  }
}

function computeSignal(issue: LogicalIssue): number {
  switch (issue.type) {
    case "non-sequitur":
      return 0.75;
    case "circular":
      return 0.7;
    case "false-dichotomy":
      return 0.6;
    case "conditional-gap":
      return 0.55;
    case "missing-premise":
      return 0.5;
  }
}

function computeSeverity(signal: number): StructuredChallenge["severity"] {
  if (signal >= 0.7) return "high";
  if (signal >= 0.5) return "medium";
  return "low";
}

export function challengeLogical(
  draft: string,
  _input: ArcJudgeInput,
): StructuredChallenge[] {
  const issues = findLogicalIssues(draft);
  const challenges: StructuredChallenge[] = [];

  for (const issue of issues) {
    const counterargument = generateCounterargument(issue);
    const failureScenario = generateFailureScenario(issue);

    // Enforce minimum specificity
    if (counterargument.length < 20 || failureScenario.length < 20) continue;

    const signal = computeSignal(issue);

    challenges.push({
      id: `logical:${challenges.length}`,
      category: "logical",
      severity: computeSeverity(signal),
      claim: issue.text,
      counterargument,
      failureScenario,
      signal,
    });
  }

  return challenges;
}
