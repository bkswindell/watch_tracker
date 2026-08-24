import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import {
  ACCEPTED_LANTERN_VALE_RELEASE,
  DEFAULT_CANON_PACK_PATH,
  MemorySliceStore,
} from "../apps/api/src/slice.js";

test("the compiled default resolves to the Core-vendored accepted Lantern Vale artifact", async () => {
  assert.equal(DEFAULT_CANON_PACK_PATH, "/app/canon-packs/lantern-vale-0.2.0");
  assert.deepEqual(ACCEPTED_LANTERN_VALE_RELEASE, {
    id: "01954123-0000-7000-8000-000000000001",
    slug: "lantern-vale",
    title: "Lantern Vale Stories",
    version: "0.2.0",
    manifestSha256:
      "f5c1041ad7daf7a49f8987bdd7d8127f0a8b6c94e70b4aca775e732010b98b8c",
  });

  const vendored = path.resolve("canon-packs/lantern-vale-0.2.0");
  await access(path.join(vendored, "manifest.json"));
  await access(path.join(vendored, "data/watchables.json"));

  const [dockerfile, compose] = await Promise.all([
    readFile("Dockerfile", "utf8"),
    readFile("compose.yaml", "utf8"),
  ]);
  assert.match(
    dockerfile,
    /COPY --chown=node:node canon-packs \.\/canon-packs/,
  );
  assert.match(
    compose,
    /CANON_PACK_PATH: \/app\/canon-packs\/lantern-vale-0\.2\.0/,
  );
  assert.match(
    compose,
    /- "\$\{APP_BIND_ADDRESS:-10\.18\.0\.201\}:\$\{APP_PORT:-3100\}:3000"/,
  );
  assert.doesNotMatch(compose, /10\.18\.0\.201:3100:3000/);
  assert.equal((compose.match(/^\s+ports:$/gm) ?? []).length, 1);
});

test("the test runtime default imports the validated vendored Lantern Vale artifact", async () => {
  const store = new MemorySliceStore();
  assert.deepEqual(await store.importLanternVale(), {
    title: "Lantern Vale Stories",
    version: "0.2.0",
  });
  assert.equal((await store.catalog()).length, 5);
});
