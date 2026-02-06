import { run } from "./cli.js";

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
