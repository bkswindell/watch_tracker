import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const script = path.resolve("scripts/prepare-initial-admin-password.sh");

function run(file: string): string {
  return execFileSync(script, [], {
    env: { ...process.env, INITIAL_ADMIN_PASSWORD_FILE: file },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function runAsync(
  file: string,
  env: Record<string, string>,
): Promise<{ error?: unknown; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      script,
      [],
      {
        env: { ...process.env, ...env, INITIAL_ADMIN_PASSWORD_FILE: file },
        encoding: "utf8",
      },
      (error, stdout, stderr) =>
        resolve({ error: error ?? undefined, stdout, stderr }),
    );
  });
}

test("prepares a private strong password and is idempotent without printing it", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "watch-tracker-admin-"));
  const file = path.join(directory, "initial_admin_password");

  const firstOutput = run(file);
  const firstPassword = readFileSync(file, "utf8");
  const firstMode = statSync(file).mode & 0o777;

  assert.equal(firstOutput, "");
  assert.equal(firstMode, 0o600);
  assert.match(firstPassword, /^[A-Za-z0-9+/]{64}\n$/);
  assert.ok(firstPassword.length >= 32);

  const secondOutput = run(file);
  assert.equal(secondOutput, "");
  assert.equal(readFileSync(file, "utf8"), firstPassword);
});

test("fills an existing private empty password file without printing it", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "watch-tracker-admin-"));
  const file = path.join(directory, "initial_admin_password");
  writeFileSync(file, "", { mode: 0o600 });

  const output = run(file);
  const password = readFileSync(file, "utf8");
  const mode = statSync(file).mode & 0o777;

  assert.equal(output, "");
  assert.equal(mode, 0o600);
  assert.match(password, /^[A-Za-z0-9+/]{64}\n$/);
});

test("allows concurrent initialization when one valid process wins", async () => {
  const directory = mkdtempSync(
    path.join(tmpdir(), "watch-tracker-admin-race-"),
  );
  const file = path.join(directory, "initial_admin_password");
  const barrier = path.join(directory, "barrier");
  const bin = path.join(directory, "bin");
  const fakeOpenSsl = path.join(bin, "openssl");
  mkdirSync(barrier);
  mkdirSync(bin);
  writeFileSync(
    fakeOpenSsl,
    `#!/usr/bin/env bash
set -Eeuo pipefail
mkdir -- "$BARRIER/$PPID"
while true; do
  markers=("$BARRIER"/*)
  ((\${#markers[@]} >= 2)) && break
  sleep 0.01
done
printf 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/\\n'
`,
    { mode: 0o700 },
  );
  chmodSync(fakeOpenSsl, 0o700);
  writeFileSync(file, "", { mode: 0o600 });

  const env = {
    BARRIER: barrier,
    PATH: `${bin}:${process.env.PATH ?? ""}`,
  };
  const results = await Promise.all([runAsync(file, env), runAsync(file, env)]);

  assert.deepEqual(
    results.map(({ error, stdout, stderr }) => ({ error, stdout, stderr })),
    [
      { error: undefined, stdout: "", stderr: "" },
      { error: undefined, stdout: "", stderr: "" },
    ],
  );
  const password = readFileSync(file, "utf8");
  assert.equal(password.length, 65);
  assert.match(password, /^[A-Za-z0-9+/]{64}/);
  assert.equal(password.at(-1), "\n");
  assert.equal(statSync(file).mode & 0o777, 0o600);
});

test("fails closed when the password parent is group-readable or group-writable", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "watch-tracker-admin-"));
  const unsafe = path.join(directory, "unsafe");
  const file = path.join(unsafe, "initial_admin_password");
  // mkdtemp creates a private directory; this nested directory deliberately is not.
  writeFileSync(path.join(directory, "marker"), "marker");
  execFileSync("mkdir", [unsafe], { stdio: "ignore" });
  execFileSync("chmod", ["0750", unsafe], { stdio: "ignore" });

  assert.throws(() => run(file), /permissions|owner|private/i);
  assert.throws(() => statSync(file), /ENOENT/);
});

test("fails closed instead of repairing an existing unsafe password file", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "watch-tracker-admin-"));
  const file = path.join(directory, "initial_admin_password");
  writeFileSync(file, "existing-secret\n", { mode: 0o640 });

  assert.throws(() => run(file), /permissions|owner|private/i);
  assert.equal(readFileSync(file, "utf8"), "existing-secret\n");
});
