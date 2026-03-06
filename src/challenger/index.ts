import type {
  ArcChallenge,
  ArcChallengeCategory,
  ArcJudgeInput,
  ArcTaskType,
} from "../types.js";

const ABSOLUTE_PATTERN =
  /\b(always|never|guarantee(?:d|s)?|definitely|certainly|impossible|must)\b/i;
const AMBIGUOUS_PATTERN = /\b(this|that|it)\b/gi;

function createChallenge(
  category: ArcChallengeCategory,
  title: string,
  critique: string,
  target: string,
  severity: ArcChallenge["severity"],
  signal: number,
): ArcChallenge {
  return {
    id: `${category}:${target}`,
    title,
    category,
    critique,
    target,
    severity,
    signal,
  };
}

function hasEvidenceMarkers(draft: string): boolean {
  return /\d|source|citation|according to|tool|evidence|because|http/i.test(draft);
}

function missingRubricItems(draft: string, rubric: string[]): string[] {
  const normalizedDraft = draft.toLowerCase();

  return rubric.filter((item) => {
    const keywords = item
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((part) => part.length > 3);

    return keywords.length > 0 && !keywords.some((keyword) => normalizedDraft.includes(keyword));
  });
}

function challengeForTaskType(taskType: ArcTaskType, draft: string): ArcChallenge[] {
  switch (taskType) {
    case "schema":
      if (!/\b(type|required|enum|properties|items)\b/i.test(draft)) {
        return [
          createChallenge(
            "schema-brittleness",
            "Schema lacks hard constraints",
            "The draft reads like a loose shape rather than a durable schema with explicit constraints.",
            "Add field types, required keys, and failure boundaries.",
            "high",
            0.92,
          ),
        ];
      }
      break;
    case "persona":
      if (!/\bvoice|tone|boundary|character|persona\b/i.test(draft)) {
        return [
          createChallenge(
            "persona-drift",
            "Persona durability is underspecified",
            "The draft does not make the character or boundary explicit enough to survive repeated pushback.",
            "Clarify the non-negotiable persona traits or limits.",
            "medium",
            0.78,
          ),
        ];
      }
      break;
    case "policy":
      if (!/\bpolicy|allowed|not allowed|escalate|boundary\b/i.test(draft)) {
        return [
          createChallenge(
            "policy-drift",
            "Policy boundary is too soft",
            "The message does not clearly define what the system will refuse, allow, or escalate under pressure.",
            "State the operating boundary and escalation condition.",
            "high",
            0.88,
          ),
        ];
      }
      break;
    default:
      break;
  }

  return [];
}

export function generateChallenges(input: ArcJudgeInput, draft: string): ArcChallenge[] {
  const taskType = input.taskType ?? "general";
  const challenges: ArcChallenge[] = [];

  if (ABSOLUTE_PATTERN.test(draft)) {
    challenges.push(
      createChallenge(
        "overconfidence",
        "Absolute claim may not survive rebuttal",
        "The draft uses certainty language that may overstate what can actually be defended under challenge.",
        "Narrow certainty language and distinguish strong claims from proven claims.",
        "medium",
        0.84,
      ),
    );
  }

  if (
    (taskType === "reasoning" || taskType === "support" || input.metadata?.usedTools) &&
    !hasEvidenceMarkers(draft)
  ) {
    challenges.push(
      createChallenge(
        "missing-evidence",
        "Key claims lack evidence markers",
        "The draft makes substantive claims but does not expose the evidence, tool output, or reasoning anchor behind them.",
        "Show why the claims should be trusted.",
        "medium",
        0.8,
      ),
    );
  }

  const ambiguousMatches = draft.match(AMBIGUOUS_PATTERN) ?? [];
  if (ambiguousMatches.length >= 4 && draft.length < 500) {
    challenges.push(
      createChallenge(
        "ambiguity",
        "Referents are ambiguous",
        "The draft relies on vague pronouns that could make rebuttals land simply because the target of a claim is unclear.",
        "Replace vague pronouns with concrete referents where precision matters.",
        "low",
        0.68,
      ),
    );
  }

  if (input.rubric?.length) {
    const missingItems = missingRubricItems(draft, input.rubric);
    if (missingItems.length > 0) {
      challenges.push(
        createChallenge(
          "instruction-coverage",
          "Rubric coverage is incomplete",
          `The draft appears to miss required rubric items: ${missingItems.join(", ")}.`,
          "Address the missing rubric requirements explicitly.",
          "medium",
          0.86,
        ),
      );
    }
  }

  challenges.push(...challengeForTaskType(taskType, draft));

  if (challenges.length === 0) {
    challenges.push(
      createChallenge(
        "unsupported-assumption",
        "No material rebuttal surfaced",
        "A first pass did not reveal a strong challenge, which suggests the draft may already be stable enough for the current risk tier.",
        "Keep watching for hidden assumptions if stakes rise.",
        "low",
        0.32,
      ),
    );
  }

  return challenges;
}
