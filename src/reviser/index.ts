import type { ArcRevision, ArcValidatedChallenge } from "../types.js";

const ABSOLUTE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\balways\b/gi, "usually"],
  [/\bnever\b/gi, "rarely"],
  [/\bguaranteed?\b/gi, "likely"],
  [/\bguarantees\b/gi, "strongly suggests"],
  [/\bdefinitely\b/gi, "likely"],
  [/\bcertainly\b/gi, "with reasonable confidence"],
  [/\bimpossible\b/gi, "unlikely"],
  [/\bmust\b/gi, "should"],
];

function softenAbsoluteClaims(draft: string): string {
  return ABSOLUTE_REPLACEMENTS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    draft,
  );
}

function appendSection(draft: string, title: string, lines: string[]): string {
  return `${draft.trim()}\n\n${title}\n${lines.map((line) => `- ${line}`).join("\n")}`;
}

export function reviseDraft(
  draft: string,
  acceptedChallenges: ArcValidatedChallenge[],
): ArcRevision {
  let nextDraft = draft;
  const revisionTargets: string[] = [];
  const notes: string[] = [];

  for (const challenge of acceptedChallenges) {
    revisionTargets.push(challenge.target);

    switch (challenge.category) {
      case "overconfidence": {
        const softened = softenAbsoluteClaims(nextDraft);
        if (softened !== nextDraft) {
          nextDraft = softened;
          notes.push("Softened certainty language to reflect defendable confidence.");
        }
        break;
      }
      case "missing-evidence":
        nextDraft = appendSection(nextDraft, "Evidence Needed Before Shipping", [
          "Link the key claim to a source, tool result, or explicit reasoning step.",
          "Separate what is known from what is inferred.",
        ]);
        notes.push("Marked evidence gaps instead of pretending the current draft is fully grounded.");
        break;
      case "unsupported-assumption":
        nextDraft = appendSection(nextDraft, "Assumptions To Expose", [
          "List the assumptions that would have to hold for this answer to remain correct.",
        ]);
        notes.push("Surfaced assumptions that could flip the decision under challenge.");
        break;
      case "instruction-coverage":
        nextDraft = appendSection(nextDraft, "Rubric Gaps", [
          "Address any missing required items before handoff.",
        ]);
        notes.push("Called out missing rubric coverage.");
        break;
      case "tool-mismatch":
        nextDraft = appendSection(nextDraft, "Tooling Check", [
          "Confirm that the draft matches the actual tool outputs and not a guessed result.",
        ]);
        notes.push("Flagged a tool-to-answer alignment risk.");
        break;
      case "persona-drift":
        nextDraft = appendSection(nextDraft, "Persona Guardrails", [
          "State the persona voice, non-negotiable boundaries, and what should not drift over follow-up turns.",
        ]);
        notes.push("Added explicit persona guardrails.");
        break;
      case "policy-drift":
        nextDraft = appendSection(nextDraft, "Policy Guardrails", [
          "State what is allowed, what is not allowed, and when to escalate instead of improvising.",
        ]);
        notes.push("Added explicit policy boundaries.");
        break;
      case "schema-brittleness":
        nextDraft = appendSection(nextDraft, "Schema Hardening", [
          "Define field types and required keys.",
          "Constrain values that should not be left open-ended.",
          "Document failure handling for invalid or partial input.",
        ]);
        notes.push("Added schema hardening guidance before downstream generation.");
        break;
      case "ambiguity":
        nextDraft = appendSection(nextDraft, "Precision Fixes", [
          "Replace vague referents with concrete nouns where the claim needs to hold under challenge.",
        ]);
        notes.push("Marked ambiguous wording that weakens rebuttal resistance.");
        break;
      default:
        break;
    }
  }

  return {
    output: nextDraft,
    revisionTargets,
    notes,
    changed: nextDraft !== draft,
  };
}
