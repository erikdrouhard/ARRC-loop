import { describe, expect, it } from "vitest";
import { validateChallenges } from "../src/verifier/index.js";
import type { StructuredChallenge } from "../src/types.js";

const baseInput = { draft: "" };

function makeChallenge(overrides: Partial<StructuredChallenge> = {}): StructuredChallenge {
  return {
    id: "test:0",
    category: "factual",
    severity: "medium",
    claim: "This always works without exception in every case.",
    counterargument: "The absolute claim asserts universality without accounting for edge cases or exceptions that commonly exist in practice.",
    failureScenario: "A user encounters a legitimate edge case where the absolute claim does not hold, leading them to distrust the entire response.",
    signal: 0.7,
    ...overrides,
  };
}

describe("validateChallenges", () => {
  it("accepts challenges with real structural backing", () => {
    const draft = "This always works without exception in every case. Trust me on this one.";
    const challenge = makeChallenge({ claim: "This always works without exception in every case." });

    const { accepted, rejected } = validateChallenges([challenge], draft, { ...baseInput, draft });
    expect(accepted.length).toBeGreaterThan(0);
    expect(accepted[0]!.verification.accepted).toBe(true);
    expect(accepted[0]!.verification.rationale.length).toBeGreaterThan(0);
  });

  it("rejects challenges that reference claims not in the draft", () => {
    const draft = "A totally different piece of text with no relation to the challenge.";
    const challenge = makeChallenge({ claim: "This is a claim that does not exist anywhere in the draft text at all." });

    const { accepted, rejected } = validateChallenges([challenge], draft, { ...baseInput, draft });
    expect(rejected.length).toBeGreaterThan(0);
    expect(rejected[0]!.verification.accepted).toBe(false);
  });

  it("separates accepted and rejected challenges", () => {
    const draft = "This always works. Also this approach never fails and is guaranteed safe.";
    const strong = makeChallenge({
      id: "factual:0",
      claim: "This always works.",
      signal: 0.8,
    });
    const weak = makeChallenge({
      id: "factual:1",
      claim: "A claim that is not in the draft at all and never was mentioned.",
      signal: 0.3,
    });

    const { accepted, rejected } = validateChallenges([strong, weak], draft, { ...baseInput, draft });
    expect(accepted.length + rejected.length).toBe(2);
  });

  it("uses schema-specific verification for schema challenges", () => {
    const draft = "Return a flexible object with any fields.";
    const challenge = makeChallenge({
      category: "schema",
      claim: "Return a flexible object with any fields.",
      counterargument: "Schema weakness: open ended. The draft uses open-ended language that undermines schema durability.",
      failureScenario: "Send deeply nested objects, arrays of mixed types. Flexible schemas accept everything including data that breaks consumers.",
      signal: 0.85,
    });

    const { accepted } = validateChallenges([challenge], draft, { ...baseInput, draft, taskType: "schema" });
    expect(accepted.length).toBeGreaterThan(0);
  });
});
