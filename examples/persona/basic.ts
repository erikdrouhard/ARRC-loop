import { runARRC } from "../../src/index.js";

// Example E: Persona underspecification
const result = runARRC({
  draft: "I can answer as the brand voice, but the persona constraints are not written down yet.",
  taskType: "persona",
  metadata: { requiresPersonaDurability: true },
});

console.log("=== Example E: Persona underspecification ===\n");
console.log(`Decision: ${result.decision}`);
console.log(`Should ship: ${result.shouldShip}`);
console.log(`Tier: ${result.tier}\n`);

for (const issue of result.issues) {
  console.log(`  [${issue.status}] ${issue.issueKey}`);
  console.log(`    Category: ${issue.category}`);
  if (issue.repairHistory.length > 0) {
    const last = issue.repairHistory[issue.repairHistory.length - 1]!;
    console.log(`    Repair: ${last.strategy} (applied: ${last.applied})`);
    if (!last.applied) {
      console.log(`    Reason: ${last.reason}`);
    }
  }
  console.log();
}
