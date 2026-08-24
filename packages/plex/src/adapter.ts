import { createHash } from "node:crypto";

export interface PlexExtra {
  provider: string;
  providerKey: string;
  name: string;
  type: string;
  durationMs: number | null;
  thumbnailUrl: string | null;
  streamUrl: string | null;
  sourceUrl: string;
}

export interface PlexMetadataResponse {
  MediaContainer?: {
    Metadata?: Array<{ Extra?: unknown[] }>;
  };
}

export interface PlexRuntimeConfig {
  baseUrl: string;
  token: string;
  metadataKey: string;
  allowedHost?: string;
}

const SUPPORTED_TYPES = new Set([
  "behindthescenes",
  "deletedscene",
  "featurette",
  "interview",
  "trailer",
  "teaser",
]);

function nonBlank(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function privateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  )
    return false;
  const [first, second] = parts;
  return (
    first === 10 ||
    first === 127 ||
    (first === 172 && second! >= 16 && second! <= 31) ||
    (first === 192 && second === 168)
  );
}

export function validatePlexBaseUrl(raw: string, allowedHost?: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("PLEX_BASE_URL must be an absolute URL");
  }
  const hostname = url.hostname.toLowerCase();
  const configuredHost = allowedHost?.trim().toLowerCase();
  const privateHost =
    hostname === "localhost" ||
    hostname === "::1" ||
    privateIpv4(hostname) ||
    hostname.endsWith(".local");
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error("PLEX_BASE_URL must use http or https");
  if (url.username || url.password || url.search || url.hash)
    throw new Error(
      "PLEX_BASE_URL must not contain credentials, query, or fragment",
    );
  if (!privateHost && hostname !== configuredHost)
    throw new Error(
      "PLEX_BASE_URL host must be private or explicitly allowlisted",
    );
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url;
}

function sameOriginUrl(value: unknown, base: URL): string | null {
  const text = nonBlank(value);
  if (!text) return null;
  try {
    const candidate = new URL(text, base);
    return candidate.origin === base.origin ? candidate.toString() : null;
  } catch {
    return null;
  }
}

function durationMs(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    return null;
  return Math.round(value);
}

export function normalizePlexExtras(
  response: PlexMetadataResponse,
  baseUrl: URL,
): PlexExtra[] {
  const entries =
    response.MediaContainer?.Metadata?.flatMap(
      (metadata) => metadata.Extra ?? [],
    ) ?? [];
  const deduped = new Map<string, PlexExtra>();
  for (const value of entries) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const record = value as Record<string, unknown>;
    const providerKey = nonBlank(record.key);
    const type = nonBlank(record.type)?.toLowerCase() ?? "";
    const name = nonBlank(record.title) ?? nonBlank(record.name);
    if (
      !providerKey ||
      !name ||
      !SUPPORTED_TYPES.has(type) ||
      !providerKey.startsWith("/")
    )
      continue;
    const normalized: PlexExtra = {
      provider: nonBlank(record.provider) ?? "plex",
      providerKey,
      name,
      type,
      durationMs: durationMs(record.duration),
      thumbnailUrl: sameOriginUrl(record.thumb, baseUrl),
      streamUrl: sameOriginUrl(record.url, baseUrl),
      sourceUrl: new URL(providerKey, baseUrl).toString(),
    };
    const dedupeKey = plexExtraDedupeKey(normalized);
    if (!deduped.has(dedupeKey)) deduped.set(dedupeKey, normalized);
  }
  return Array.from(deduped.values());
}

export function plexExtraDedupeKey(
  extra: Pick<PlexExtra, "provider" | "providerKey" | "type">,
): string {
  return createHash("sha256")
    .update(`${extra.provider}\0${extra.providerKey}\0${extra.type}`)
    .digest("hex");
}

export function plexMetadataUrl(config: PlexRuntimeConfig): URL {
  const base = validatePlexBaseUrl(config.baseUrl, config.allowedHost);
  if (!/^\/library\/metadata\/[A-Za-z0-9_-]+$/.test(config.metadataKey))
    throw new Error("PLEX_METADATA_KEY must be a Plex library metadata path");
  return new URL(config.metadataKey.replace(/^\/+/, ""), base);
}

export async function fetchPlexMetadata(
  config: PlexRuntimeConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<PlexMetadataResponse> {
  const url = plexMetadataUrl(config);
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { Accept: "application/json", "X-Plex-Token": config.token },
      signal: AbortSignal.timeout(8_000),
    });
  } catch (error) {
    throw new Error(
      `Plex request failed for ${url.origin}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!response.ok)
    throw new Error(
      `Plex request returned HTTP ${response.status} from ${url.origin}`,
    );
  try {
    return (await response.json()) as PlexMetadataResponse;
  } catch {
    throw new Error(`Plex response from ${url.origin} was not valid JSON`);
  }
}
