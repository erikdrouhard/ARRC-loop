import { describe, expect, it } from "vitest";

import {
  classifyVulnerability,
  generateChallenges,
  verifyChallenges,
  reviseDraft,
  resolveARRC,
  selectArrcTier,
  runARRC,
} from "../src/index.js";
import type {
  ArrcRound,
  ChallengeCoverage,
  ConvergenceState,
  StructuredChallenge,
  VerificationResult,
} from "../src/index.js";

// --- Classifier Tests ---

describe("classifyVulnerability", () => {
  it("flags absolute language without evidence", () => {
    const result = classifyVulnerability(
      "The API always returns JSON and never fails silently.",
      { draft: "The API always returns JSON and never fails silently." },
    );

    expect(result.score).toBeGreaterThan(0.2);
    expect(result.flaggedDimensions).toContain("factual");
    expect(result.reasons.some((r) => /absolute/i.test(r))).toBe(true);
  });

  it("recommends higher tier for high-stakes metadata", () => {
    const result = classifyVulnerability("A simple note.", {
      draft: "A simple note.",
      metadata: { highStakes: true },
    });

    expect(result.recommendedTier).toBeGreaterThanOrEqual(2);
  });

  it("flags schema tasks without constraint language", () => {
    const result = classifyVulnerability(
      "Return an object with whatever fields seem right.",
      { draft: "Return an object with whatever fields seem right.", taskType: "schema" },
    );

    expect(result.flaggedDimensions).toContain("schema");
  });
});

// --- Tier Selection Tests ---

describe("selectArrcTier", () => {
  it("bypasses low-risk drafts", () => {
    expect(selectArrcTier({})).toBe(0);
  });

  it("escalates strict schema reviews to tier 3", () => {
    expect(selectArrcTier({ hasStrictSchema: true })).toBe(3);
  });

  it("returns tier 2 for high-stakes context", () => {
    expect(selectArrcTier({ highStakes: true })).toBe(2);
  });
});

// --- Factual Challenger Tests ---

describe("factual challenger", () => {
  it("produces challenge for absolute claim", () => {
    const draft = "The API always returns JSON.";
    const { challenges } = generateChallenges(draft, { draft }, ["factual"]);

    expect(challenges.length).toBeGreaterThanOrEqual(1);
    const challenge = challenges[0]!;
    expect(challenge.category).toBe("factual");
    expect(challenge.target.text).toBeTruthy();
    expect(draft.includes(challenge.target.text)).toBe(true);
    expect(challenge.counterargument.length).toBeGreaterThan(20);
    expect(challenge.failureScenario.length).toBeGreaterThan(20);
  });

  it("abstains when no factual vulnerability found", () => {
    const draft = "This is a simple note with no claims.";
    const { challenges, abstainedDimensions } = generateChallenges(
      draft,
      { draft },
      ["factual"],
    );

    expect(challenges.length).toBe(0);
    expect(abstainedDimensions).toContain("factual");
  });
});

// --- Logical Challenger Tests ---

describe("logical challenger", () => {
  it("identifies inferential gap in single-reason argument", () => {
    const draft = "The system is secure because it uses encryption.";
    const { challenges } = generateChallenges(draft, { draft }, ["logical"]);

    expect(challenges.length).toBeGreaterThanOrEqual(1);
    const challenge = challenges[0]!;
    expect(challenge.category).toBe("logical");
    expect(challenge.failureScenario.length).toBeGreaterThan(20);
  });
});

// --- Schema Verifier Tests ---

describe("schema verifier", () => {
  it("accepts challenge when adversarial input can break schema", () => {
    const draft = "Return a flexible object with any fields.";
    const { challenges } = generateChallenges(draft, { draft, taskType: "schema" }, ["schema"]);

    expect(challenges.length).toBeGreaterThanOrEqual(1);

    const verifications = verifyChallenges(challenges, draft, { draft, taskType: "schema" });
    const accepted = verifications.filter((v) => v.accepted);

    expect(accepted.length).toBeGreaterThanOrEqual(1);
    expect(accepted[0]!.evidence).toBeTruthy();
  });
});

// --- Policy Verifier Tests ---

describe("policy verifier", () => {
  it("accepts challenge for missing allow/deny/escalate boundary", () => {
    const draft = "Refunds may be granted in special cases.";
    const { challenges } = generateChallenges(draft, { draft, taskType: "policy" }, ["policy"]);

    expect(challenges.length).toBeGreaterThanOrEqual(1);

    const verifications = verifyChallenges(challenges, draft, { draft, taskType: "policy" });
    const accepted = verifications.filter((v) => v.accepted);

    expect(accepted.length).toBeGreaterThanOrEqual(1);
    expect(accepted[0]!.rationale.length).toBeGreaterThan(0);
  });
});

// --- Reviser Tests ---

