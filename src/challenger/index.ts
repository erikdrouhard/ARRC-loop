import type { ArrcChallengeCategory, ArrcInput } from "../types.js";
import { generateFactualChallenges } from "./factual.js";
import { generateLogicalChallenges } from "./logical.js";
import { generatePersonaChallenges } from "./persona.js";
import { generatePolicyChallenges } from "./policy.js";
import { generateSchemaChallenges } from "./schema.js";
import type { PreRelayChallenge, RawChallenge } from "./util.js";
import { toPreRelayChallenge } from "./util.js";

type ChallengerFn = (draft: string, input: ArrcInput) => RawChallenge[];

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
 */
export function generateChallenges(
  draft: string,
  input: ArrcInput,
  flaggedDimensions: ArrcChallengeCategory[],
): {
  challenges: PreRelayChallenge[];
  abstainedDimensions: ArrcChallengeCategory[];
} {
  const challenges: PreRelayChallenge[] = [];
  const abstainedDimensions: ArrcChallengeCategory[] = [];

  for (const dimension of flaggedDimensions) {
    const challenger = CHALLENGERS[dimension];
    const raw = challenger(draft, input);

    if (raw.length === 0) {
      abstainedDimensions.push(dimension);
    } else {
      for (const r of raw) {
        challenges.push(toPreRelayChallenge(r));
      }
    }
  }

  return { challenges, abstainedDimensions };
}
