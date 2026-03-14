import { describe, expect, it } from "vitest";

import {
  classifyVulnerability,
  generateChallenges,
  relayChallenges,
  relayChallenge,
  verifyChallenges,
  reviseDraft,
  resolveARRC,
  selectArrcTier,
  runARRC,
} from "../src/index.js";
import type {
  ArrcInput,
  ChallengeCoverageV2,
  ConvergenceState,
  IssueRecord,
  RelayedChallenge,
  VerificationResult,
} from "../src/index.js";

// --- Helpers ---

function makeRelayedChallenge(overrides: Partial<RelayedChallenge> = {}): RelayedChallenge {
  return {
    issueKey: "factual:unsupported-certainty:test",
    category: "factual",
    severity: "medium",
    canonicalTarget: { text: "test text", start: 0, end: 9 },
    counterargument: "A specific counterargument for testing purposes that is long enough.",
    failureScenario: "A specific failure scenario for testing purposes that is long enough.",
    lineageToken: "factual:unsupported-certainty:test@r1",
    signal: 0.8,
    protocolWarnings: [],
    downgraded: false,
    fingerprint: "factual:unsupported-certainty:abc123",
    ...overrides,
  };
}

function makeIssue(overrides: Partial<IssueRecord> = {}): IssueRecord {
  return {
    issueKey: "test:key",
    category: "factual",
    fingerprint: "test:fingerprint",
    discoveredRound: 1,
    latestRound: 1,
    target: { text: "test", start: 0, end: 4 },
    challenge: {
      counterargument: "test counterargument",
      failureScenario: "test failure scenario",
      severity: "medium",
      signal: 0.8,
    },
    relay: {
      canonicalTargetText: "test",
      lineageToken: "test:key@r1",
      normalized: true,
      protocolWarnings: [],
    },
    verificationHistory: [{
      round: 1,
      accepted: true,
      rationale: "Accepted.",
      evidenceClass: "none",
      confidence: 0.8,
    }],
    repairHistory: [],
    status: "verified",
    ...overrides,
  };
}

function makeCoverage(overrides: Partial<ChallengeCoverageV2> = {}): ChallengeCoverageV2 {
  return {
    byDimension: [{
      dimension: "factual",
      flagged: true,
      attemptedRounds: [1],
      abstainedRounds: [],
      admissibleIssueKeys: ["test:key"],
      verifiedIssueKeys: ["test:key"],
      resolvedIssueKeys: [],
      unresolvedIssueKeys: ["test:key"],
      coverageAdequate: true,
      notes: [],
    }],
    byRound: [{
      round: 1,
      dimensionsAttempted: ["factual"],
      issueKeysChallenged: ["test:key"],
      issueKeysVerified: ["test:key"],
      issueKeysResolved: [],
      abstentions: [],
    }],
    overallAdequate: true,
    notes: [],
    ...overrides,
  };
}

function makeConvergence(overrides: Partial<ConvergenceState> = {}): ConvergenceState {
  return {
    isStable: true,
    hasPersistentIssues: false,
    hasOscillation: false,
    hasRegression: false,
    budgetExceeded: false,
    roundsCompleted: 1,
    ...overrides,
  };
}

// ==========================================
// 1. RELAY IS MATERIAL
// ==========================================

