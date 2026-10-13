// Runs one case through the installed package exactly as a consumer would,
// checks the README result contract plus the case's expectations, and writes evidence.
//
//   node drive.mjs <case.json> <evidence-dir>     (invoked by `arrc-verify drive`)
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runARRC } from "arrc-loop";

const [casePath, evidenceRoot] = process.argv.slice(2);
const spec = JSON.parse(readFileSync(casePath, "utf8"));
const { feature, name, input, expect = {} } = spec;

const result = runARRC(input);
const failures = [];
const fail = (msg) => failures.push(msg);

// --- Result contract (README "Termination States" / "Result Contract") ---
const SHIPPABLE = ["approve", "narrow"];
if (result.shouldShip !== SHIPPABLE.includes(result.decision)) {
  fail(`contract: shouldShip=${result.shouldShip} but decision=${result.decision}`);
}
if (result.decision === "reject" && result.output !== undefined) fail("contract: reject must not carry output");
if (result.decision !== "reject" && typeof result.output !== "string") fail("contract: non-reject must carry output");
if (result.shouldShip && result.rounds.length > 0 && !result.coverage.coverageAdequate) {
  fail("core invariant: shipped after a loop without adequate coverage");
}
if (result.convergence.roundsCompleted !== result.rounds.length) {
  fail(`contract: roundsCompleted=${result.convergence.roundsCompleted} but rounds.length=${result.rounds.length}`);
}
for (const round of result.rounds) {
  if (round.challenges.length !== round.verifications.length) fail(`round ${round.round}: challenges/verifications length mismatch`);
  for (const change of round.revision?.changes ?? []) {
    const at = round.revision.output.slice(change.revisedSpan.start, change.revisedSpan.end);
    if (at !== change.revisedSpan.text) fail(`round ${round.round}: revisedSpan for ${change.issueKey} does not match output`);
  }
}
// A dimension reported as abstained must never have produced an admissible challenge.
const challenged = new Set(result.rounds.flatMap((r) => r.challenges.map((c) => c.category)));
for (const dim of result.coverage.dimensionsAbstained) {
  if (challenged.has(dim)) fail(`coverage: "${dim}" reported abstained but produced challenges`);
}

// --- Case expectations ---
const eq = (key, actual) => {
  if (key in expect && JSON.stringify(actual) !== JSON.stringify(expect[key])) {
    fail(`expect ${key}=${JSON.stringify(expect[key])}, got ${JSON.stringify(actual)}`);
  }
};
eq("decision", result.decision);
eq("shouldShip", result.shouldShip);
eq("tier", result.tier);
eq("output", result.output);
eq("rounds", result.rounds.length);
eq("coverageAdequate", result.coverage.coverageAdequate);
for (const dim of expect.dimensionsAttemptedInclude ?? []) {
  if (!result.coverage.dimensionsAttempted.includes(dim)) fail(`expect dimensionsAttempted to include ${dim}`);
}
for (const s of expect.reasonsInclude ?? []) {
  if (!result.reasons.some((r) => r.includes(s))) fail(`expect a reason containing ${JSON.stringify(s)}`);
}
for (const s of expect.reasonsExclude ?? []) {
  if (result.reasons.some((r) => r.includes(s))) fail(`expect no reason containing ${JSON.stringify(s)}`);
}

// --- Evidence ---
const dir = join(evidenceRoot, feature);
mkdirSync(dir, { recursive: true });
const verdict = failures.length === 0 ? "PASS" : "FAIL";
writeFileSync(join(dir, `${name}.input.json`), JSON.stringify(input, null, 2) + "\n");
writeFileSync(join(dir, `${name}.result.json`), JSON.stringify(result, null, 2) + "\n");
const summary = {
  verdict,
  feature,
  case: name,
  decision: result.decision,
  shouldShip: result.shouldShip,
  tier: result.tier,
  rounds: result.rounds.length,
  coverageAdequate: result.coverage.coverageAdequate,
  output: result.output,
  reasons: result.reasons,
  failures,
};
writeFileSync(join(dir, `${name}.verdict.json`), JSON.stringify(summary, null, 2) + "\n");
console.log(`${verdict} ${feature}/${name} decision=${result.decision} ship=${result.shouldShip} -> ${dir}/${name}.*.json`);
for (const f of failures) console.log(`  - ${f}`);
process.exit(failures.length === 0 ? 0 : 1);
