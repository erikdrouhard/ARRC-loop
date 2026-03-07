import { runARRC } from "../../src/index.js";

const result = runARRC({
  draft: "I can answer as the brand voice, but the persona constraints are not written down yet.",
  taskType: "persona",
  metadata: {
    requiresPersonaDurability: true,
  },
});

console.log(JSON.stringify(result, null, 2));
