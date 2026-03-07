import type { ArcJudgeInput, StructuredChallenge } from "../types.js";

const TYPE_CONSTRAINT_PATTERN = /\b(?:string|number|integer|boolean|array|object|null)\b/gi;
const REQUIRED_PATTERN = /\b(?:required|mandatory|must have|must include|non-optional)\b/gi;
const ENUM_PATTERN = /\b(?:enum|one of|allowed values|valid values|options?:)\b/gi;
const VALIDATION_PATTERN = /\b(?:format|pattern|minimum|maximum|minLength|maxLength|minItems|maxItems|regex|validate|constraint)\b/gi;
const ERROR_HANDLING_PATTERN = /\b(?:error|invalid|fail|reject|default|fallback|missing|null|undefined|empty|malformed)\b/gi;

interface SchemaWeakness {
  type: "missing-types" | "no-required-fields" | "no-enum-constraints" | "no-validation" | "no-error-handling" | "open-ended";
  evidence: string;
  adversarialInput: string;
}

function extractSchemaWeaknesses(draft: string, _input: ArcJudgeInput): SchemaWeakness[] {
  const weaknesses: SchemaWeakness[] = [];
  const lowerDraft = draft.toLowerCase();

  // Check for missing type constraints
  const typeMatches = draft.match(TYPE_CONSTRAINT_PATTERN);
  if (!typeMatches || typeMatches.length === 0) {
    // Look for field-like patterns without types
    const fieldPatterns = draft.match(/\b\w+\s*[:=]\s*(?:["']|{|\[)/g);
    if (fieldPatterns && fieldPatterns.length > 0) {
      weaknesses.push({
        type: "missing-types",
        evidence: `The draft defines fields (${fieldPatterns.slice(0, 3).join(", ")}) but does not specify their types.`,
        adversarialInput: `Pass a numeric value where a string is expected, or an object where an array is expected. Without type constraints, the schema accepts structurally wrong data silently.`,
      });
    } else if (/\b(?:field|property|attribute|key|column)\b/i.test(draft)) {
      weaknesses.push({
        type: "missing-types",
        evidence: `The draft references fields/properties but does not define their data types.`,
        adversarialInput: `Submit an input with all fields set to null or empty strings. Without type definitions, there is no basis to reject malformed input.`,
      });
    }
  }

  // Check for missing required field declarations
  const requiredMatches = draft.match(REQUIRED_PATTERN);
  if (!requiredMatches || requiredMatches.length === 0) {
    // Only flag if the draft talks about fields/properties
    if (/\b(?:field|property|attribute|key|name|email|id|title|type|status)\b/i.test(draft)) {
      weaknesses.push({
        type: "no-required-fields",
        evidence: `The draft describes a data structure but does not mark any fields as required or optional.`,
        adversarialInput: `Submit a request with an empty object {}. Without required field declarations, the schema has no basis to reject it.`,
      });
    }
  }

  // Check for missing enum/value constraints on categorical fields
  const enumMatches = draft.match(ENUM_PATTERN);
  const hasCategoricalHints = /\b(?:status|type|kind|category|role|state|mode|level|priority)\b/i.test(draft);
  if ((!enumMatches || enumMatches.length === 0) && hasCategoricalHints) {
    weaknesses.push({
      type: "no-enum-constraints",
      evidence: `The draft references categorical fields (status, type, etc.) but does not constrain their allowed values.`,
      adversarialInput: `Pass status: "banana" or type: "∞". Without enumerated values, any string is technically valid for categorical fields.`,
    });
  }

  // Check for missing validation rules
  const validationMatches = draft.match(VALIDATION_PATTERN);
  if (!validationMatches || validationMatches.length === 0) {
    if (typeMatches && typeMatches.length > 0) {
      weaknesses.push({
        type: "no-validation",
        evidence: `The draft specifies types but has no validation constraints (min/max, patterns, length limits).`,
        adversarialInput: `Submit a string field with 10 million characters, or a number field with Infinity. Without validation bounds, technically valid inputs can break downstream processing.`,
      });
    }
  }

  // Check for missing error handling
  const errorHandlingMatches = draft.match(ERROR_HANDLING_PATTERN);
  if (!errorHandlingMatches || errorHandlingMatches.length < 2) {
    weaknesses.push({
      type: "no-error-handling",
      evidence: `The draft does not describe how invalid or partial input should be handled.`,
      adversarialInput: `Submit input that partially matches the schema (some fields valid, some missing or wrong type). Without error handling rules, the system behavior for partial matches is undefined.`,
    });
  }

  // Check for open-ended/flexible language
  if (/\b(?:flexible|any|whatever|dynamic|arbitrary|free-form|unstructured|open)\b/i.test(lowerDraft)) {
    const match = draft.match(/\b(?:flexible|any|whatever|dynamic|arbitrary|free-form|unstructured|open)\b[^.]*\./i);
    weaknesses.push({
      type: "open-ended",
      evidence: `The draft uses open-ended language: "${match?.[0]?.slice(0, 80) ?? "flexible/any/dynamic"}" which undermines schema durability.`,
      adversarialInput: `Send deeply nested objects, arrays of mixed types, or fields with special characters. "Flexible" schemas accept everything, including data that breaks downstream consumers.`,
    });
  }

  return weaknesses;
}

function computeSignal(weakness: SchemaWeakness): number {
  switch (weakness.type) {
    case "missing-types":
      return 0.8;
    case "no-required-fields":
      return 0.75;
    case "open-ended":
      return 0.85;
    case "no-enum-constraints":
      return 0.6;
    case "no-validation":
      return 0.55;
    case "no-error-handling":
      return 0.65;
  }
}

function computeSeverity(signal: number): StructuredChallenge["severity"] {
  if (signal >= 0.7) return "high";
  if (signal >= 0.5) return "medium";
  return "low";
}

export function challengeSchema(
  draft: string,
  input: ArcJudgeInput,
): StructuredChallenge[] {
  const weaknesses = extractSchemaWeaknesses(draft, input);
  const challenges: StructuredChallenge[] = [];

  for (const weakness of weaknesses) {
    // All three fields must be substantial
    if (weakness.evidence.length < 20 || weakness.adversarialInput.length < 20) continue;

    const signal = computeSignal(weakness);

    challenges.push({
      id: `schema:${challenges.length}`,
      category: "schema",
      severity: computeSeverity(signal),
      claim: weakness.evidence,
      counterargument: `Schema weakness: ${weakness.type.replace(/-/g, " ")}. ${weakness.evidence}`,
      failureScenario: weakness.adversarialInput,
      signal,
    });
  }

  return challenges;
}
