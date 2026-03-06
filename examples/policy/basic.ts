import { runARCJudge } from "../../src/index.js";

const result = await runARCJudge({
  draft: "We should help where we can.",
  taskType: "policy",
  metadata: {
    highStakes: true,
    userRequestedVerification: true,
  },
});

console.log(result);
