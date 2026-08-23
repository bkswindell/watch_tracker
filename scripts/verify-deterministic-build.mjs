import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outputDirectory = path.join(root, "dist");

function build() {
  const result = spawnSync(
    process.execPath,
    [process.env.npm_execpath, "run", "build"],
    {
      cwd: root,
      encoding: "utf8",
      env: process.env,
    },
  );
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(entryPath)));
    else if (entry.isFile()) files.push(entryPath);
    else throw new Error(`Unexpected build artifact type: ${entryPath}`);
  }
  return files;
}

async function manifest() {
  const files = await filesUnder(outputDirectory);
  return Promise.all(
    files.map(async (file) => ({
      path: path.relative(outputDirectory, file).split(path.sep).join("/"),
      sha256: createHash("sha256")
        .update(await readFile(file))
        .digest("hex"),
    })),
  );
}

function requireBuildArtifacts(artifacts) {
  const paths = new Set(artifacts.map((artifact) => artifact.path));
  for (const required of [
    "apps/api/src/server.js",
    "scripts/migrate.js",
    "web/index.html",
  ]) {
    if (!paths.has(required))
      throw new Error(`Missing required build artifact: ${required}`);
  }
}

await rm(outputDirectory, { recursive: true, force: true });
build();
const first = await manifest();
requireBuildArtifacts(first);
await rm(outputDirectory, { recursive: true, force: true });
build();
const second = await manifest();
requireBuildArtifacts(second);

if (JSON.stringify(first) !== JSON.stringify(second)) {
  console.error("Production build is not deterministic");
  console.error(JSON.stringify({ first, second }, null, 2));
  process.exit(1);
}

console.log(`PASS deterministic production build artifacts=${second.length}`);
