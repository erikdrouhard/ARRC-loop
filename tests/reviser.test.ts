import { describe, expect, it } from "vitest";
import { reviseDraft } from "../src/reviser/index.js";
import type { ValidatedChallenge } from "../src/types.js";

function makeValidated(overrides: Partial<ValidatedChallenge> = {}): ValidatedChallenge {
  return {
    id: "test:0",
    category: "factual",
    severity: "medium",
    claim: "",
    counterargument: "",
    failureScenario: "",
    signal: 0.7,
    verification: {
      accepted: true,
      confidence: 0.75,
      rationale: "Test rationale",
    },
    ...overrides,
  };
}

describe("reviseDraft", () => {
  it("returns unchanged when no challenges provided", () => {
    const result = reviseDraft("Original draft text.", []);
    expect(result.unchanged).toBe(true);
    expect(result.output).toBe("Original draft text.");
    expect(result.changes).toHaveLength(0);
  });

  it("scopes factual revisions to the challenged claim only", () => {
    const draft = "This always works. The sky is blue. It never fails.";
    const challenge = makeValidated({
      category: "factual",
      claim: "This always works.",
      counterargument: "The absolute claim asserts universality without exceptions.",
      failureScenario: "Edge case breaks the assumption.",
    });

    const result = reviseDraft(draft, [challenge]);
    expect(result.unchanged).toBe(false);
    // The challenged sentence should be modified
    expect(result.output).toContain("typically");
    // The unchallenged sentence should remain unchanged
    expect(result.output).toContain("The sky is blue.");
    // "never" in the unchallenged sentence should NOT be changed
    expect(result.output).toContain("never fails");
  });

  it("tracks changes with originalSpan and revisedSpan", () => {
    const draft = "This is guaranteed to work.";
    const challenge = makeValidated({
      category: "factual",
      claim: "This is guaranteed to work.",
      counterargument: "Asserts certainty without evidence.",
      failureScenario: "Fails when assumptions don't hold.",
    });

    const result = reviseDraft(draft, [challenge]);
    expect(result.changes.length).toBeGreaterThan(0);
    expect(result.changes[0]!.originalSpan).toBe("This is guaranteed to work.");
    expect(result.changes[0]!.revisedSpan).not.toBe("This is guaranteed to work.");
    expect(result.changes[0]!.reason).toContain("factual");
  });

  it("applies policy revisions to soft boundaries", () => {
    const draft = "We try to help where we can.";
    const challenge = makeValidated({
      category: "policy",
      claim: "We try to help where we can.",
      counterargument: "Soft boundary: try to language gives adversarial users leverage.",
      failureScenario: "User argues their case deserves exception.",
    });

    const result = reviseDraft(draft, [challenge]);
    expect(result.unchanged).toBe(false);
    expect(result.output).toContain("must");
    expect(result.output).not.toContain("try to");
  });

  it("does not modify unchallenged parts of the draft", () => {
    const draft = "First paragraph is solid and well-grounded.\n\nThis always works without fail.\n\nThird paragraph is also fine.";
    const challenge = makeValidated({
      category: "factual",
      claim: "This always works without fail.",
      counterargument: "Absolute claim without evidence.",
      failureScenario: "Fails in edge cases.",
    });

    const result = reviseDraft(draft, [challenge]);
    expect(result.output).toContain("First paragraph is solid and well-grounded.");
    expect(result.output).toContain("Third paragraph is also fine.");
  });
});
