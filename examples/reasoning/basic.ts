import { runARRC } from "../../src/index.js";

// Example A: Overconfident API claim
const result = runARRC({
  draft: "The API always returns JSON and never fails silently.",
  taskType: "reasoning",
  metadata: { highStakes: true },
});

console.log("=== Example A: Overconfident API claim ===\n");
console.log(`Decision: ${result.decision}`);
console.log(`Should ship: ${result.shouldShip}`);
console.log(`Tier: ${result.tier}`);
console.log(`Issues: ${result.issues.length}`);
console.log(`Output: ${result.output ?? "(rejected)"}\n`);

for (const issue of result.issues) {
  console.log(`  [${issue.status}] ${issue.issueKey}`);
  console.log(`    Category: ${issue.category}`);
  console.log(`    Severity: ${issue.challenge.severity}`);
  console.log(`    Relay lineage: ${issue.relay.lineageToken}`);
  if (issue.repairHistory.length > 0) {
    const last = issue.repairHistory[issue.repairHistory.length - 1]!;
    console.log(`    Repair: ${last.strategy} (applied: ${last.applied})`);
    if (last.applied) {
      console.log(`      Before: "${last.before}"`);
      console.log(`      After:  "${last.after}"`);
    }
  }
  console.log();
}

console.log("Coverage:");
for (const dim of result.coverage.byDimension) {
  console.log(`  ${dim.dimension}: adequate=${dim.coverageAdequate}, attempted rounds=${dim.attemptedRounds}`);
}
