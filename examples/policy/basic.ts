import { runARRC } from "../../src/index.js";

// Example C: Vague policy boundary
const result = runARRC({
  draft: "Requests may be escalated in special cases when appropriate.",
  taskType: "policy",
  metadata: { highStakes: true },
});

console.log("=== Example C: Vague policy boundary ===\n");
console.log(`Decision: ${result.decision}`);
console.log(`Should ship: ${result.shouldShip}`);
console.log(`Output: ${result.output ?? "(rejected)"}\n`);

for (const issue of result.issues) {
  console.log(`  [${issue.status}] ${issue.issueKey}`);
  if (issue.repairHistory.length > 0) {
    const last = issue.repairHistory[issue.repairHistory.length - 1]!;
    console.log(`    Repair: ${last.strategy} (applied: ${last.applied})`);
    if (!last.applied) {
      console.log(`    Reason: ${last.reason}`);
    }
  }
  console.log();
}
