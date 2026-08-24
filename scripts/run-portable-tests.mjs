import { readdir } from "node:fs/promises";
import { spawn } from "node:child_process";

const testFiles = (await readdir("tests"))
  .filter((file) => file.endsWith(".test.ts"))
  .filter((file) => file !== "postgres-integration.test.ts")
  .sort()
  .map((file) => `tests/${file}`);

const child = spawn(
  process.execPath,
  ["--import", "tsx", "--test", ...testFiles],
  { stdio: "inherit" },
);

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
