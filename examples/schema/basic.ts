import { runARRC } from "../../src/index.js";

// Example D: Schema missing constraints
const result = runARRC({
  draft: "Return a flexible object with any fields that seem right.",
  taskType: "schema",
  metadata: { hasStrictSchema: true },
});

console.log("=== Example D: Schema missing constraints ===\n");
console.log(`Decision: ${result.decision}`);
console.log(`Should ship: ${result.shouldShip}`);
console.log(`Tier: ${result.tier}\n`);

for (const issue of result.issues) {
  console.log(`  [${issue.status}] ${issue.issueKey}`);
  console.log(`    Severity: ${issue.challenge.severity}`);
  if (issue.repairHistory.length > 0) {
    const last = issue.repairHistory[issue.repairHistory.length - 1]!;
    console.log(`    Repair: ${last.strategy} (applied: ${last.applied})`);
    if (!last.applied) {
      console.log(`    Reason: ${last.reason}`);
    }
  }
  console.log();
}
