import { Pool } from "pg";

import { SqlSliceStore } from "../apps/api/src/slice.js";

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "[::1]" ||
    /^127(?:\.\d{1,3}){3}$/.test(hostname)
  );
}

export function resetLinkBase(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("WATCH_TRACKER_BASE_URL must be a valid HTTP(S) URL");
  }
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("WATCH_TRACKER_BASE_URL must use HTTP or HTTPS");
  if (url.protocol === "http:" && !isLoopbackHost(url.hostname))
    throw new Error(
      "WATCH_TRACKER_BASE_URL must use HTTPS unless its host is loopback",
    );
  if (url.username || url.password || url.search || url.hash)
    throw new Error(
      "WATCH_TRACKER_BASE_URL must not contain credentials, query, or fragment",
    );
  if (url.pathname !== "/")
    throw new Error("WATCH_TRACKER_BASE_URL must not contain a path");
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url;
}

export function passwordResetLink(baseUrl: string, token: string): string {
  const url = resetLinkBase(baseUrl);
  url.pathname = "/reset-password";
  url.hash = `token=${encodeURIComponent(token)}`;
  return url.toString();
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const baseUrl =
    process.env.WATCH_TRACKER_BASE_URL?.trim() ?? "http://127.0.0.1:3100/";
  // Validate every delivery constraint before issuance invalidates an older
  // outstanding token or writes a new digest.
  const validatedBaseUrl = resetLinkBase(baseUrl).toString();
  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5_000,
    query_timeout: 5_000,
  });
  try {
    const reset = await new SqlSliceStore(pool).issuePasswordResetToken();
    // This is deliberately the sole stdout write. The token is never logged,
    // persisted by the CLI, or included in an error message.
    process.stdout.write(
      `${passwordResetLink(validatedBaseUrl, reset.token)}\n`,
    );
  } finally {
    await pool.end();
  }
}

if (import.meta.url === new URL(process.argv[1] ?? "", "file:").href) {
  try {
    await main();
  } catch {
    process.stderr.write("password recovery failed\n");
    process.exitCode = 1;
  }
}