describe("reviser", () => {
  it("only revises the targeted span, preserving the rest byte-identical", () => {
    const draft =
      "The API always returns JSON. Response times average 200ms under normal load.";

    const { challenges } = generateChallenges(draft, { draft }, ["factual"]);
    expect(challenges.length).toBeGreaterThanOrEqual(1);

    // Create a mock verification that accepts
    const verifications: VerificationResult[] = challenges.map(() => ({
      accepted: true,
      confidence: 0.8,
      rationale: "Accepted for test.",
    }));

    const revision = reviseDraft(draft, challenges, verifications);

    // Second sentence should be preserved
    expect(revision.output).toContain(
      "Response times average 200ms under normal load.",
    );

    // First sentence should be changed (absolute "always" → "usually")
    if (!revision.unchanged) {
      expect(revision.output).toContain("usually");
      expect(revision.changes.length).toBeGreaterThanOrEqual(1);
    }
  });
});

// --- Resolver Tests ---

describe("resolver", () => {
  // Helper to build a minimal round
  function makeRound(
    challenges: StructuredChallenge[],
    verifications: VerificationResult[],
    revision?: ArrcRound["revision"],
  ): ArrcRound {
    const round: ArrcRound = { round: 1, challenges, verifications };
    if (revision) {
      round.revision = revision;
    }
    return round;
  }

  function makeChallenge(overrides: Partial<StructuredChallenge> = {}): StructuredChallenge {
    return {
      id: "test:0-10",
      issueKey: "test:key:0",
      category: "factual",
      severity: "medium",
      target: { text: "test text", start: 0, end: 9 },
      counterargument: "A specific counterargument for testing purposes.",
      failureScenario: "A specific failure scenario for testing purposes.",
      signal: 0.8,
      ...overrides,
    };
  }

  it("Scenario A: approve when no verified challenges and adequate coverage", () => {
    const result = resolveARRC({
      originalDraft: "Some text.",
      currentDraft: "Some text.",
      taskType: "general",
      tier: 2,
      rounds: [
        makeRound(
          [makeChallenge()],
          [{ accepted: false, confidence: 0.7, rationale: "Rejected." }],
        ),
      ],
      convergence: { isStable: true, isOscillating: false, budgetExceeded: false, roundsCompleted: 1 },
      coverage: {
        dimensionsAttempted: ["factual"],
        dimensionsAbstained: [],
        admissibleChallengesProduced: 1,
        verifiedChallengesProduced: 0,
        coverageAdequate: true,
        coverageNotes: [],
      },
    });

    expect(result.decision).toBe("approve");
    expect(result.shouldShip).toBe(true);
  });

  it("Scenario B: narrow when verified challenge was addressed by scoped revision", () => {
    const challenge = makeChallenge();
    const result = resolveARRC({
      originalDraft: "Original text always works.",
      currentDraft: "Original text usually works.",
      taskType: "general",
      tier: 2,
      rounds: [
        makeRound(
          [challenge],
          [{ accepted: true, confidence: 0.8, rationale: "Accepted." }],
          {
            output: "Original text usually works.",
            changes: [{
              issueKey: challenge.issueKey,
              originalSpan: challenge.target,
              revisedSpan: { text: "usually", start: 0, end: 7 },
              reason: "Softened.",
            }],
            unchanged: false,
            unresolvable: [],
          },
        ),
      ],
      convergence: { isStable: true, isOscillating: false, budgetExceeded: false, roundsCompleted: 1 },
      coverage: {
        dimensionsAttempted: ["factual"],
        dimensionsAbstained: [],
        admissibleChallengesProduced: 1,
        verifiedChallengesProduced: 1,
        coverageAdequate: true,
        coverageNotes: [],
      },
    });

    expect(result.decision).toBe("narrow");
    expect(result.shouldShip).toBe(true);
  });

  it("Scenario C: escalate when same issueKey reappears after revision (oscillation)", () => {
    const challenge = makeChallenge({ issueKey: "factual:always:0" });

    const result = resolveARRC({
      originalDraft: "Always works.",
      currentDraft: "Usually works.",
      taskType: "general",
      tier: 2,
      rounds: [
        makeRound(
          [challenge],
          [{ accepted: true, confidence: 0.8, rationale: "Accepted." }],
          {
            output: "Usually works.",
            changes: [{
              issueKey: challenge.issueKey,
              originalSpan: challenge.target,
              revisedSpan: { text: "Usually", start: 0, end: 7 },
              reason: "Softened.",
            }],
            unchanged: false,
            unresolvable: [],
          },
        ),
        makeRound(
          [{ ...challenge, id: "test:0-10-r2" }],
          [{ accepted: true, confidence: 0.75, rationale: "Reappeared." }],
        ),
      ],
      convergence: { isStable: false, isOscillating: true, budgetExceeded: false, roundsCompleted: 2 },
      coverage: {
        dimensionsAttempted: ["factual"],
        dimensionsAbstained: [],
        admissibleChallengesProduced: 2,
        verifiedChallengesProduced: 2,
        coverageAdequate: true,
        coverageNotes: [],
      },
    });

    expect(result.decision).toBe("escalate");
    expect(result.shouldShip).toBe(false);
  });

  it("Scenario D — Core ARRC invariant: stable + weak coverage = escalate", () => {
    const result = resolveARRC({
      originalDraft: "Some stable text.",
      currentDraft: "Some stable text.",
      taskType: "general",
      tier: 2,
      rounds: [
        makeRound(
          [],
          [],
        ),
      ],
      convergence: { isStable: true, isOscillating: false, budgetExceeded: false, roundsCompleted: 1 },
      coverage: {
        dimensionsAttempted: ["factual"],
        dimensionsAbstained: ["logical", "schema"],
        admissibleChallengesProduced: 0,
        verifiedChallengesProduced: 0,
        coverageAdequate: false,
        coverageNotes: [
          "Abstained on dimensions: logical, schema.",
          "Coverage is inadequate. Stability under weak coverage is not convergence.",
        ],
      },
    });

    expect(result.decision).toBe("escalate");
    expect(result.shouldShip).toBe(false);
    expect(
      result.reasons.some((r) =>
        r.includes("Stability without adequate challenge coverage is not convergence"),
      ),
    ).toBe(true);
  });
});