describe("relay is material", () => {
  it("relayed challenges have lineageToken and canonicalTarget that raw challenges lack", () => {
    const draft = "The API always returns JSON.";
    const { challenges } = generateChallenges(draft, { draft }, ["factual"]);
    expect(challenges.length).toBeGreaterThanOrEqual(1);

    const raw = challenges[0]!;
    expect("canonicalTarget" in raw).toBe(false);
    expect("lineageToken" in raw).toBe(false);

    const relayed = relayChallenges(challenges, { round: 1 });
    expect(relayed.length).toBeGreaterThanOrEqual(1);
    expect(relayed[0]!.canonicalTarget).toBeDefined();
    expect(relayed[0]!.lineageToken).toBeDefined();
    expect(relayed[0]!.lineageToken).toContain("@r1");
  });

  it("verifier works with relayed challenges and returns evidenceClass", () => {
    const draft = "The API always returns JSON.";
    const { challenges } = generateChallenges(draft, { draft }, ["factual"]);
    const relayed = relayChallenges(challenges, { round: 1 });

    const results = verifyChallenges(relayed, draft, { draft });
    expect(results.length).toBe(relayed.length);
    for (const r of results) {
      expect(r.evidenceClass).toBeDefined();
    }
  });

  it("relay rejects malformed challenges", () => {
    const result = relayChallenge(
      {
        issueKey: "",
        category: "factual",
        subtype: "test",
        severity: "medium",
        target: { text: "", start: 0, end: 0 },
        counterargument: "short",
        failureScenario: "short",
        signal: 0.5,
        fingerprint: "",
      },
      { round: 1 },
    );
    expect(result).toBeNull();
  });

  it("relay downgrades challenges with protocol issues", () => {
    const result = relayChallenge(
      {
        issueKey: "",
        category: "factual",
        subtype: "test",
        severity: "high",
        target: { text: "some target text here for testing", start: 0, end: 10 },
        counterargument: "A sufficiently long counterargument for the relay to accept it properly.",
        failureScenario: "A sufficiently long failure scenario for the relay to accept it properly.",
        signal: 0.9,
        fingerprint: "",
      },
      { round: 1 },
    );
    expect(result).not.toBeNull();
    expect(result!.downgraded).toBe(true);
    expect(result!.severity).toBe("medium");
    expect(result!.signal).toBeLessThan(0.9);
    expect(result!.protocolWarnings.length).toBeGreaterThan(0);
  });

  it("strict mode rejects challenges with any protocol warning", () => {
    const result = relayChallenge(
      {
        issueKey: "",
        category: "factual",
        subtype: "test",
        severity: "high",
        target: { text: "some target text here for testing", start: 0, end: 10 },
        counterargument: "A sufficiently long counterargument for the relay to accept it properly.",
        failureScenario: "A sufficiently long failure scenario for the relay to accept it properly.",
        signal: 0.9,
        fingerprint: "",
      },
      { round: 1, strict: true },
    );
    expect(result).toBeNull();
  });
});

// ==========================================
// 2. "BECAUSE" IS NOT EVIDENCE
// ==========================================

describe("because is not evidence", () => {
  it("'The API always works because it is well designed' is not grounded", () => {
    const draft = "The API always works because it is well designed.";
    const assessment = classifyVulnerability(draft, { draft });

    expect(assessment.flaggedDimensions).toContain("factual");

    const factualCandidate = assessment.candidates.find(
      (c) => c.category === "factual",
    );
    expect(factualCandidate).toBeDefined();
    expect(factualCandidate!.evidenceClass).toBe("explanatory");
  });

  it("factual verifier accepts challenge despite 'because' in context", () => {
    const draft = "The API always works because it is well designed.";
    const { challenges } = generateChallenges(draft, { draft }, ["factual"]);
    expect(challenges.length).toBeGreaterThanOrEqual(1);

    const relayed = relayChallenges(challenges, { round: 1 });
    const verifications = verifyChallenges(relayed, draft, { draft });

    const accepted = verifications.filter((v) => v.accepted);
    expect(accepted.length).toBeGreaterThanOrEqual(1);
    expect(accepted[0]!.evidenceClass).toBe("explanatory");
  });
});

// ==========================================
// 3. LOGICAL CHALLENGE WITHOUT ABSOLUTE WORDING
// ==========================================

