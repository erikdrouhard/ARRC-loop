import { runARRC } from "../../src/index.js";

const result = runARRC({
  draft: "We should help where we can.",
  taskType: "policy",
  metadata: {
    highStakes: true,
    userRequestedVerification: true,
  },
});

console.log(JSON.stringify(result, null, 2));