// --- Full Loop Integration Tests ---

describe("runARRC", () => {
  it("approves when ARRC does not trigger", () => {
    const result = runARRC({
      draft: "Thanks, I updated the formatting.",
    });

    expect(result.decision).toBe("approve");
    expect(result.shouldShip).toBe(true);
    expect(result.rounds).toHaveLength(0);
  });

  it("processes overconfident draft through the loop", () => {
    const result = runARRC({
      draft: "The API always returns JSON and never fails silently.",
      taskType: "reasoning",
      metadata: { highStakes: true },
    });

    expect(result.rounds.length).toBeGreaterThanOrEqual(1);
    expect(result.tier).toBeGreaterThanOrEqual(2);
    // Should have processed challenges
    expect(result.coverage.admissibleChallengesProduced).toBeGreaterThanOrEqual(1);
  });

  it("narrows the README quick-start draft once the scoped revision holds", () => {
    const result = runARRC({
      draft: "The API always returns JSON and never fails silently.",
      taskType: "reasoning",
      maxRounds: 2,
      metadata: { highStakes: true },
    });

    expect(result.decision).toBe("narrow");
    expect(result.shouldShip).toBe(true);
    expect(result.output).toBe("The API usually returns JSON and rarely fails silently.");
    expect(result.coverage.coverageAdequate).toBe(true);
    expect(result.coverage.dimensionsAbstained).toEqual([]);
    expect(result.coverage.dimensionsAttempted).toContain("factual");
  });

  it("does not count a cleared re-challenge as abstention", () => {
    const result = runARRC({
      draft: "Deploys always succeed. The changelog is in docs/CHANGES.md.",
      metadata: { highStakes: true },
    });

    expect(result.rounds).toHaveLength(2);
    expect(result.rounds[1]?.challenges).toHaveLength(0);
    expect(result.coverage.dimensionsAbstained).toEqual([]);
    expect(result.coverage.coverageNotes.some((n) => n.includes("Scoped revisions held"))).toBe(true);
    expect(result.decision).toBe("narrow");
    expect(result.output).toBe("Deploys usually succeed. The changelog is in docs/CHANGES.md.");
  });

  it("still escalates when a flagged dimension abstains in the first sweep", () => {
    const result = runARRC({
      draft: 'Schema: field "email" is required, type string, format email. Invalid input returns error 400.',
      taskType: "schema",
      metadata: { hasStrictSchema: true },
    });

    expect(result.coverage.dimensionsAbstained).toContain("schema");
    expect(result.decision).toBe("escalate");
    expect(result.shouldShip).toBe(false);
  });

  it("escalates brittle schema drafts at tier 3", () => {
    const result = runARRC({
      draft: "Return a flexible object with any fields that seem right.",
      taskType: "schema",
      metadata: { hasStrictSchema: true },
    });

    expect(result.decision).toBe("escalate");
    expect(result.shouldShip).toBe(false);
    expect(result.tier).toBe(3);
  });

  it("rejects empty drafts", () => {
    const result = runARRC({ draft: "" });

    expect(result.decision).toBe("reject");
    expect(result.shouldShip).toBe(false);
  });

  it("handles policy drafts with vague boundaries", () => {
    const result = runARRC({
      draft: "Refunds may be granted in special cases.",
      taskType: "policy",
      metadata: { highStakes: true },
    });

    expect(result.rounds.length).toBeGreaterThanOrEqual(1);
    expect(result.coverage.dimensionsAttempted).toContain("policy");
  });

  it("handles persona drafts needing durability", () => {
    const result = runARRC({
      draft: "I can answer as the brand voice, but the persona constraints are not written down yet.",
      taskType: "persona",
      metadata: { requiresPersonaDurability: true },
    });

    expect(result.rounds.length).toBeGreaterThanOrEqual(1);
    expect(result.tier).toBe(3);
  });
});