describe("logical challenge without absolute wording", () => {
  it("'The system is secure because it uses encryption' triggers logical challenge", () => {
    const draft = "The system is secure because it uses encryption.";
    const assessment = classifyVulnerability(draft, { draft });
    expect(assessment.flaggedDimensions).toContain("logical");

    const { challenges } = generateChallenges(draft, { draft }, ["logical"]);
    expect(challenges.length).toBeGreaterThanOrEqual(1);

    const logicalChallenge = challenges.find((c) => c.category === "logical");
    expect(logicalChallenge).toBeDefined();
    expect(logicalChallenge!.subtype).toBe("single-reason-sufficiency");
  });

  it("logical verifier accepts single-reason challenge", () => {
    const draft = "The system is secure because it uses encryption.";
    const { challenges } = generateChallenges(draft, { draft }, ["logical"]);
    const relayed = relayChallenges(challenges, { round: 1 });
    const verifications = verifyChallenges(relayed, draft, { draft });

    const accepted = verifications.filter((v) => v.accepted);
    expect(accepted.length).toBeGreaterThanOrEqual(1);
  });

  it("logical repair adds qualification, not dumb synonym replacement", () => {
    const draft = "The system is secure because it uses encryption.";
    const { challenges } = generateChallenges(draft, { draft }, ["logical"]);
    const relayed = relayChallenges(challenges, { round: 1 });
    const verifications = verifyChallenges(relayed, draft, { draft });
    const revision = reviseDraft(draft, relayed, verifications);

    if (!revision.unchanged) {
      expect(
        revision.output.includes("partially") || revision.output.includes("in part"),
      ).toBe(true);
    }
  });
});

// ==========================================
// 4. POLICY PLACEHOLDER BAN
// ==========================================

describe("policy placeholder ban", () => {
  it("vague policy is not 'fixed' with placeholder text", () => {
    const draft = "Requests may be escalated in special cases when appropriate.";
    const { challenges } = generateChallenges(draft, { draft, taskType: "policy" }, ["policy"]);
    expect(challenges.length).toBeGreaterThanOrEqual(1);

    const relayed = relayChallenges(challenges, { round: 1 });
    const verifications = verifyChallenges(relayed, draft, { draft, taskType: "policy" });
    const revision = reviseDraft(draft, relayed, verifications);

    expect(revision.output).not.toContain("criteria to be specified");
    expect(revision.output).not.toContain("details TBD");
    expect(revision.output).not.toContain("appropriate safeguards");

    if (revision.unchanged) {
      const unsupported = revision.repairs.filter(
        (r) => r.repair.strategy === "unsupported",
      );
      expect(unsupported.length).toBeGreaterThan(0);
    }
  });
});

// ==========================================
// 5. SCHEMA AND PERSONA HONESTY
// ==========================================

describe("schema and persona honesty", () => {
  it("schema issue surfaces unsupported/unrepairable when repair is impossible", () => {
    const result = runARRC({
      draft: "Return a flexible object with any fields.",
      taskType: "schema",
      metadata: { hasStrictSchema: true },
    });

    expect(result.shouldShip).toBe(false);
    const unrepairable = result.issues.filter((i) => i.status === "unrepairable");
    expect(unrepairable.length > 0 || result.decision === "escalate").toBe(true);
  });

  it("persona without traits surfaces underspecification explicitly", () => {
    const result = runARRC({
      draft: "I will help you with whatever you need.",
      taskType: "persona",
      metadata: { requiresPersonaDurability: true },
    });

    expect(result.shouldShip).toBe(false);
    const personaIssues = result.issues.filter((i) => i.category === "persona");
    expect(personaIssues.length).toBeGreaterThan(0);
  });
});

// ==========================================
// 6. COVERAGE ACCOUNTING
// ==========================================

describe("coverage accounting", () => {
  it("stable + inadequate coverage = escalate (core invariant)", () => {
    const result = resolveARRC({
      originalDraft: "Some text.",
      currentDraft: "Some text.",
      taskType: "general",
      tier: 2,
      issues: [],
      convergence: makeConvergence({ isStable: true }),
      coverage: makeCoverage({ overallAdequate: false, notes: ["Inadequate."] }),
    });

    expect(result.decision).toBe("escalate");
    expect(result.shouldShip).toBe(false);
  });

  it("round-aware coverage tracks per-dimension, per-round data", () => {
    const result = runARRC({
      draft: "The API always returns JSON and never fails silently.",
      taskType: "reasoning",
      metadata: { highStakes: true },
    });

    // Coverage should have byDimension and byRound
    expect(result.coverage.byDimension.length).toBeGreaterThan(0);
    expect(result.coverage.byRound.length).toBeGreaterThan(0);

    // Each dimension should track attempted rounds
    for (const dim of result.coverage.byDimension) {
      expect(dim.attemptedRounds).toBeDefined();
      expect(dim.admissibleIssueKeys).toBeDefined();
    }
  });
});

