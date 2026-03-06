import { runARCJudge } from "../../src/index.js";

const result = await runARCJudge({
  draft: "I can answer as the brand voice, but the persona constraints are not written down yet.",
  taskType: "persona",
  metadata: {
    requiresPersonaDurability: true,
  },
});

console.log(result);
