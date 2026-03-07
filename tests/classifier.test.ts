import { describe, expect, it } from "vitest";
import { classifyVulnerability } from "../src/classifier/index.js";

describe("classifyVulnerability", () => {
  it("scores a well-hedged, evidence-rich draft as low vulnerability", () => {
    const draft =
      "According to the 2024 survey data, approximately 60% of users prefer option A. " +
      "This suggests that option A may be the better choice in most cases, " +
      "though further testing could reveal exceptions.";

    const result = classifyVulnerability(draft, { draft });
    expect(result.score).toBeLessThan(0.4);
    expect(result.flaggedDimensions).toHaveLength(0);
  });

  it("scores an absolute, ungrounded draft as high vulnerability", () => {
    const draft =
      "This approach always works and will never fail. " +
      "It is guaranteed to produce perfect results every time. " +
      "All users must use this method because it is impossible to do better.";

    const result = classifyVulnerability(draft, { draft });
    expect(result.score).toBeGreaterThan(0.5);
    expect(result.flaggedDimensions).toContain("factual");
  });

  it("flags schema dimension for schema tasks with incomplete structure", () => {
    const draft = "Return a flexible object with any fields that seem right.";

    const result = classifyVulnerability(draft, {
      draft,
      taskType: "schema",
      metadata: { hasStrictSchema: true },
    });
    expect(result.flaggedDimensions).toContain("schema");
    expect(result.recommendedTier).toBe(3);
  });

  it("flags persona dimension for persona tasks without trait definitions", () => {
    const draft = "Be helpful and nice to users. Answer their questions.";

    const result = classifyVulnerability(draft, {
      draft,
      taskType: "persona",
      metadata: { requiresPersonaDurability: true },
    });
    expect(result.flaggedDimensions).toContain("persona");
    expect(result.recommendedTier).toBe(3);
  });

  it("flags policy dimension for policy tasks without boundaries", () => {
    const draft = "Help users where we can. Try to be useful.";

    const result = classifyVulnerability(draft, {
      draft,
      taskType: "policy",
    });
    expect(result.flaggedDimensions).toContain("policy");
  });

  it("returns all five metric fields", () => {
    const result = classifyVulnerability("Some draft text.", { draft: "Some draft text." });
    expect(result.metrics).toHaveProperty("claimDensity");
    expect(result.metrics).toHaveProperty("hedgeRatio");
    expect(result.metrics).toHaveProperty("evidenceCitationRate");
    expect(result.metrics).toHaveProperty("structuralAlignment");
    expect(result.metrics).toHaveProperty("confidenceToEvidenceRatio");
  });

  it("recommends tier 2+ for high-stakes metadata", () => {
    const draft = "Some output.";
    const result = classifyVulnerability(draft, {
      draft,
      metadata: { highStakes: true },
    });
    expect(result.recommendedTier).toBeGreaterThanOrEqual(2);
  });
});