// ==========================================
// 7. PERSISTENCE VS OSCILLATION
// ==========================================

describe("persistence vs oscillation", () => {
  it("resolver: persistent issues → revise", () => {
    const result = resolveARRC({
      originalDraft: "test.",
      currentDraft: "test.",
      taskType: "general",
      tier: 2,
      issues: [makeIssue({ status: "persistent" })],
      convergence: makeConvergence({ hasPersistentIssues: true, isStable: false }),
      coverage: makeCoverage(),
    });
    expect(result.decision).toBe("revise");
  });

  it("resolver: oscillating issues → escalate", () => {
    const result = resolveARRC({
      originalDraft: "always works.",
      currentDraft: "usually works.",
      taskType: "general",
      tier: 2,
      issues: [makeIssue({ status: "oscillating" })],
      convergence: makeConvergence({ hasOscillation: true, isStable: false }),
      coverage: makeCoverage(),
    });
    expect(result.decision).toBe("escalate");
  });
});

// ==========================================
// 8. ISSUE-SPECIFIC RE-VERIFICATION
// ==========================================

describe("issue-specific re-verification", () => {
  it("repair only counts if triggering issue is rechecked", () => {
    const draft = "The API always returns JSON and never fails silently.";
    const result = runARRC({
      draft,
      taskType: "reasoning",
      metadata: { highStakes: true },
      maxRounds: 2,
    });

    for (const issue of result.issues) {
      if (issue.repairHistory.some((r) => r.applied)) {
        expect(issue.verificationHistory.length).toBeGreaterThan(1);
        const lastVh = issue.verificationHistory[issue.verificationHistory.length - 1]!;
        expect(lastVh.rationale).toContain("Re-verification after repair");
      }
    }
  });
});

// ==========================================
// CLASSIFIER TESTS
// ==========================================

describe("classifier", () => {
  it("flags absolute language without evidence", () => {
    const result = classifyVulnerability(
      "The API always returns JSON and never fails silently.",
      { draft: "The API always returns JSON and never fails silently." },
    );
    expect(result.score).toBeGreaterThan(0.2);
    expect(result.flaggedDimensions).toContain("factual");
    expect(result.candidates.length).toBeGreaterThan(0);
  });

  it("does NOT treat 'because' as evidence", () => {
    const draft = "The system always works because reasons.";
    const result = classifyVulnerability(draft, { draft });
    expect(result.flaggedDimensions).toContain("factual");
  });

  it("flags logical without absolutes", () => {
    const draft = "The system is secure because it uses encryption.";
    const result = classifyVulnerability(draft, { draft });
    expect(result.flaggedDimensions).toContain("logical");
  });
});

// ==========================================
// TIER SELECTION
// ==========================================

describe("selectArrcTier", () => {
  it("bypasses low-risk", () => {
    expect(selectArrcTier({})).toBe(0);
  });

  it("tier 3 for strict schema", () => {
    expect(selectArrcTier({ hasStrictSchema: true })).toBe(3);
  });

  it("tier 2 for high-stakes", () => {
    expect(selectArrcTier({ highStakes: true })).toBe(2);
  });
});

// ==========================================
// FULL LOOP INTEGRATION
// ==========================================

