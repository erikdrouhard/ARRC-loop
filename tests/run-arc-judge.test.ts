import { describe, expect, it } from "vitest";

import { runARCJudge, selectARCTier } from "../src/index.js";

describe("selectARCTier", () => {
  it("bypasses low-risk drafts", () => {
    expect(selectARCTier({})).toBe(0);
  });

  it("escalates strict schema reviews to tier 3", () => {
    expect(selectARCTier({ hasStrictSchema: true })).toBe(3);
  });

  it("escalates user-requested verification to tier 3", () => {
    expect(selectARCTier({ userRequestedVerification: true })).toBe(3);
  });

  it("assigns tier 2 for high-stakes context", () => {
    expect(selectARCTier({ highStakes: true })).toBe(2);
  });
});

describe("runARCJudge", () => {
  it("rejects empty drafts", () => {
    const result = runARCJudge({ draft: "" });
    expect(result.decision).toBe("reject");
    expect(result.shouldShip).toBe(false);
  });

  it("approves when classifier says draft is not vulnerable", () => {
    const result = runARCJudge({
      draft: "Thanks, I updated the formatting.",
    });

    expect(result.decision).toBe("approve");
    expect(result.shouldShip).toBe(true);
    expect(result.rounds).toHaveLength(0);
    expect(result.vulnerabilityAssessment).toBeDefined();
  });

  it("runs ARC loop on overconfident reasoning drafts", () => {
    const result = runARCJudge({
      draft: "This approach will always work and never fail because it is guaranteed to be correct. All edge cases are impossible.",
      taskType: "reasoning",
      metadata: { highStakes: true },
    });

    // Should detect vulnerability and run the loop
    expect(result.rounds.length).toBeGreaterThan(0);
    expect(result.vulnerabilityAssessment.score).toBeGreaterThan(0.3);
  });

  it("escalates brittle schema drafts at tier 3", () => {
    const result = runARCJudge({
      draft: "Return a flexible object with any fields that seem right.",
      taskType: "schema",
      metadata: { hasStrictSchema: true },
    });

    expect(result.tier).toBe(3);
    expect(result.shouldShip).toBe(false);
  });

  it("handles policy drafts with soft boundaries", () => {
    const result = runARCJudge({
      draft: "We try to help where we can. Generally we attempt to be useful and ideally answer all questions.",
      taskType: "policy",
      metadata: { highStakes: true, userRequestedVerification: true },
    });

    expect(result.tier).toBe(3);
    expect(result.rounds.length).toBeGreaterThan(0);
  });

  it("handles persona drafts without trait definitions", () => {
    const result = runARCJudge({
      draft: "Brand voice but no constraints written. Just be helpful.",
      taskType: "persona",
      metadata: { requiresPersonaDurability: true },
    });

    expect(result.tier).toBe(3);
    expect(result.vulnerabilityAssessment.flaggedDimensions).toContain("persona");
  });

  it("includes convergence state in judgment", () => {
    const result = runARCJudge({
      draft: "Some simple output that might need review.",
      metadata: { highStakes: true },
    });

    expect(result.convergence).toBeDefined();
    expect(typeof result.convergence.isStable).toBe("boolean");
    expect(typeof result.convergence.isOscillating).toBe("boolean");
    expect(typeof result.convergence.roundsCompleted).toBe("number");
  });

  it("is synchronous (no async needed)", () => {
    const result = runARCJudge({ draft: "Test." });
    expect(result).toBeDefined();
    expect(result.decision).toBeDefined();
  });
});
