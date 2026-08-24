import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  importCanonPackDirectory,
  MemorySliceStore,
} from "../apps/api/src/slice.js";

const LANTERN_VALE_021 = path.resolve("canon-packs/lantern-vale-0.2.1");
const REQUIRED_DATA = [
  "data/pack.json",
  "data/sources.json",
  "data/watchable-types.json",
  "data/containers.json",
  "data/watchables.json",
  "data/memberships.json",
  "data/relationships.json",
] as const;

async function writeJson(
  directory: string,
  name: string,
  value: unknown,
): Promise<void> {
  const destination = path.join(directory, name);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, canonicalJson(value));
}

function canonicalJson(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === "object")
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, entry]) => [key, normalize(entry)]),
      );
    return input;
  };
  return `${JSON.stringify(normalize(value), null, 2)}\n`;
}

async function replaceSignedMember(
  directory: string,
  member: string,
  contents: string,
): Promise<void> {
  await writeFile(path.join(directory, member), contents);
  const inventory = JSON.parse(
    await readFile(path.join(directory, "inventory.json"), "utf8"),
  ) as { files: Array<{ bytes: number; path: string }> };
  const inventoryEntry = inventory.files.find((entry) => entry.path === member);
  if (inventoryEntry) inventoryEntry.bytes = Buffer.byteLength(contents);
  await writeJson(directory, "inventory.json", inventory);

  const checksums = JSON.parse(
    await readFile(path.join(directory, "checksums.json"), "utf8"),
  ) as { files: Array<{ path: string; sha256: string }> };
  for (const entry of checksums.files) {
    entry.sha256 = createHash("sha256")
      .update(await readFile(path.join(directory, entry.path)))
      .digest("hex");
  }
  await writeJson(directory, "checksums.json", checksums);
}

async function packFixture(
  t: { after(cleanup: () => Promise<void>): void },
  options: {
    version?: string;
    mutate?: (files: Map<string, unknown>) => void;
  } = {},
): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "watch-tracker-pack-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const version = options.version ?? "9.2.1";
  const id = "01954123-0000-7000-8000-000000000001";
  const sourceId = "01954123-0000-7000-8000-000000000002";
  const typeId = "01954123-0000-7000-8000-000000000500";
  const watchableId = "01954123-0000-7000-8000-000000000201";
  const files = new Map<string, unknown>([
    [
      "compatibility.json",
      {
        authoringContract: "0.2.0",
        releaseContract: "0.2.0",
        coreSchema: ">=0.2.0 <0.3.0",
      },
    ],
    [
      "data/pack.json",
      {
        compatibility: { coreSchema: ">=0.2.0 <0.3.0" },
        id,
        license: {
          id: "Apache-2.0",
          url: "https://www.apache.org/licenses/LICENSE-2.0",
        },
        owner: {
          copyrightContact: "maintainers@example.invalid",
          governanceUrl: "https://example.invalid/test-pack/governance",
          maintainers: ["Test Pack Maintainers"],
          name: "Test Pack Community",
          provenancePolicyUrl:
            "https://example.invalid/test-pack/provenance-policy",
          repository: "https://example.invalid/test-pack",
          securityContact: "security@example.invalid",
          takedownPolicyUrl:
            "https://example.invalid/test-pack/copyright-policy",
        },
        projectRelationship: {
          endorsedByWatchTracker: false,
          independentlyMaintained: true,
        },
        scope: "Fictional test records for Canon Pack importer coverage.",
        slug: "test-pack",
        sourcePolicy: {
          expressiveContent: "prohibited-by-default",
          summary: "Use fictional test records with explicit provenance.",
        },
        title: "Test Pack",
        version,
      },
    ],
    [
      "data/sources.json",
      [
        {
          citation: "Fictional test source created for importer coverage.",
          id: sourceId,
          license: {
            id: "Apache-2.0",
            url: "https://www.apache.org/licenses/LICENSE-2.0",
          },
          retrievedAt: "2026-08-23",
          slug: "test-source",
          sourceType: "fictional-primary",
          title: "The Test Archive",
          url: "https://example.invalid/test-source",
        },
      ],
    ],
    [
      "data/watchable-types.json",
      ["movie", "episode", "special", "short"].map((code, index) => {
        const typeRecordId = `01954123-0000-7000-8000-00000000050${index}`;
        return {
          canonicalUrn: `urn:watch-tracker:canon-pack:${id}:entity:${typeRecordId}`,
          id: typeRecordId,
          code,
          label: code[0]!.toUpperCase() + code.slice(1),
          displayWeight: index + 1,
          provenance: [{ method: "contributor-defined", sourceId }],
        };
      }),
    ],
    ["data/containers.json", []],
    [
      "data/watchables.json",
      [
        {
          id: watchableId,
          slug: "test-watchable",
          title: "Test Watchable",
          summary: "A test watchable.",
          watchableTypeId: typeId,
          canonicalUrn: `urn:watch-tracker:canon-pack:${id}:entity:${watchableId}`,
          runtimeMinutes: 1,
          firstPublicRelease: {
            date: "2024-01-01",
            precision: "day",
            status: "released",
            provenance: [{ method: "contributor-defined", sourceId }],
          },
          provenance: [{ method: "contributor-defined", sourceId }],
        },
      ],
    ],
    ["data/memberships.json", []],
    ["data/relationships.json", []],
  ]);
  options.mutate?.(files);
  for (const [name, value] of files) await writeJson(directory, name, value);

  const manifest = {
    checksumAlgorithm: "sha256",
    contractVersion: "0.2.0",
    controlFiles: {
      checksums: "checksums.json",
      compatibility: "compatibility.json",
      inventory: "inventory.json",
    },
    packId: id,
    packSlug: "test-pack",
    packTitle: "Test Pack",
    packVersion: version,
  };
  await writeJson(directory, "manifest.json", manifest);
  const inventoryPaths = [
    "compatibility.json",
    ...REQUIRED_DATA,
    "manifest.json",
  ];
  const inventory = {
    files: await Promise.all(
      inventoryPaths.map(async (name) => ({
        path: name,
        bytes: (await readFile(path.join(directory, name))).length,
        mediaType: "application/json",
      })),
    ),
  };
  await writeJson(directory, "inventory.json", inventory);
  const checksumPaths = [...inventoryPaths, "inventory.json"];
  const checksums = {
    algorithm: "sha256",
    files: await Promise.all(
      checksumPaths.map(async (name) => ({
        path: name,
        sha256: createHash("sha256")
          .update(await readFile(path.join(directory, name)))
          .digest("hex"),
      })),
    ),
  };
  await writeJson(directory, "checksums.json", checksums);
  return directory;
}

