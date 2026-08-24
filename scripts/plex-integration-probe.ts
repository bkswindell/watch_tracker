import {
  fetchPlexMetadata,
  normalizePlexExtras,
  plexMetadataUrl,
  validatePlexBaseUrl,
} from "../packages/plex/src/adapter.js";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value)
    throw new Error(`${name} is required; no live request was attempted`);
  return value;
}

async function main(): Promise<void> {
  if (process.env.PLEX_PROBE !== "1") {
    throw new Error(
      "opt-in guard: set PLEX_PROBE=1 to run the live Plex probe",
    );
  }
  const baseUrl = required("PLEX_BASE_URL");
  const token = required("PLEX_TOKEN");
  const metadataKey =
    process.env.PLEX_METADATA_KEY?.trim() ||
    "/library/metadata/5d77687f103a2d001f5737bb";
  const allowedHost = process.env.PLEX_ALLOWED_HOST?.trim();
  const config = {
    baseUrl,
    token,
    metadataKey,
    ...(allowedHost ? { allowedHost } : {}),
  };
  const url = plexMetadataUrl(config);
  const metadata = await fetchPlexMetadata(config);
  const extras = normalizePlexExtras(
    metadata,
    validatePlexBaseUrl(baseUrl, allowedHost),
  );
  console.log(
    JSON.stringify(
      { ok: true, origin: url.origin, metadataKey, extras: extras.length },
      null,
      2,
    ),
  );
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    `Plex integration probe failed: ${message.replace(/([?&]X-Plex-Token=)[^&\\s]+/gi, "$1[REDACTED]")}`,
  );
  console.error(
    "Set PLEX_PROBE=1, PLEX_BASE_URL, and PLEX_TOKEN; use PLEX_ALLOWED_HOST for a private hostname such as swi-pro-ds.",
  );
  process.exitCode = 1;
});