describe("runARRC integration", () => {
  it("Example A: overconfident API claim", () => {
    const result = runARRC({
      draft: "The API always returns JSON and never fails silently.",
      taskType: "reasoning",
      metadata: { highStakes: true },
    });

    const factualIssues = result.issues.filter((i) => i.category === "factual");
    expect(factualIssues.length).toBeGreaterThanOrEqual(1);
    expect(result.tier).toBeGreaterThanOrEqual(2);
  });

  it("Example B: logical single-reason gap", () => {
    const result = runARRC({
      draft: "The system is secure because it uses encryption.",
      taskType: "reasoning",
      metadata: { highStakes: true },
    });

    const logicalIssues = result.issues.filter((i) => i.category === "logical");
    expect(logicalIssues.length).toBeGreaterThanOrEqual(1);
  });

  it("Example C: vague policy boundary", () => {
    const result = runARRC({
      draft: "Requests may be escalated in special cases when appropriate.",
      taskType: "policy",
      metadata: { highStakes: true },
    });

    const policyIssues = result.issues.filter((i) => i.category === "policy");
    expect(policyIssues.length).toBeGreaterThanOrEqual(1);

    if (result.output) {
      expect(result.output).not.toContain("criteria to be specified");
    }
  });

  it("Example D: schema missing constraints", () => {
    const result = runARRC({
      draft: "Return a flexible object with any fields that seem right.",
      taskType: "schema",
      metadata: { hasStrictSchema: true },
    });

    expect(result.shouldShip).toBe(false);
    expect(result.tier).toBe(3);
  });

  it("Example E: persona underspecification", () => {
    const result = runARRC({
      draft: "I can answer as the brand voice, but the persona constraints are not written down yet.",
      taskType: "persona",
      metadata: { requiresPersonaDurability: true },
    });

    expect(result.tier).toBe(3);
    const personaIssues = result.issues.filter((i) => i.category === "persona");
    expect(personaIssues.length).toBeGreaterThanOrEqual(1);
  });

  it("approves low-risk drafts", () => {
    const result = runARRC({ draft: "Thanks, I updated the formatting." });
    expect(result.decision).toBe("approve");
    expect(result.shouldShip).toBe(true);
  });

  it("rejects empty drafts", () => {
    const result = runARRC({ draft: "" });
    expect(result.decision).toBe("reject");
    expect(result.shouldShip).toBe(false);
  });
});

// ==========================================
// RESOLVER UNIT TESTS
// ==========================================

describe("resolver", () => {
  it("approve: no verified issues, adequate coverage", () => {
    const result = resolveARRC({
      originalDraft: "Some text.",
      currentDraft: "Some text.",
      taskType: "general",
      tier: 2,
      issues: [makeIssue({ status: "candidate" })],
      convergence: makeConvergence(),
      coverage: makeCoverage(),
    });
    expect(result.decision).toBe("approve");
    expect(result.shouldShip).toBe(true);
  });

  it("narrow: resolved issues + output changed", () => {
    const result = resolveARRC({
      originalDraft: "Original always works.",
      currentDraft: "Original usually works.",
      taskType: "general",
      tier: 2,
      issues: [makeIssue({
        status: "resolved",
        repairHistory: [{
          round: 1,
          applied: true,
          reason: "Softened.",
          strategy: "split-claim",
          before: "always",
          after: "usually",
        }],
      })],
      convergence: makeConvergence(),
      coverage: makeCoverage(),
    });
    expect(result.decision).toBe("narrow");
    expect(result.shouldShip).toBe(true);
  });

  it("escalate: oscillation", () => {
    const result = resolveARRC({
      originalDraft: "test.",
      currentDraft: "test.",
      taskType: "general",
      tier: 2,
      issues: [makeIssue({ status: "oscillating" })],
      convergence: makeConvergence({ hasOscillation: true, isStable: false }),
      coverage: makeCoverage(),
    });
    expect(result.decision).toBe("escalate");
  });

  it("revise: unrepairable issues", () => {
    const result = resolveARRC({
      originalDraft: "Policy text.",
      currentDraft: "Policy text.",
      taskType: "general",
      tier: 1,
      issues: [makeIssue({ status: "unrepairable", challenge: { counterargument: "test", failureScenario: "test", severity: "low", signal: 0.5 } })],
      convergence: makeConvergence({ isStable: false }),
      coverage: makeCoverage(),
    });
    expect(result.decision).toBe("revise");
  });
});
