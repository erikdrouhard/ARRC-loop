import type {
  ArrcChallengeCategory,
  ArrcInput,
  StructuredChallenge,
} from "../types.js";
import { generateFactualChallenges } from "./factual.js";
import { generateLogicalChallenges } from "./logical.js";
import { generatePersonaChallenges } from "./persona.js";
import { generatePolicyChallenges } from "./policy.js";
import { generateSchemaChallenges } from "./schema.js";

type ChallengerFn = (draft: string, input: ArrcInput) => StructuredChallenge[];

const CHALLENGERS: Record<ArrcChallengeCategory, ChallengerFn> = {
  factual: generateFactualChallenges,
  logical: generateLogicalChallenges,
  schema: generateSchemaChallenges,
  persona: generatePersonaChallenges,
  policy: generatePolicyChallenges,
};

/**
 * Generate challenges for flagged dimensions.
 *
 * Precision > recall. If no concrete challenge can be produced for a dimension,
 * that dimension is reported as abstained rather than faked.
 *
 * Local-contract rule: the challenger must not emit low-quality or speculative
 * challenges assuming the verifier will clean them up.
 */
export function generateChallenges(
  draft: string,
  input: ArrcInput,
  flaggedDimensions: ArrcChallengeCategory[],
): {
  challenges: StructuredChallenge[];
  abstainedDimensions: ArrcChallengeCategory[];
} {
  const challenges: StructuredChallenge[] = [];
  const abstainedDimensions: ArrcChallengeCategory[] = [];

  for (const dimension of flaggedDimensions) {
    const challenger = CHALLENGERS[dimension];
    const dimensionChallenges = challenger(draft, input);

    if (dimensionChallenges.length === 0) {
      // Empty is better than fake.
      abstainedDimensions.push(dimension);
    } else {
      challenges.push(...dimensionChallenges);
    }
  }

  return { challenges, abstainedDimensions };
}

export { generateFactualChallenges } from "./factual.js";
export { generateLogicalChallenges } from "./logical.js";
export { generatePersonaChallenges } from "./persona.js";
export { generatePolicyChallenges } from "./policy.js";
export { generateSchemaChallenges } from "./schema.js";
