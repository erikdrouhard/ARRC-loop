import { runARRC } from "../../src/index.js";

const result = runARRC({
  draft: "Return an object for the form submission with whatever fields seem useful.",
  taskType: "schema",
  metadata: {
    hasStrictSchema: true,
  },
});

console.log(JSON.stringify(result, null, 2));
