import { runARRC } from "../../src/index.js";

const result = runARRC({
  draft: "This plan will always work because the architecture is simple.",
  taskType: "reasoning",
  metadata: {
    highStakes: true,
  },
});

console.log(JSON.stringify(result, null, 2));
