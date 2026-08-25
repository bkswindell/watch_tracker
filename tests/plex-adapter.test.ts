import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  normalizePlexExtras,
  plexExtraDedupeKey,
  plexMetadataUrl,
  validatePlexBaseUrl,
  type PlexMetadataResponse,
} from "../packages/plex/src/adapter.js";

const baseUrl = new URL("http://swi-pro-ds:32400");

test("normalizes six mixed Plex extras, filters unsupported/unsafe entries, and dedupes deterministically", async () => {
  const fixture = JSON.parse(
    await readFile(
      new URL("./fixtures/plex-mixed-extras.json", import.meta.url),
      "utf8",
    ),
  ) as PlexMetadataResponse;
  const extras = normalizePlexExtras(fixture, baseUrl);

  assert.equal(extras.length, 3);
  assert.deepEqual(
    extras.map(
      ({
        provider,
        providerKey,
        name,
        type,
        durationMs,
        thumbnailUrl,
        streamUrl,
        sourceUrl,
      }) => ({
        provider,
        providerKey,
        name,
        type,
        durationMs,
        thumbnailUrl,
        streamUrl,
        sourceUrl,
      }),
    ),
    [
      {
        provider: "plex",
        providerKey: "/library/metadata/5d776/extras/1",
        name: "Official Trailer",
        type: "trailer",
        durationMs: 90000,
        thumbnailUrl: "http://swi-pro-ds:32400/:/resources/trailer.jpg",
        streamUrl:
          "http://swi-pro-ds:32400/video/:/transcode/universal/start.m3u8",
        sourceUrl: "http://swi-pro-ds:32400/library/metadata/5d776/extras/1",
      },
      {
        provider: "plex",
        providerKey: "/library/metadata/5d776/extras/2",
        name: "Making Of",
        type: "behindthescenes",
        durationMs: 120000,
        thumbnailUrl: "http://swi-pro-ds:32400/:/resources/making.jpg",
        streamUrl: null,
        sourceUrl: "http://swi-pro-ds:32400/library/metadata/5d776/extras/2",
      },
      {
        provider: "plex",
        providerKey: "/library/metadata/5d776/extras/3",
        name: "Deleted Scene",
        type: "deletedscene",
        durationMs: 45000,
        thumbnailUrl: null,
        streamUrl: null,
        sourceUrl: "http://swi-pro-ds:32400/library/metadata/5d776/extras/3",
      },
    ],
  );
  assert.equal(plexExtraDedupeKey(extras[0]!), plexExtraDedupeKey(extras[0]!));
  assert.notEqual(
    plexExtraDedupeKey(extras[0]!),
    plexExtraDedupeKey(extras[1]!),
  );
});

test("allows configured private Plex hosts and rejects arbitrary public hosts", () => {
  assert.equal(
    validatePlexBaseUrl("http://192.168.1.40:32400").hostname,
    "192.168.1.40",
  );
  assert.equal(
    validatePlexBaseUrl("http://swi-pro-ds:32400", "swi-pro-ds").hostname,
    "swi-pro-ds",
  );
  assert.throws(
    () => validatePlexBaseUrl("http://public.example:32400"),
    /private or explicitly allowlisted/,
  );
  assert.throws(
    () => validatePlexBaseUrl("http://user:secret@192.168.1.40:32400"),
    /credentials/,
  );
});

test("builds metadata URL from a fixed Plex library metadata path", () => {
  const url = plexMetadataUrl({
    baseUrl: "http://swi-pro-ds:32400",
    allowedHost: "swi-pro-ds",
    token: "fixture-token",
    metadataKey: "/library/metadata/5d77687f103a2d001f5737bb",
  });
  assert.equal(
    url.toString(),
    "http://swi-pro-ds:32400/library/metadata/5d77687f103a2d001f5737bb",
  );
  assert.throws(
    () =>
      plexMetadataUrl({
        baseUrl: "http://192.168.1.40:32400",
        token: "x",
        metadataKey: "https://evil.example",
      }),
    /metadata path/,
  );
});
