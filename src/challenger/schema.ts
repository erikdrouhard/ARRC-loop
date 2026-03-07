import type { ArrcInput, StructuredChallenge } from "../types.js";
import { findSpan, isAdmissible, makeId } from "./util.js";

const REQUIRED_FIELD_PATTERN = /\brequired\b/i;
const TYPE_CONSTRAINT_PATTERN = /\b(type|enum|pattern|minimum|maximum|minLength|maxLength|format)\b/i;
const ERROR_HANDLING_PATTERN = /\b(error|invalid|missing|null|undefined|empty|fallback|default)\b/i;

/**
 * Schema challenger: targets schema definitions that may break under adversarial input.
 *
 * Local-contract rule: must produce concrete failure cases, not generic warnings.
 */
export function generateSchemaChallenges(
  draft: string,
  _input: ArrcInput,
): StructuredChallenge[] {
  const challenges: StructuredChallenge[] = [];

  const hasRequired = REQUIRED_FIELD_PATTERN.test(draft);
  const hasTypeConstraints = TYPE_CONSTRAINT_PATTERN.test(draft);
  const hasErrorHandling = ERROR_HANDLING_PATTERN.test(draft);

  // Challenge: schema lacks required field markers
  if (!hasRequired) {
    const span = findSpan(draft, draft.trim().split(/[.!?\n]/)[0]?.trim() ?? draft.trim());
    if (span) {
      const challenge: StructuredChallenge = {
        id: makeId("schema-no-required", span),
        issueKey: "schema:missing-required-constraints",
        category: "schema",
        severity: "high",
        target: span,
        counterargument:
          "The schema does not mark any fields as required. An empty or partial payload " +
          "would be accepted, potentially causing downstream failures when mandatory data is missing.",
        failureScenario:
          "A consumer sends {} or {name: null}. The schema accepts it. " +
          "Downstream code throws a null reference or produces corrupt output " +
          "because it assumed required fields would be present.",
        signal: 0.90,
      };
      if (isAdmissible(challenge)) {
        challenges.push(challenge);
      }
    }
  }

  // Challenge: schema lacks type constraints
  if (!hasTypeConstraints) {
    const span = findSpan(draft, draft.trim().split(/[.!?\n]/)[0]?.trim() ?? draft.trim());
    if (span) {
      const challenge: StructuredChallenge = {
        id: makeId("schema-no-types", span),
        issueKey: "schema:missing-type-constraints",
        category: "schema",
        severity: "high",
        target: span,
        counterargument:
          "The schema does not specify field types, enums, or value constraints. " +
          "Any value shape would be accepted, including types that downstream code cannot handle.",
        failureScenario:
          "A consumer sends {age: \"not-a-number\"} or {status: \"invented-value\"}. " +
          "The schema accepts it. Downstream arithmetic or switch/case logic fails silently.",
        signal: 0.88,
      };
      if (isAdmissible(challenge)) {
        challenges.push(challenge);
      }
    }
  }

  // Challenge: schema lacks error handling
  if (!hasErrorHandling && (hasRequired || hasTypeConstraints)) {
    const span = findSpan(draft, draft.trim().split(/[.!?\n]/)[0]?.trim() ?? draft.trim());
    if (span) {
      const challenge: StructuredChallenge = {
        id: makeId("schema-no-error", span),
        issueKey: "schema:missing-error-handling",
        category: "schema",
        severity: "medium",
        target: span,
        counterargument:
          "The schema defines constraints but does not specify behavior for invalid or partial input. " +
          "Consumers have no guidance on what happens when validation fails.",
        failureScenario:
          "A consumer sends malformed data. The schema rejects it, but no error response " +
          "format is defined. The consumer receives an opaque failure and cannot recover gracefully.",
        signal: 0.75,
      };
      if (isAdmissible(challenge)) {
        challenges.push(challenge);
      }
    }
  }

  return challenges;
}
