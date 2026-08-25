import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(
  process.env.CANON_PACK_OUTPUT ?? "canon-packs/lantern-vale-0.2.2",
);
const mockup = await readFile(
  "/home/administrator/workspace/watch_tracker/mockup/src/App.jsx",
  "utf8",
);
const watchablesLiteral =
  /const watchables=(\[[\s\S]*?\]);\nconst initialRelations=/.exec(mockup)?.[1];
const relationsLiteral =
  /const initialRelations=(\[[\s\S]*?\]);\n\nconst appTheme=/.exec(mockup)?.[1];
if (!watchablesLiteral || !relationsLiteral)
  throw new Error("approved mockup data was not found");
const context = {};
vm.runInNewContext(
  `globalThis.watchables = ${watchablesLiteral}; globalThis.relations = ${relationsLiteral};`,
  context,
);
const mockupItems = context.watchables;
const mockupRelations = context.relations;
if (mockupItems.length !== 31 || mockupRelations.length !== 32)
  throw new Error("approved mockup inventory changed");

const packId = "01954123-0000-7000-8000-000000000001";
const sourceId = "01954123-0000-7000-8000-000000000002";
const provenance = [{ method: "contributor-defined", sourceId }];
const uuid = (number) =>
  `01954123-0000-7000-8000-${String(number).padStart(12, "0")}`;
const canonicalUrn = (id) =>
  `urn:watch-tracker:canon-pack:${packId}:entity:${id}`;
const slugify = (value) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const typeIds = {
  Movie: uuid(500),
  Episode: uuid(501),
  Special: uuid(502),
  Short: uuid(503),
};
const series = [
  [uuid(100), "lantern-vale", "Lantern Vale"],
  [uuid(101), "lantern-vale-movies", "Lantern Vale Movies"],
  [uuid(102), "greymoor-files", "Greymoor Files"],
];
const idByMockupId = new Map(
  mockupItems.map((item, index) => [item.id, uuid(201 + index)]),
);
const watchables = mockupItems.map((item, index) => ({
  canonicalUrn: canonicalUrn(uuid(201 + index)),
  firstPublicRelease: {
    date: item.release,
    precision: "day",
    provenance,
    status: "released",
  },
  id: uuid(201 + index),
  packOrder: item.order,
  provenance,
  runtimeMinutes: item.runtime,
  series: item.series,
  aliases: [],
  generatedPoster: item.poster === true,
  queueReason: item.why,
  ...(item.season === undefined
    ? {}
    : { seasonNumber: item.season, episodeNumber: item.episode }),
  ...(item.posterUrl === undefined ? {} : { posterUrl: item.posterUrl }),
  slug: slugify(item.id),
  summary: item.description || item.why,
  title: item.title,
  watchableTypeId: typeIds[item.type],
}));
const containers = series.map(([id, slug, title]) => ({
  canonicalUrn: canonicalUrn(id),
  id,
  kind: "series",
  provenance,
  slug,
  title,
}));
const containerByTitle = new Map(series.map(([id, , title]) => [title, id]));
const memberships = mockupItems.map((item, index) => ({
  containerId: containerByTitle.get(item.series),
  id: uuid(301 + index),
  memberId: uuid(201 + index),
  position: item.order,
  provenance,
  role: "primary-series",
}));
const relationships = mockupRelations.map(
  ([source, destination, type], index) => ({
    id: uuid(401 + index),
    prerequisiteId: idByMockupId.get(source),
    provenance,
    summary: `${mockupItems.find((item) => item.id === source).title} ${type === "sequence" ? "precedes" : "is required before"} ${mockupItems.find((item) => item.id === destination).title}.`,
    type,
    watchableId: idByMockupId.get(destination),
  }),
);
const canonicalJson = (value) =>
  `${JSON.stringify(value, Object.keys(value).sort(), 2)}\n`;
const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, stable(entry)]),
    );
  return value;
};
const encode = (value) => `${JSON.stringify(stable(value), null, 2)}\n`;
for (const [member, value] of Object.entries({
  "data/containers.json": containers,
  "data/watchables.json": watchables,
  "data/memberships.json": memberships,
  "data/relationships.json": relationships,
}))
  await writeFile(path.join(root, member), encode(value));
const inventoryPaths = [
  "compatibility.json",
  "data/containers.json",
  "data/memberships.json",
  "data/pack.json",
  "data/relationships.json",
  "data/sources.json",
  "data/watchable-types.json",
  "data/watchables.json",
  "manifest.json",
];
const inventory = {
  files: await Promise.all(
    inventoryPaths.map(async (member) => ({
      bytes: (await readFile(path.join(root, member))).length,
      mediaType: "application/json",
      path: member,
    })),
  ),
};
await writeFile(path.join(root, "inventory.json"), encode(inventory));
const checksumPaths = [...inventoryPaths, "inventory.json"];
const checksums = {
  algorithm: "sha256",
  files: await Promise.all(
    checksumPaths.map(async (member) => ({
      path: member,
      sha256: createHash("sha256")
        .update(await readFile(path.join(root, member)))
        .digest("hex"),
    })),
  ),
};
await writeFile(path.join(root, "checksums.json"), encode(checksums));
