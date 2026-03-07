import type { ArrcInput, StructuredChallenge } from "../types.js";
import { findSpan, isAdmissible, makeId } from "./util.js";

const PERSONA_TRAIT_PATTERN =
  /\b(voice|tone|character|persona|boundary|identity|role|style|manner)\b/i;

const BOUNDARY_PATTERN =
  /\b(never|refuse|will not|cannot|must not|won't|don't|do not)\b/i;

/**
 * Persona challenger: targets persona definitions that may drift under pushback.
 *
 * Local-contract rule: challenges must point to specific durability gaps,
 * not generic "persona could drift" warnings.
 */
export function generatePersonaChallenges(
  draft: string,
  _input: ArrcInput,
): StructuredChallenge[] {
  const challenges: StructuredChallenge[] = [];

  const hasPersonaTraits = PERSONA_TRAIT_PATTERN.test(draft);
  const hasBoundaries = BOUNDARY_PATTERN.test(draft);

  if (!hasPersonaTraits) {
    const span = findSpan(draft, draft.trim().split(/[.!?\n]/)[0]?.trim() ?? draft.trim());
    if (span) {
      const challenge: StructuredChallenge = {
        id: makeId("persona-no-traits", span),
        issueKey: "persona:missing-trait-definition",
        category: "persona",
        severity: "medium",
        target: span,
        counterargument:
          "The draft does not explicitly define persona traits (voice, tone, character boundaries). " +
          "Without explicit trait anchors, the persona is vulnerable to drift across follow-up turns " +
          "or adversarial prompts.",
        failureScenario:
          "A user pushes the persona toward a different voice or character. Without explicit trait " +
          "definitions, the system has no anchor to resist drift and gradually adopts the user's " +
          "suggested persona instead of maintaining its own.",
        signal: 0.78,
      };
      if (isAdmissible(challenge)) {
        challenges.push(challenge);
      }
    }
  }

  if (!hasBoundaries && hasPersonaTraits) {
    const span = findSpan(draft, draft.trim().split(/[.!?\n]/)[0]?.trim() ?? draft.trim());
    if (span) {
      const challenge: StructuredChallenge = {
        id: makeId("persona-no-boundaries", span),
        issueKey: "persona:missing-boundaries",
        category: "persona",
        severity: "medium",
        target: span,
        counterargument:
          "Persona traits are defined but no explicit boundaries (refusals, limits) are stated. " +
          "Traits without boundaries can be gradually eroded through persistent pressure.",
        failureScenario:
          "A user repeatedly asks the persona to act outside its defined role. Without explicit " +
          "refusal boundaries, the system eventually complies, breaking persona durability.",
        signal: 0.74,
      };
      if (isAdmissible(challenge)) {
        challenges.push(challenge);
      }
    }
  }

  return challenges;
}
