import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
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
