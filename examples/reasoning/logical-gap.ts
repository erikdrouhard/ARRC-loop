import { runARRC } from "../../src/index.js";

// Example B: Logical single-reason gap (no absolute wording required)
const result = runARRC({
  draft: "The system is secure because it uses encryption.",
  taskType: "reasoning",
  metadata: { highStakes: true },
});

console.log("=== Example B: Logical single-reason gap ===\n");
console.log(`Decision: ${result.decision}`);
console.log(`Should ship: ${result.shouldShip}`);
console.log(`Output: ${result.output ?? "(rejected)"}\n`);

for (const issue of result.issues) {
  console.log(`  [${issue.status}] ${issue.issueKey}`);
  console.log(`    Counterargument: ${issue.challenge.counterargument.slice(0, 120)}...`);
  if (issue.repairHistory.length > 0) {
    const last = issue.repairHistory[issue.repairHistory.length - 1]!;
    console.log(`    Repair strategy: ${last.strategy}`);
    if (last.applied) {
      console.log(`    Before: "${last.before}"`);
      console.log(`    After:  "${last.after}"`);
    } else {
      console.log(`    Reason not applied: ${last.reason}`);
    }
  }
  console.log();
}
