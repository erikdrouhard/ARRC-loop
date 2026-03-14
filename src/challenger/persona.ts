import type { ArrcInput } from "../types.js";
import { findSpan, splitSentences } from "../util.js";
import type { RawChallenge } from "./util.js";
import { isAdmissible } from "./util.js";

const PERSONA_TRAIT_PATTERN =
  /\b(voice|tone|character|persona|boundary|identity|role|style|manner)\b/i;
const BOUNDARY_PATTERN =
  /\b(never|refuse|will not|cannot|must not|won't|don't|do not)\b/i;
const CONTRADICTION_PATTERN =
  /\b(but|however|although|except|unless)\b/i;

/**
 * Persona challenger:
 * - Requires explicit persona contract if persona durability is claimed
 * - Detects missing tone/role/boundary commitments
 * - Detects contradictions between persona clauses
 */
export function generatePersonaChallenges(
  draft: string,
  _input: ArrcInput,
): RawChallenge[] {
  const challenges: RawChallenge[] = [];
  const firstSentence = splitSentences(draft)[0]?.trim() ?? draft.trim();
  const span = findSpan(draft, firstSentence);
  if (!span) return challenges;

  const hasTraits = PERSONA_TRAIT_PATTERN.test(draft);
  const hasBoundaries = BOUNDARY_PATTERN.test(draft);

  // Missing trait definitions entirely
  if (!hasTraits) {
    const c: RawChallenge = {
      category: "persona",
      subtype: "missing-persona-contract",
      severity: "medium",
      target: span,
      counterargument:
        "No explicit persona traits (voice, tone, role, style, boundaries) are defined. " +
        "Without a persona contract, there is no anchor to resist drift under pressure.",
      failureScenario:
        "A user pushes the persona toward a different voice. Without explicit trait anchors, " +
        "the system gradually adopts the user's suggested persona instead of its own.",
      signal: 0.78,
    };
    if (isAdmissible(c)) challenges.push(c);
    return challenges;
  }

  // Traits present but no boundaries
  if (!hasBoundaries) {
    const c: RawChallenge = {
      category: "persona",
      subtype: "missing-persona-boundaries",
      severity: "medium",
      target: span,
      counterargument:
        "Persona traits are defined but no explicit refusal boundaries are stated. " +
        "Traits without boundaries can be eroded through persistent pressure.",
      failureScenario:
        "A user repeatedly asks the persona to act outside its role. Without explicit " +
        "refusal boundaries, the system eventually complies, breaking durability.",
      signal: 0.74,
    };
    if (isAdmissible(c)) challenges.push(c);
  }

  // Check for contradictions between persona clauses
  const sentences = splitSentences(draft);
  const traitSentences = sentences.filter((s) => PERSONA_TRAIT_PATTERN.test(s));
  for (const sentence of traitSentences) {
    if (CONTRADICTION_PATTERN.test(sentence)) {
      const contradictionSpan = findSpan(draft, sentence.trim());
      if (contradictionSpan) {
        const c: RawChallenge = {
          category: "persona",
          subtype: "persona-clause-contradiction",
          severity: "medium",
          target: contradictionSpan,
          counterargument:
            `The persona clause "${sentence.trim().slice(0, 80)}..." contains contradictory ` +
            "signals. An adversary can exploit the contradiction to justify either behavior.",
          failureScenario:
            "A user cites one half of the contradiction to justify out-of-character behavior. " +
            "The system cannot resolve which clause takes precedence.",
          signal: 0.72,
        };
        if (isAdmissible(c)) challenges.push(c);
      }
    }
  }

  return challenges;
}