test("imports the verified Lantern Vale 0.2.1 directory fixture", async () => {
  const pack = await importCanonPackDirectory(LANTERN_VALE_021);
  assert.deepEqual(pack.identity, {
    id: "01954123-0000-7000-8000-000000000001",
    slug: "lantern-vale",
    title: "Lantern Vale Stories",
    version: "0.2.1",
  });
  assert.equal(pack.watchables.length, 5);
  assert.equal(pack.memberships.length, 6);
  assert.equal(pack.memberships.at(-1)?.position, undefined);
});

test("an outside trusted-pack-root metadata change does not interrupt an import", async (t) => {
  const fixture = await packFixture(t, {
    mutate: (files) => {
      const watchables = files.get("data/watchables.json") as Array<
        Record<string, unknown>
      >;
      watchables[0]!.summary = "x".repeat(512 * 1024);
    },
  });
  const outside = path.join(
    path.dirname(fixture),
    `${path.basename(fixture)}-outside`,
  );
  t.after(() => rm(outside, { recursive: true, force: true }));
  const importing = importCanonPackDirectory(fixture);
  await new Promise<void>((resolve) => setImmediate(resolve));
  await mkdir(outside);

  const pack = await importing;
  assert.equal(pack.watchables.length, 1);
});

test("fails closed for tampering, malformed JSON, unknown, symlink, oversize, traversal, and duplicate members", async (t) => {
  const tampered = await packFixture(t);
  const watchables = await readFile(
    path.join(tampered, "data/watchables.json"),
  );
  await writeFile(
    path.join(tampered, "data/watchables.json"),
    " ".repeat(watchables.length),
  );
  await assert.rejects(importCanonPackDirectory(tampered), /checksum mismatch/);

  const malformed = await packFixture(t);
  await replaceSignedMember(malformed, "data/watchables.json", "{not json");
  await assert.rejects(importCanonPackDirectory(malformed), /invalid JSON/);

  const duplicateKey = await packFixture(t);
  await replaceSignedMember(
    duplicateKey,
    "data/sources.json",
    '[{"id":"01954123-0000-7000-8000-000000000002","id":"01954123-0000-7000-8000-000000000002"}]',
  );
  await assert.rejects(importCanonPackDirectory(duplicateKey), /duplicate key/);

  const unknown = await packFixture(t);
  await writeFile(path.join(unknown, "surprise.json"), "{}\n");
  await assert.rejects(importCanonPackDirectory(unknown), /unknown member/);

  const linked = await packFixture(t);
  await rm(path.join(linked, "data/containers.json"));
  await symlink("watchables.json", path.join(linked, "data/containers.json"));
  await assert.rejects(importCanonPackDirectory(linked), /symlink/);

  const oversized = await packFixture(t);
  await writeFile(
    path.join(oversized, "data/watchables.json"),
    " ".repeat(1_048_577),
  );
  await assert.rejects(
    importCanonPackDirectory(oversized),
    /allowed-size regular file/,
  );

  const traversal = await packFixture(t);
  const traversalChecksums = JSON.parse(
    await readFile(path.join(traversal, "checksums.json"), "utf8"),
  ) as { files: Array<{ path: string; sha256: string }> };
  traversalChecksums.files[0]!.path = "../compatibility.json";
  await writeJson(traversal, "checksums.json", traversalChecksums);
  await assert.rejects(
    importCanonPackDirectory(traversal),
    /unsafe member path/,
  );

  const duplicate = await packFixture(t);
  const duplicateInventory = JSON.parse(
    await readFile(path.join(duplicate, "inventory.json"), "utf8"),
  ) as { files: unknown[] };
  duplicateInventory.files.push(duplicateInventory.files[0]);
  await writeJson(duplicate, "inventory.json", duplicateInventory);
  await assert.rejects(importCanonPackDirectory(duplicate), /duplicate member/);

  const invalidChecksum = await packFixture(t);
  const invalidChecksums = JSON.parse(
    await readFile(path.join(invalidChecksum, "checksums.json"), "utf8"),
  ) as { files: Array<{ sha256: string }> };
  invalidChecksums.files[0]!.sha256 = "not-a-checksum";
  await writeJson(invalidChecksum, "checksums.json", invalidChecksums);
  await assert.rejects(
    importCanonPackDirectory(invalidChecksum),
    /invalid checksum/,
  );
});

