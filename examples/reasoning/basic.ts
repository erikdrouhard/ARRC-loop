import { runARCJudge } from "../../src/index.js";

const result = await runARCJudge({
  draft: "This plan will always work because the architecture is simple.",
  taskType: "reasoning",
  metadata: {
    highStakes: true,
  },
});

console.log(result);
