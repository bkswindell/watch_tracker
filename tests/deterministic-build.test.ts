import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

test("deterministic build verification rejects empty successful builds", async (t) => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "watch-tracker-empty-build-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  const emptyBuilder = path.join(directory, "empty-builder.mjs");
  await writeFile(
    emptyBuilder,
    "import { mkdirSync } from 'node:fs'; mkdirSync('dist', { recursive: true });\n",
  );

  const verifier = path.resolve("scripts/verify-deterministic-build.mjs");
  const result = spawnSync(process.execPath, [verifier], {
    cwd: directory,
    encoding: "utf8",
    env: { ...process.env, npm_execpath: emptyBuilder },
  });

  assert.notEqual(result.status, 0);
  assert.match(
    `${result.stdout}\n${result.stderr}`,
    /required build artifact|empty build/i,
  );
});