test("rejects impossible first public release calendar dates", async (t) => {
  const impossibleDate = await packFixture(t, {
    mutate: (files) => {
      const watchables = files.get("data/watchables.json") as Array<
        Record<string, unknown>
      >;
      const release = watchables[0]!.firstPublicRelease as Record<
        string,
        unknown
      >;
      release.date = "2024-99-99";
    },
  });
  await assert.rejects(
    importCanonPackDirectory(impossibleDate),
    /ISO calendar date/,
  );
});

test("rejects zero display weights", async (t) => {
  const zeroWeight = await packFixture(t, {
    mutate: (files) => {
      const types = files.get("data/watchable-types.json") as Array<
        Record<string, unknown>
      >;
      types[0]!.displayWeight = 0;
    },
  });
  await assert.rejects(
    importCanonPackDirectory(zeroWeight),
    /displayWeight must be positive/,
  );
});

test("rejects incompatible contracts and unresolved cross-file references", async (t) => {
  const incompatible = await packFixture(t, {
    mutate: (files) => {
      files.set("compatibility.json", {
        authoringContract: "1.0.0",
        releaseContract: "1.0.0",
        coreSchema: ">=1.0.0 <2.0.0",
      });
    },
  });
  await assert.rejects(
    importCanonPackDirectory(incompatible),
    /incompatible contract/,
  );

  const unresolved = await packFixture(t, {
    mutate: (files) => {
      const watchables = files.get("data/watchables.json") as Array<
        Record<string, unknown>
      >;
      watchables[0]!.watchableTypeId = "01954123-0000-7000-8000-000000000999";
    },
  });
  await assert.rejects(
    importCanonPackDirectory(unresolved),
    /unresolved reference/,
  );
});

test("rejects a self-attested noncanonical release and records outside the 0.2.0 semantic contract", async (t) => {
  const noncanonical = await packFixture(t);
  const original = await readFile(
    path.join(noncanonical, "data/watchables.json"),
    "utf8",
  );
  await replaceSignedMember(
    noncanonical,
    "data/watchables.json",
    `\n${original}`,
  );
  await assert.rejects(
    importCanonPackDirectory(noncanonical),
    /canonical JSON/,
  );

  const badMembership = await packFixture(t, {
    mutate: (files) => {
      files.set("data/containers.json", [
        {
          canonicalUrn:
            "urn:watch-tracker:canon-pack:01954123-0000-7000-8000-000000000001:entity:01954123-0000-7000-8000-000000000100",
          id: "01954123-0000-7000-8000-000000000100",
          kind: "series",
          slug: "test-series",
          title: "Test Series",
          provenance: [
            {
              method: "contributor-defined",
              sourceId: "01954123-0000-7000-8000-000000000002",
            },
          ],
        },
      ]);
      files.set("data/memberships.json", [
        {
          id: "01954123-0000-7000-8000-000000000301",
          containerId: "01954123-0000-7000-8000-000000000100",
          memberId: "01954123-0000-7000-8000-000000000201",
          role: "primary-season",
          provenance: [
            {
              method: "contributor-defined",
              sourceId: "01954123-0000-7000-8000-000000000002",
            },
          ],
        },
      ]);
    },
  });
  await assert.rejects(
    importCanonPackDirectory(badMembership),
    /membership role/,
  );
});

