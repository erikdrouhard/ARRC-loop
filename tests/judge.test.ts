import { describe, expect, it } from "vitest";
import { judgeARC } from "../src/judge/index.js";
import type { ArcRound, ConvergenceState, ValidatedChallenge, VulnerabilityAssessment } from "../src/types.js";

const defaultAssessment: VulnerabilityAssessment = {
  score: 0.5,
  flaggedDimensions: ["factual"],
  recommendedTier: 2,
  metrics: { claimDensity: 0.5, hedgeRatio: 0.3, evidenceCitationRate: 0.2, structuralAlignment: 0.5, confidenceToEvidenceRatio: 0.6 },
};

const stableConvergence: ConvergenceState = {
  isStable: true,
  isOscillating: false,
  budgetExceeded: false,
  roundsCompleted: 1,
};

function makeValidated(overrides: Partial<ValidatedChallenge> = {}): ValidatedChallenge {
  return {
    id: "test:0",
    category: "factual",
    severity: "medium",
    claim: "test claim",
    counterargument: "test counter",
    failureScenario: "test scenario",
    signal: 0.7,
    verification: { accepted: true, confidence: 0.75, rationale: "test" },
    ...overrides,
  };
}

function makeRound(overrides: Partial<ArcRound> = {}): ArcRound {
  return {
    round: 1,
    draft: "test draft",
    challenges: [],
    accepted: [],
    rejected: [],
    revision: { output: "test draft", changes: [], unchanged: true },
    ...overrides,
  };
}

describe("judgeARC", () => {
  it("approves when no challenges survived", () => {
    const result = judgeARC({
      originalDraft: "Good draft.",
      currentDraft: "Good draft.",
      taskType: "general",
      tier: 2,
      rounds: [makeRound()],
      convergence: stableConvergence,
      vulnerabilityAssessment: defaultAssessment,
    });

    expect(result.decision).toBe("approve");
    expect(result.shouldShip).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it("narrows when draft converged after revision", () => {
    const accepted = [makeValidated()];
    const result = judgeARC({
      originalDraft: "Original.",
      currentDraft: "Revised.",
      taskType: "general",
      tier: 2,
      rounds: [
        makeRound({
          accepted,
          revision: {
            output: "Revised.",
            changes: [{ originalSpan: "Original.", revisedSpan: "Revised.", reason: "test" }],
            unchanged: false,
          },
        }),
        makeRound({ round: 2 }), // No new challenges
      ],
      convergence: { ...stableConvergence, roundsCompleted: 2 },
      vulnerabilityAssessment: defaultAssessment,
    });

    expect(result.decision).toBe("approve");
    expect(result.shouldShip).toBe(true);
  });

  it("escalates when oscillating", () => {
    const result = judgeARC({
      originalDraft: "Draft.",
      currentDraft: "Draft.",
      taskType: "general",
      tier: 2,
      rounds: [makeRound({ accepted: [makeValidated()] })],
      convergence: { isStable: false, isOscillating: true, budgetExceeded: false, roundsCompleted: 2 },
      vulnerabilityAssessment: defaultAssessment,
    });

    expect(result.decision).toBe("escalate");
    expect(result.shouldShip).toBe(false);
  });

  it("escalates high-severity challenges on schema/policy/tier-3 tasks", () => {
    const highChallenge = makeValidated({ severity: "high" });
    const result = judgeARC({
      originalDraft: "Draft.",
      currentDraft: "Draft.",
      taskType: "schema",
      tier: 3,
      rounds: [makeRound({ accepted: [highChallenge] })],
      convergence: stableConvergence,
      vulnerabilityAssessment: defaultAssessment,
    });

    expect(result.decision).toBe("escalate");
    expect(result.shouldShip).toBe(false);
  });

  it("rejects when multiple high-severity challenges are unaddressed", () => {
    const result = judgeARC({
      originalDraft: "Draft.",
      currentDraft: "Draft.",
      taskType: "general",
      tier: 2,
      rounds: [makeRound({
        accepted: [
          makeValidated({ id: "a", severity: "high" }),
          makeValidated({ id: "b", severity: "high" }),
        ],
      })],
      convergence: { isStable: false, isOscillating: false, budgetExceeded: false, roundsCompleted: 1 },
      vulnerabilityAssessment: defaultAssessment,
    });

    expect(result.decision).toBe("reject");
    expect(result.shouldShip).toBe(false);
    expect(result.output).toBeUndefined();
  });

  it("escalates when budget exceeded without convergence", () => {
    const result = judgeARC({
      originalDraft: "Draft.",
      currentDraft: "Revised.",
      taskType: "general",
      tier: 2,
      rounds: [makeRound({ accepted: [makeValidated()] })],
      convergence: { isStable: false, isOscillating: false, budgetExceeded: true, roundsCompleted: 3 },
      vulnerabilityAssessment: defaultAssessment,
    });

    expect(result.decision).toBe("escalate");
  });

  it("includes convergence and vulnerability assessment in output", () => {
    const result = judgeARC({
      originalDraft: "Draft.",
      currentDraft: "Draft.",
      taskType: "general",
      tier: 2,
      rounds: [makeRound()],
      convergence: stableConvergence,
      vulnerabilityAssessment: defaultAssessment,
    });

    expect(result.convergence).toBeDefined();
    expect(result.vulnerabilityAssessment).toBeDefined();
    expect(result.convergence.isStable).toBe(true);
  });
});
