import { runARCJudge } from "../../src/index.js";

const result = await runARCJudge({
  draft: "Return an object for the form submission with whatever fields seem useful.",
  taskType: "schema",
  metadata: {
    hasStrictSchema: true,
  },
});

console.log(result);
