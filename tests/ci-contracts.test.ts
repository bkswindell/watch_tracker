import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
  scripts: Record<string, string>;
};
const workflow = await readFile(".github/workflows/core-validate.yml", "utf8");

test("portable test command excludes the PostgreSQL integration file", () => {
  assert.match(packageJson.scripts.test ?? "", /run-portable-tests\.mjs/);
  assert.equal(
    packageJson.scripts["test:postgres"],
    "node --import tsx --test tests/postgres-integration.test.ts",
  );
});

test("CI runs both portable and explicitly gated PostgreSQL tests", () => {
  assert.match(workflow, /run: npm test/);
  assert.match(workflow, /run: npm run test:postgres/);
  assert.doesNotMatch(workflow, /if:.*TEST_DATABASE_URL/);
});

test("CI PostgreSQL credentials and migration gate are internally consistent", () => {
  assert.match(
    workflow,
    /POSTGRES_PASSWORD: ci-only-watch-tracker-password\n\s+TEST_DATABASE_URL: postgresql:\/\/watch_tracker:ci-only-watch-tracker-password@127\.0\.0\.1:5432\/watch_tracker_ci/,
  );
  assert.doesNotMatch(workflow, /Smoke built Compose runtime/);
  assert.match(workflow, /migration_version.*0\.03|0\.03.*migration_version/s);
});
