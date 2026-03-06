import { describe, expect, it } from "vitest";

import { runARCJudge, selectARCTier } from "../src/index.js";

describe("selectARCTier", () => {
  it("bypasses low-risk drafts", () => {
    expect(selectARCTier({})).toBe(0);
  });

  it("escalates strict schema reviews to tier 3", () => {
    expect(selectARCTier({ hasStrictSchema: true })).toBe(3);
  });
});

describe("runARCJudge", () => {
  it("approves when ARC does not trigger", async () => {
    const result = await runARCJudge({
      draft: "Thanks, I updated the formatting.",
    });

    expect(result.decision).toBe("approve");
    expect(result.shouldShip).toBe(true);
    expect(result.rounds).toHaveLength(0);
  });

  it("narrows overconfident reasoning drafts", async () => {
    const result = await runARCJudge({
      draft: "This approach will always work.",
      taskType: "reasoning",
      metadata: {
        highStakes: true,
      },
    });

    expect(result.decision).toBe("narrow");
    expect(result.output).toContain("usually work");
    expect(result.acceptedRebuttals).toContain("Absolute claim may not survive rebuttal");
  });

  it("escalates brittle schema drafts at tier 3", async () => {
    const result = await runARCJudge({
      draft: "Return a flexible object with any fields that seem right.",
      taskType: "schema",
      metadata: {
        hasStrictSchema: true,
      },
    });

    expect(result.decision).toBe("escalate");
    expect(result.shouldShip).toBe(false);
    expect(result.acceptedRebuttals).toContain("Schema lacks hard constraints");
  });
});
