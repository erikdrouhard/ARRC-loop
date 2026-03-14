import type { ArrcInput } from "../types.js";
import { findSpan, splitSentences } from "../util.js";
import type { RawChallenge } from "./util.js";
import { isAdmissible } from "./util.js";

const REQUIRED_FIELD_PATTERN = /\brequired\b/i;
const TYPE_CONSTRAINT_PATTERN =
  /\b(type|enum|pattern|minimum|maximum|minLength|maxLength|format)\b/i;
const ERROR_HANDLING_PATTERN =
  /\b(error|invalid|missing|null|undefined|empty|fallback|default)\b/i;

/**
 * Schema challenger: targets missing required fields, absent enums/constraints,
 * bypassable optionality, and includes constructible adversarial input examples.
 */
export function generateSchemaChallenges(
  draft: string,
  _input: ArrcInput,
): RawChallenge[] {
  const challenges: RawChallenge[] = [];
  const firstSentence = splitSentences(draft)[0]?.trim() ?? draft.trim();
  const span = findSpan(draft, firstSentence);
  if (!span) return challenges;

  const hasRequired = REQUIRED_FIELD_PATTERN.test(draft);
  const hasTypeConstraints = TYPE_CONSTRAINT_PATTERN.test(draft);
  const hasErrorHandling = ERROR_HANDLING_PATTERN.test(draft);

  if (!hasRequired) {
    const c: RawChallenge = {
      category: "schema",
      subtype: "missing-required-fields",
      severity: "high",
      target: span,
      counterargument:
        "The schema does not mark any fields as required. An empty or partial " +
        "payload would be accepted, causing downstream failures when mandatory data is missing.",
      failureScenario:
        'Adversarial input: {} or {"name": null}. The schema accepts it. ' +
        "Downstream code throws a null reference or produces corrupt output.",
      signal: 0.90,
    };
    if (isAdmissible(c)) challenges.push(c);
  }

  if (!hasTypeConstraints) {
    const c: RawChallenge = {
      category: "schema",
      subtype: "missing-type-constraints",
      severity: "high",
      target: span,
      counterargument:
        "The schema does not specify field types, enums, or value constraints. " +
        "Any value shape would be accepted, including types downstream code cannot handle.",
      failureScenario:
        'Adversarial input: {"age": "not-a-number"} or {"status": "invented-value"}. ' +
        "Downstream arithmetic or switch logic fails silently.",
      signal: 0.88,
    };
    if (isAdmissible(c)) challenges.push(c);
  }

  if (!hasErrorHandling && (hasRequired || hasTypeConstraints)) {
    const c: RawChallenge = {
      category: "schema",
      subtype: "missing-error-handling",
      severity: "medium",
      target: span,
      counterargument:
        "The schema defines constraints but does not specify behavior for invalid input. " +
        "Consumers have no guidance on what happens when validation fails.",
      failureScenario:
        "A consumer sends malformed data. The schema rejects it, but no error response " +
        "format is defined. The consumer receives an opaque failure.",
      signal: 0.75,
    };
    if (isAdmissible(c)) challenges.push(c);
  }

  return challenges;
}
