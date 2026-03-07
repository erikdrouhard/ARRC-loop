import type {
  ArcChallengeCategory,
  ArcJudgeInput,
  StructuredChallenge,
  VulnerabilityAssessment,
} from "../types.js";
import { challengeFactual } from "./factual.js";
import { challengeLogical } from "./logical.js";
import { challengePersona } from "./persona.js";
import { challengePolicy } from "./policy.js";
import { challengeSchema } from "./schema.js";

const GENERIC_PHRASES = [
  "this seems wrong",
  "this could be better",
  "this is incorrect",
  "needs improvement",
  "not good enough",
  "seems off",
  "could be improved",
];

const MIN_FIELD_LENGTH = 20;

type ChallengerFn = (draft: string, input: ArcJudgeInput) => StructuredChallenge[];

const CHALLENGER_MAP: Record<ArcChallengeCategory, ChallengerFn> = {
  factual: challengeFactual,
  logical: challengeLogical,
  schema: challengeSchema,
  persona: challengePersona,
  policy: challengePolicy,
};

function isGeneric(text: string): boolean {
  if (text.length < MIN_FIELD_LENGTH) return true;
  const lower = text.toLowerCase().trim();
  return GENERIC_PHRASES.some((phrase) => lower === phrase || lower.startsWith(phrase));
}

function isValidChallenge(challenge: StructuredChallenge): boolean {
  // Asymmetric burden of proof: all three fields must be specific
  if (isGeneric(challenge.claim)) return false;
  if (isGeneric(challenge.counterargument)) return false;
  if (isGeneric(challenge.failureScenario)) return false;
  return true;
}

export function generateChallenges(
  draft: string,
  input: ArcJudgeInput,
  assessment: VulnerabilityAssessment,
): StructuredChallenge[] {
  const dimensions = assessment.flaggedDimensions;

  // If no dimensions flagged, return empty — that's valuable signal
  if (dimensions.length === 0) return [];

  const challenges: StructuredChallenge[] = [];

  for (const dimension of dimensions) {
    const challenger = CHALLENGER_MAP[dimension];
    const dimensionChallenges = challenger(draft, input);

    // Filter out any challenges that fail the specificity gate
    for (const challenge of dimensionChallenges) {
      if (isValidChallenge(challenge)) {
        challenges.push(challenge);
      }
    }
  }

  // Return whatever we found. If nothing specific enough, return empty.
  // No filler challenges.
  return challenges;
}
