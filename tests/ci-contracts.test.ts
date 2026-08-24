import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
  scripts: Record<string, string>;
};
const workflow = await readFile(".github/workflows/core-validate.yml", "utf8");
const compose = await readFile("compose.yaml", "utf8");

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
  assert.match(workflow, /migration_version.*0\.03|0\.03.*migration_version/s);
});

test("CI smoke uses the built production images with disposable loopback Compose inputs", () => {
  assert.match(workflow, /Generate disposable Compose secrets/);
  const setup = workflow.slice(
    workflow.indexOf("Generate disposable Compose secrets"),
  );
  const smoke = workflow.slice(workflow.indexOf("Smoke built Compose runtime"));
  assert.notEqual(smoke, workflow, "runtime smoke must be present");
  assert.match(setup, /openssl rand -hex 32/);
  assert.match(setup, /APP_BIND_ADDRESS=127\.0\.0\.1/);
  assert.match(
    smoke,
    /docker compose --env-file "\$COMPOSE_ENV_FILE" up --detach --no-build --wait/,
  );
  assert.match(smoke, /WATCH_TRACKER_IMAGE/);
  assert.match(smoke, /docker image inspect "\$WATCH_TRACKER_IMAGE"/);
  assert.match(
    smoke,
    /for \(const endpoint of \['\/', '\/health', '\/ready'\]\)/,
  );
  assert.match(smoke, /Compose runtime diagnostics/);
  assert.match(
    smoke,
    /docker compose --env-file "\$COMPOSE_ENV_FILE" down --volumes --remove-orphans/,
  );
  assert.match(smoke, /if: \$\{\{ always\(\) \}\}/);
  assert.doesNotMatch(smoke, /--privileged/);
  assert.doesNotMatch(smoke, /--volume \/var\/run\/docker\.sock/);
  assert.match(compose, /backend:\n\s+internal: true/);
  const database = compose.slice(
    compose.indexOf("  database:"),
    compose.indexOf("  migrator:"),
  );
  assert.doesNotMatch(database, /ports:/);
});
