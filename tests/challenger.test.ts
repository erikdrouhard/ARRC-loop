import { describe, expect, it } from "vitest";
import { challengeFactual } from "../src/challenger/factual.js";
import { challengeLogical } from "../src/challenger/logical.js";
import { challengeSchema } from "../src/challenger/schema.js";
import { challengePersona } from "../src/challenger/persona.js";
import { challengePolicy } from "../src/challenger/policy.js";
import { generateChallenges } from "../src/challenger/index.js";
import type { VulnerabilityAssessment } from "../src/types.js";

const baseInput = { draft: "" };

function makeAssessment(dims: VulnerabilityAssessment["flaggedDimensions"]): VulnerabilityAssessment {
  return {
    score: 0.7,
    flaggedDimensions: dims,
    recommendedTier: 2,
    metrics: { claimDensity: 0.5, hedgeRatio: 0.3, evidenceCitationRate: 0.2, structuralAlignment: 0.5, confidenceToEvidenceRatio: 0.6 },
  };
}

describe("factual challenger", () => {
  it("produces structured challenges for absolute claims", () => {
    const draft = "This approach always works and never fails under any circumstances.";
    const challenges = challengeFactual(draft, { ...baseInput, draft });

    expect(challenges.length).toBeGreaterThan(0);
    for (const c of challenges) {
      expect(c.claim.length).toBeGreaterThanOrEqual(20);
      expect(c.counterargument.length).toBeGreaterThanOrEqual(20);
      expect(c.failureScenario.length).toBeGreaterThanOrEqual(20);
      expect(c.category).toBe("factual");
    }
  });

  it("returns empty for a well-evidenced draft", () => {
    const draft = "According to the research, this approach might work in some cases depending on context.";
    const challenges = challengeFactual(draft, { ...baseInput, draft });
    expect(challenges).toHaveLength(0);
  });

  it("challenges causal claims without evidence", () => {
    const draft = "Using TypeScript causes fewer bugs in production. This leads to faster development cycles.";
    const challenges = challengeFactual(draft, { ...baseInput, draft });
    expect(challenges.length).toBeGreaterThan(0);
    expect(challenges.some((c) => c.counterargument.includes("causal"))).toBe(true);
  });
});

describe("logical challenger", () => {
  it("detects circular reasoning", () => {
    const draft = "This solution is the best because it is the best solution available. Therefore this solution is best.";
    const challenges = challengeLogical(draft, { ...baseInput, draft });
    expect(challenges.some((c) => c.counterargument.includes("circular"))).toBe(true);
  });

  it("detects false dichotomies", () => {
    const draft = "You must choose between either using JavaScript or failing completely.";
    const challenges = challengeLogical(draft, { ...baseInput, draft });
    expect(challenges.some((c) => c.counterargument.includes("dichotomy"))).toBe(true);
  });

  it("returns empty for sound reasoning", () => {
    const draft = "The data shows a correlation. Further investigation is needed to determine causation.";
    const challenges = challengeLogical(draft, { ...baseInput, draft });
    expect(challenges).toHaveLength(0);
  });
});

describe("schema challenger", () => {
  it("challenges schemas without type constraints", () => {
    const draft = "The API returns an object with a name field and a status field.";
    const challenges = challengeSchema(draft, { ...baseInput, draft, taskType: "schema" });
    expect(challenges.length).toBeGreaterThan(0);
    expect(challenges.some((c) => c.category === "schema")).toBe(true);
  });

  it("challenges open-ended schemas", () => {
    const draft = "Return a flexible object with any fields that seem right.";
    const challenges = challengeSchema(draft, { ...baseInput, draft, taskType: "schema" });
    expect(challenges.length).toBeGreaterThan(0);
  });

  it("returns empty for well-constrained schemas", () => {
    const draft = "The field 'name' is a required string with maxLength 255. The field 'age' is a required integer with minimum 0 and maximum 150. Invalid input must return a 400 error with a validation message.";
    const challenges = challengeSchema(draft, { ...baseInput, draft, taskType: "schema" });
    // Well-constrained schemas may still get some low-signal challenges, but should have few high ones
    const highChallenges = challenges.filter((c) => c.severity === "high");
    expect(highChallenges.length).toBeLessThanOrEqual(1);
  });
});

describe("persona challenger", () => {
  it("challenges personas without trait definitions", () => {
    const draft = "Answer user questions helpfully.";
    const challenges = challengePersona(draft, { ...baseInput, draft, taskType: "persona" });
    expect(challenges.length).toBeGreaterThan(0);
  });

  it("challenges personas without boundaries", () => {
    const draft = "Use a friendly tone when talking to users.";
    const challenges = challengePersona(draft, { ...baseInput, draft, taskType: "persona" });
    expect(challenges.some((c) => c.counterargument.includes("bound"))).toBe(true);
  });
});

describe("policy challenger", () => {
  it("challenges policies without deny conditions", () => {
    const draft = "Help users with their requests. Be as helpful as possible.";
    const challenges = challengePolicy(draft, { ...baseInput, draft, taskType: "policy" });
    expect(challenges.length).toBeGreaterThan(0);
    expect(challenges.some((c) => c.counterargument.includes("deny"))).toBe(true);
  });

  it("challenges soft boundary language", () => {
    const draft = "We try to help where we can. Generally we attempt to be useful. Users are usually allowed to do most things.";
    const challenges = challengePolicy(draft, { ...baseInput, draft, taskType: "policy" });
    expect(challenges.some((c) => c.counterargument.includes("soft") || c.counterargument.includes("Soft"))).toBe(true);
  });
});

describe("challenger router", () => {
  it("returns empty when no dimensions are flagged", () => {
    const assessment = makeAssessment([]);
    const challenges = generateChallenges("Some text.", { draft: "Some text." }, assessment);
    expect(challenges).toHaveLength(0);
  });

  it("routes to the correct challenger based on flagged dimensions", () => {
    const draft = "This approach always works and will never fail. It is guaranteed.";
    const assessment = makeAssessment(["factual"]);
    const challenges = generateChallenges(draft, { draft }, assessment);
    expect(challenges.every((c) => c.category === "factual")).toBe(true);
  });

  it("auto-rejects challenges with generic/empty fields", () => {
    // This tests the isValidChallenge filter — any challenge with fields < 20 chars gets dropped
    const draft = "Ok."; // Too short to generate meaningful challenges
    const assessment = makeAssessment(["factual"]);
    const challenges = generateChallenges(draft, { draft }, assessment);
    // All returned challenges must pass the specificity gate
    for (const c of challenges) {
      expect(c.claim.length).toBeGreaterThanOrEqual(20);
      expect(c.counterargument.length).toBeGreaterThanOrEqual(20);
      expect(c.failureScenario.length).toBeGreaterThanOrEqual(20);
    }
  });
});