test("rejects unknown and missing fields in every signed release record before semantic acceptance", async (t) => {
  const unknownSourceField = await packFixture(t, {
    mutate: (files) => {
      const sources = files.get("data/sources.json") as Array<
        Record<string, unknown>
      >;
      sources[0]!.unexpected = "not part of 0.2";
    },
  });
  await assert.rejects(
    importCanonPackDirectory(unknownSourceField),
    /unknown field.*sources\[0\]/,
  );

  const missingReleaseProvenance = await packFixture(t, {
    mutate: (files) => {
      const watchables = files.get("data/watchables.json") as Array<
        Record<string, unknown>
      >;
      delete (watchables[0]!.firstPublicRelease as Record<string, unknown>)
        .provenance;
    },
  });
  await assert.rejects(
    importCanonPackDirectory(missingReleaseProvenance),
    /missing required field.*firstPublicRelease.*provenance/,
  );

  const unknownWatchableField = await packFixture(t, {
    mutate: (files) => {
      const watchables = files.get("data/watchables.json") as Array<
        Record<string, unknown>
      >;
      watchables[0]!.unexpected = "not part of 0.2";
    },
  });
  await assert.rejects(
    importCanonPackDirectory(unknownWatchableField),
    /unknown field.*watchables\[0\]/,
  );

  const missingReleasePrecision = await packFixture(t, {
    mutate: (files) => {
      const watchables = files.get("data/watchables.json") as Array<
        Record<string, unknown>
      >;
      delete (watchables[0]!.firstPublicRelease as Record<string, unknown>)
        .precision;
    },
  });
  await assert.rejects(
    importCanonPackDirectory(missingReleasePrecision),
    /missing required field.*firstPublicRelease.*precision/,
  );

  const missingReleaseStatus = await packFixture(t, {
    mutate: (files) => {
      const watchables = files.get("data/watchables.json") as Array<
        Record<string, unknown>
      >;
      delete (watchables[0]!.firstPublicRelease as Record<string, unknown>)
        .status;
    },
  });
  await assert.rejects(
    importCanonPackDirectory(missingReleaseStatus),
    /missing required field.*firstPublicRelease.*status/,
  );

  const unknownMembershipField = await packFixture(t, {
    mutate: (files) => {
      files.set("data/memberships.json", [
        {
          containerId: "01954123-0000-7000-8000-000000000100",
          id: "01954123-0000-7000-8000-000000000301",
          memberId: "01954123-0000-7000-8000-000000000201",
          provenance: [
            {
              method: "contributor-defined",
              sourceId: "01954123-0000-7000-8000-000000000002",
            },
          ],
          role: "primary-series",
          unexpected: "not part of 0.2",
        },
      ]);
    },
  });
  await assert.rejects(
    importCanonPackDirectory(unknownMembershipField),
    /unknown field.*memberships\[0\]/,
  );

  const unknownRelationshipField = await packFixture(t, {
    mutate: (files) => {
      files.set("data/relationships.json", [
        {
          id: "01954123-0000-7000-8000-000000000401",
          prerequisiteId: "01954123-0000-7000-8000-000000000201",
          provenance: [
            {
              method: "contributor-defined",
              sourceId: "01954123-0000-7000-8000-000000000002",
            },
          ],
          summary: "A test relationship.",
          type: "required",
          unexpected: "not part of 0.2",
          watchableId: "01954123-0000-7000-8000-000000000201",
        },
      ]);
    },
  });
  await assert.rejects(
    importCanonPackDirectory(unknownRelationshipField),
    /unknown field.*relationships\[0\]/,
  );
});

test("the Lantern Vale import entry point rejects a self-attested replacement release", async (t) => {
  const replacement = await packFixture(t, { version: "0.2.2" });
  const store = new MemorySliceStore({ packPath: replacement });
  await assert.rejects(
    store.importLanternVale(),
    /not an accepted Canon Pack release/,
  );
});

test("an injected activation fault preserves the active pack and personal viewing and focus state", async () => {
  let failActivation = false;
  const store = new MemorySliceStore({
    packPath: LANTERN_VALE_021,
    faultAfterStage: () => failActivation,
  });
  await store.importLanternVale();
  const first = (await store.catalog())[0]!;
  await store.setFocus(first.slug);
  await store.viewingAction(first.slug, "complete");
  const beforeCatalog = await store.catalog();
  const beforeNext = await store.nextUp();

  failActivation = true;
  await assert.rejects(store.importLanternVale(), /injected activation fault/);
  assert.deepEqual(await store.catalog(), beforeCatalog);
  assert.deepEqual(await store.nextUp(), beforeNext);
});
