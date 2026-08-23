import { Pool } from "pg";

import {
  EXPECTED_SCHEMA_VERSION,
  loadMigrations,
  runMigrations,
} from "../apps/api/src/migrations.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const pool = new Pool({
  connectionString,
  connectionTimeoutMillis: 5_000,
  query_timeout: 5_000,
});
try {
  const migrations = await loadMigrations(
    process.env.MIGRATIONS_DIR ?? "db/migrations",
  );
  await runMigrations(pool, migrations);
  const terminal = migrations.at(-1);
  console.log(
    `PASS migrations=${migrations.length} schema=${EXPECTED_SCHEMA_VERSION} checksum=${terminal?.sha256 ?? "<none>"}`,
  );
} finally {
  await pool.end();
}
