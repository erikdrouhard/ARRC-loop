import type { ArcChallenge, ArcValidatedChallenge } from "../types.js";

const ACCEPTANCE_THRESHOLD = 0.65;

function rationaleForChallenge(challenge: ArcChallenge, accepted: boolean): string {
  if (accepted) {
    return `Accepted because the ${challenge.category} signal is strong enough to change the ship decision if left unresolved.`;
  }

  return `Rejected because the ${challenge.category} signal is too weak or too generic to justify revision.`;
}

export function validateChallenges(challenges: ArcChallenge[]): {
  accepted: ArcValidatedChallenge[];
  rejected: ArcValidatedChallenge[];
} {
  const validated = challenges.map<ArcValidatedChallenge>((challenge) => {
    const accepted = challenge.signal >= ACCEPTANCE_THRESHOLD;

    return {
      ...challenge,
      accepted,
      rationale: rationaleForChallenge(challenge, accepted),
    };
  });

  return {
    accepted: validated.filter((challenge) => challenge.accepted),
    rejected: validated.filter((challenge) => !challenge.accepted),
  };
}
