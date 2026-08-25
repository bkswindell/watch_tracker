import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readdir } from "node:fs/promises";
import path from "node:path";

const CONTROL_MEMBERS = [
  "manifest.json",
  "inventory.json",
  "checksums.json",
  "compatibility.json",
] as const;
const DATA_MEMBERS = [
  "data/pack.json",
  "data/sources.json",
  "data/watchable-types.json",
  "data/containers.json",
  "data/watchables.json",
  "data/memberships.json",
  "data/relationships.json",
] as const;
const ALLOWED_MEMBERS = new Set<string>([...CONTROL_MEMBERS, ...DATA_MEMBERS]);
const MAX_MEMBER_BYTES = 1_048_576;
const MAX_AGGREGATE_BYTES = 8_388_608;
const MAX_MEMBERS = ALLOWED_MEMBERS.size;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const CANON_PACK_LIMITS = Object.freeze({
  maxMemberBytes: MAX_MEMBER_BYTES,
  maxAggregateBytes: MAX_AGGREGATE_BYTES,
  maxMembers: MAX_MEMBERS,
});

export interface CanonPackIdentity {
  id: string;
  slug: string;
  title: string;
  version: string;
}
export interface CanonPackWatchableType {
  id: string;
  code: string;
  label: string;
  displayWeight: number;
}
export interface CanonPackSource {
  id: string;
  slug: string;
  title: string;
}
export interface CanonPackContainer {
  id: string;
  slug: string;
  title: string;
  kind: string;
}
export interface CanonPackWatchable {
  id: string;
  slug: string;
  title: string;
  summary: string;
  watchableTypeId: string;
  releaseDate: string;
  releaseOrder: number;
  runtimeMinutes: number;
  series: string;
  seasonNumber?: number;
  episodeNumber?: number;
  aliases: string[];
  generatedPoster: boolean;
  queueReason: string;
  posterUrl?: string;
}
export interface CanonPackMembership {
  id: string;
  containerId: string;
  memberId: string;
  position?: number;
  role: string;
}
export interface CanonPackRelationship {
  id: string;
  watchableId: string;
  prerequisiteId: string;
  type: string;
  summary: string;
}
export interface CanonPack {
  identity: CanonPackIdentity;
  manifestSha256: string;
  checksumsSha256: string;
  sourcePath: string;
  verification: { fileCount: number; totalBytes: number; verified: boolean };
  sources: CanonPackSource[];
  watchableTypes: CanonPackWatchableType[];
  containers: CanonPackContainer[];
  watchables: CanonPackWatchable[];
  memberships: CanonPackMembership[];
  relationships: CanonPackRelationship[];
}

interface JsonObject {
  [key: string]: JsonValue;
}
type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];

class StrictJsonParser {
  #index = 0;
  constructor(private readonly text: string) {}

  parse(): JsonValue {
    this.skipWhitespace();
    const result = this.value();
    this.skipWhitespace();
    if (this.#index !== this.text.length)
      this.fail("unexpected trailing content");
    return result;
  }

  private value(): JsonValue {
    this.skipWhitespace();
    const character = this.text[this.#index];
    if (character === "{") return this.object();
    if (character === "[") return this.array();
    if (character === '"') return this.string();
    if (character === "t" && this.take("true")) return true;
    if (character === "f" && this.take("false")) return false;
    if (character === "n" && this.take("null")) return null;
    if (
      character === "-" ||
      (character !== undefined && /[0-9]/.test(character))
    ) {
      return this.number();
    }
    this.fail("expected a JSON value");
  }

  private object(): JsonObject {
    this.expect("{");
    const result: JsonObject = Object.create(null) as JsonObject;
    this.skipWhitespace();
    if (this.consume("}")) return result;
    while (true) {
      this.skipWhitespace();
      if (this.text[this.#index] !== '"') this.fail("expected object key");
      const key = this.string();
      if (Object.hasOwn(result, key))
        this.fail(`duplicate key ${JSON.stringify(key)}`);
      this.skipWhitespace();
      this.expect(":");
      result[key] = this.value();
      this.skipWhitespace();
      if (this.consume("}")) return result;
      this.expect(",");
    }
  }

  private array(): JsonValue[] {
    this.expect("[");
    const result: JsonValue[] = [];
    this.skipWhitespace();
    if (this.consume("]")) return result;
    while (true) {
      result.push(this.value());
      this.skipWhitespace();
      if (this.consume("]")) return result;
      this.expect(",");
    }
  }

  private string(): string {
    const start = this.#index;
    this.expect('"');
    while (this.#index < this.text.length) {
      const character = this.text[this.#index++];
      if (character === '"') {
        try {
          return JSON.parse(this.text.slice(start, this.#index)) as string;
        } catch {
          this.fail("invalid string");
        }
      }
      if (character === "\\") {
        const escaped = this.text[this.#index++];
        if (escaped === "u") this.#index += 4;
        else if (!'"\\/bfnrt'.includes(escaped ?? ""))
          this.fail("invalid escape");
      } else if (character === undefined || character.charCodeAt(0) < 0x20) {
        this.fail("invalid string");
      }
    }
    this.fail("unterminated string");
  }

  private number(): number {
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(
      this.text.slice(this.#index),
    );
    if (!match?.[0]) this.fail("invalid number");
    this.#index += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) this.fail("invalid number");
    return value;
  }

  private take(value: string): boolean {
    if (!this.text.startsWith(value, this.#index)) return false;
    this.#index += value.length;
    return true;
  }
  private consume(value: string): boolean {
    if (this.text[this.#index] !== value) return false;
    this.#index++;
    return true;
  }
  private expect(value: string): void {
    if (!this.consume(value)) this.fail(`expected ${JSON.stringify(value)}`);
  }
  private skipWhitespace(): void {
    while (/\s/.test(this.text[this.#index] ?? "")) this.#index++;
  }
  private fail(message: string): never {
    throw new Error(`invalid JSON at byte ${this.#index}: ${message}`);
  }
}

function parseJson(member: string, buffer: Buffer): JsonValue {
  try {
    return new StrictJsonParser(buffer.toString("utf8")).parse();
  } catch (error) {
    throw new Error(
      `Canon Pack member ${member} has invalid JSON: ${String(error)}`,
    );
  }
}

function canonicalJson(value: JsonValue, depth = 0): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  const indentation = "  ".repeat(depth);
  const childIndentation = "  ".repeat(depth + 1);
  if (Array.isArray(value))
    return value.length === 0
      ? "[]"
      : `[\n${value.map((item) => `${childIndentation}${canonicalJson(item, depth + 1)}`).join(",\n")}\n${indentation}]`;
  const keys = Object.keys(value).sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  return keys.length === 0
    ? "{}"
    : `{\n${keys.map((key) => `${childIndentation}${JSON.stringify(key)}: ${canonicalJson(value[key]!, depth + 1)}`).join(",\n")}\n${indentation}}`;
}

function assertCanonicalJson(member: string, buffer: Buffer): JsonValue {
  const parsed = parseJson(member, buffer);
  if (buffer.toString("utf8") !== `${canonicalJson(parsed)}\n`)
    throw new Error(`Canon Pack member ${member} is not canonical JSON`);
  return parsed;
}
function object(value: JsonValue | undefined, subject: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`${subject} must be an object`);
  return value;
}

function closedObject(
  value: JsonValue | undefined,
  subject: string,
  required: readonly string[],
  optional: readonly string[] = [],
): JsonObject {
  const result = object(value, subject);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(result)) {
    if (!allowed.has(key)) throw new Error(`unknown field ${subject}.${key}`);
  }
  for (const key of required) {
    if (result[key] === undefined)
      throw new Error(`missing required field ${subject}.${key}`);
  }
  return result;
}
function array(value: JsonValue | undefined, subject: string): JsonValue[] {
  if (!Array.isArray(value)) throw new Error(`${subject} must be an array`);
  return value;
}
function string(value: JsonValue | undefined, subject: string): string {
  if (typeof value !== "string" || value.trim() === "")
    throw new Error(`${subject} must be a non-blank string`);
  return value;
}
function integer(value: JsonValue | undefined, subject: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value))
    throw new Error(`${subject} must be an integer`);
  return value;
}
function optionalPositiveInteger(
  value: JsonValue | undefined,
  subject: string,
): number | undefined {
  if (value === undefined) return undefined;
  const result = integer(value, subject);
  if (result < 1) throw new Error(`${subject} must be positive`);
  return result;
}
function uuid(value: JsonValue | undefined, subject: string): string {
  const result = string(value, subject);
  if (!UUID.test(result)) throw new Error(`${subject} must be a UUID`);
  return result;
}
function date(value: JsonValue | undefined, subject: string): string {
  const result = string(value, subject);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(result);
  if (!match) throw new Error(`${subject} must be an ISO calendar date`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ][month - 1];
  if (daysInMonth === undefined || day < 1 || day > daysInMonth)
    throw new Error(`${subject} must be an ISO calendar date`);
  return result;
}
function strictProvenance(
  value: JsonValue | undefined,
  sourceIds: ReadonlySet<string>,
  subject: string,
): void {
  for (const [index, entry] of array(value, subject).entries()) {
    const record = closedObject(
      entry,
      `${subject}[${index}]`,
      ["method", "sourceId"],
      ["note"],
    );
    const sourceId = uuid(record.sourceId, `${subject}[${index}].sourceId`);
    if (!sourceIds.has(sourceId))
      throw new Error(`unresolved reference: ${subject} source ${sourceId}`);
    const method = string(record.method, `${subject}[${index}].method`);
    if (
      ![
        "quoted",
        "summarized",
        "inferred",
        "calculated",
        "contributor-defined",
      ].includes(method)
    )
      throw new Error(`invalid provenance method in ${subject}`);
    if (record.note !== undefined)
      string(record.note, `${subject}[${index}].note`);
    if (method === "inferred" && record.note === undefined)
      throw new Error(`inferred provenance requires a note in ${subject}`);
  }
}
function memberPath(value: JsonValue | undefined, subject: string): string {
  const result = string(value, subject);
  if (
    result.includes("\\") ||
    result.startsWith("/") ||
    result
      .split("/")
      .some((part) => part === "" || part === "." || part === "..") ||
    !ALLOWED_MEMBERS.has(result)
  ) {
    throw new Error(`unsafe member path in ${subject}`);
  }
  return result;
}
function ids<T extends { id: string }>(
  records: readonly T[],
  subject: string,
): Set<string> {
  const result = new Set<string>();
  for (const record of records) {
    if (result.has(record.id))
      throw new Error(`duplicate ${subject} id ${record.id}`);
    result.add(record.id);
  }
  return result;
}
function sourceReferences(
  value: JsonObject,
  sourceIds: ReadonlySet<string>,
  subject: string,
): void {
  strictProvenance(value.provenance, sourceIds, `${subject}.provenance`);
}

function sortedRecords(value: JsonValue, subject: string): JsonObject[] {
  const records = array(value, subject).map((entry, index) =>
    object(entry, `${subject}[${index}]`),
  );
  let previous = "";
  for (const [index, record] of records.entries()) {
    const id = uuid(record.id, `${subject}[${index}].id`);
    if (index > 0 && id <= previous)
      throw new Error(`${subject} records must be sorted by immutable ID`);
    previous = id;
  }
  return records;
}

function generatedUrn(
  record: JsonObject,
  packId: string,
  subject: string,
): void {
  const id = uuid(record.id, `${subject}.id`);
  if (
    string(record.canonicalUrn, `${subject}.canonicalUrn`) !==
    `urn:watch-tracker:canon-pack:${packId}:entity:${id}`
  )
    throw new Error(
      `${subject} canonical URN does not match immutable identity`,
    );
}

function requireGraphAcyclic(
  relationships: readonly CanonPackRelationship[],
): void {
  const adjacency = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const relationship of relationships) {
    if (relationship.type !== "required" && relationship.type !== "sequence")
      continue;
    indegree.set(
      relationship.prerequisiteId,
      indegree.get(relationship.prerequisiteId) ?? 0,
    );
    indegree.set(
      relationship.watchableId,
      (indegree.get(relationship.watchableId) ?? 0) + 1,
    );
    const targets = adjacency.get(relationship.prerequisiteId) ?? [];
    targets.push(relationship.watchableId);
    adjacency.set(relationship.prerequisiteId, targets);
  }
  const ready = [...indegree.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([id]) => id);
  let visited = 0;
  for (let index = 0; index < ready.length; index += 1) {
    const id = ready[index]!;
    visited += 1;
    for (const target of adjacency.get(id) ?? []) {
      const degree = indegree.get(target)! - 1;
      indegree.set(target, degree);
      if (degree === 0) ready.push(target);
    }
  }
  if (visited !== indegree.size)
    throw new Error("required and sequence relationships must be acyclic");
}

interface DirectorySnapshot {
  path: string;
  dev: number;
  ino: number;
  mode: number;
  nlink: number;
  size: number;
  mtimeMs: number;
  ctimeMs: number;
}

interface AnchoredDirectory {
  handle: Awaited<ReturnType<typeof open>>;
  path: string;
  snapshot: DirectorySnapshot;
}

function sameSnapshot(
  left: DirectorySnapshot,
  right: DirectorySnapshot,
): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.nlink === right.nlink &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs
  );
}

function snapshot(
  pathname: string,
  metadata: {
    dev: number;
    ino: number;
    mode: number;
    nlink: number;
    size: number;
    mtimeMs: number;
    ctimeMs: number;
  },
): DirectorySnapshot {
  return {
    path: pathname,
    dev: metadata.dev,
    ino: metadata.ino,
    mode: metadata.mode,
    nlink: metadata.nlink,
    size: metadata.size,
    mtimeMs: metadata.mtimeMs,
    ctimeMs: metadata.ctimeMs,
  };
}

async function verifyAnchoredDirectory(
  directory: AnchoredDirectory,
): Promise<void> {
  const descriptor = await directory.handle.stat();
  const current = await lstat(directory.path);
  if (
    !descriptor.isDirectory() ||
    !current.isDirectory() ||
    !sameSnapshot(directory.snapshot, snapshot(directory.path, descriptor)) ||
    !sameSnapshot(directory.snapshot, snapshot(directory.path, current))
  )
    throw new Error("Canon Pack directory changed while being read");
}

async function openAnchoredDirectory(
  location: string,
): Promise<AnchoredDirectory> {
  const rootPath = path.resolve(location);
  const before = await lstat(rootPath);
  if (!before.isDirectory())
    throw new Error("Canon Pack root must be a real directory");
  const rootSnapshot = snapshot(rootPath, before);
  const handle = await open(
    rootPath,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    const metadata = await handle.stat();
    if (
      !metadata.isDirectory() ||
      !sameSnapshot(rootSnapshot, snapshot(rootPath, metadata))
    )
      throw new Error("Canon Pack root must be a real, stable directory");
    const result = { handle, path: rootPath, snapshot: rootSnapshot };
    await verifyAnchoredDirectory(result);
    return result;
  } catch (error) {
    await handle.close();
    throw error;
  }
}

async function listMembers(root: AnchoredDirectory): Promise<string[]> {
  const members: string[] = [];
  await verifyAnchoredDirectory(root);
  const rootEntries = await readdir(root.path, { withFileTypes: true });
  await verifyAnchoredDirectory(root);
  for (const entry of rootEntries) {
    if (entry.isSymbolicLink())
      throw new Error(`Canon Pack member ${entry.name} is a symlink`);
    if (entry.isFile()) members.push(entry.name);
    else if (!entry.isDirectory() || entry.name !== "data")
      throw new Error(`unknown member directory ${entry.name}`);
  }
  const data = await openAnchoredDirectory(path.join(root.path, "data"));
  try {
    await verifyAnchoredDirectory(root);
    const dataEntries = await readdir(data.path, { withFileTypes: true });
    await verifyAnchoredDirectory(root);
    await verifyAnchoredDirectory(data);
    for (const entry of dataEntries) {
      if (entry.isSymbolicLink())
        throw new Error(`Canon Pack member data/${entry.name} is a symlink`);
      if (!entry.isFile())
        throw new Error(
          `Canon Pack member data/${entry.name} is not a regular file`,
        );
      members.push(`data/${entry.name}`);
    }
    await verifyAnchoredDirectory(root);
    await verifyAnchoredDirectory(data);
  } finally {
    await data.handle.close();
  }
  return members.sort();
}

async function readMember(
  root: AnchoredDirectory,
  member: string,
): Promise<Buffer> {
  const directory = member.startsWith("data/")
    ? await openAnchoredDirectory(path.join(root.path, "data"))
    : root;
  const filename = member.startsWith("data/") ? member.slice(5) : member;
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    const openedHandle = await open(
      path.join(directory.path, filename),
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    handle = openedHandle;
    await verifyAnchoredDirectory(root);
    await verifyAnchoredDirectory(directory);
    const before = await openedHandle.stat();
    if (
      !before.isFile() ||
      before.nlink !== 1 ||
      before.size > MAX_MEMBER_BYTES
    )
      throw new Error(
        `Canon Pack member ${member} is not an allowed-size regular file`,
      );
    const chunks: Buffer[] = [];
    let consumed = 0;
    while (consumed < before.size) {
      const chunk = Buffer.allocUnsafe(
        Math.min(64 * 1024, before.size - consumed),
      );
      const { bytesRead } = await openedHandle.read(
        chunk,
        0,
        chunk.length,
        null,
      );
      if (bytesRead === 0) break;
      chunks.push(chunk.subarray(0, bytesRead));
      consumed += bytesRead;
    }
    const after = await openedHandle.stat();
    await verifyAnchoredDirectory(root);
    await verifyAnchoredDirectory(directory);
    if (
      !after.isFile() ||
      after.nlink !== 1 ||
      after.size !== before.size ||
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs ||
      consumed !== before.size
    )
      throw new Error(`Canon Pack member ${member} changed while being read`);
    return Buffer.concat(chunks, consumed);
  } finally {
    if (handle) await handle.close();
    if (directory !== root) await directory.handle.close();
  }
}

export async function importCanonPackDirectory(
  directory: string,
): Promise<CanonPack> {
  if (!path.isAbsolute(directory))
    throw new Error("Canon Pack directory path must be absolute");
  const rootPath = path.resolve(directory);
  const root = await openAnchoredDirectory(rootPath);
  try {
    const members = await listMembers(root);
    for (const member of members) {
      if (!ALLOWED_MEMBERS.has(member))
        throw new Error(`unknown member ${member}`);
    }
    if (members.length > MAX_MEMBERS)
      throw new Error("Canon Pack has too many members");
    for (const member of ALLOWED_MEMBERS) {
      if (!members.includes(member))
        throw new Error(`Canon Pack is missing required member ${member}`);
    }

    const raw = new Map<string, Buffer>();
    let aggregateBytes = 0;
    for (const member of members) {
      const contents = await readMember(root, member);
      aggregateBytes += contents.length;
      if (aggregateBytes > MAX_AGGREGATE_BYTES)
        throw new Error("Canon Pack aggregate size exceeds limit");
      raw.set(member, contents);
    }
    const json = (member: string): JsonValue => {
      const contents = raw.get(member);
      if (!contents)
        throw new Error(`Canon Pack is missing required member ${member}`);
      return assertCanonicalJson(member, contents);
    };

    const manifest = closedObject(json("manifest.json"), "manifest", [
      "checksumAlgorithm",
      "contractVersion",
      "controlFiles",
      "packId",
      "packSlug",
      "packTitle",
      "packVersion",
    ]);
    if (
      string(manifest.checksumAlgorithm, "manifest.checksumAlgorithm") !==
      "sha256"
    )
      throw new Error("unsupported checksum algorithm");
    if (
      string(manifest.contractVersion, "manifest.contractVersion") !== "0.2.0"
    )
      throw new Error("incompatible contract version");
    const controls = closedObject(
      manifest.controlFiles,
      "manifest.controlFiles",
      ["checksums", "compatibility", "inventory"],
    );
    if (
      memberPath(controls.checksums, "manifest.controlFiles.checksums") !==
        "checksums.json" ||
      memberPath(
        controls.compatibility,
        "manifest.controlFiles.compatibility",
      ) !== "compatibility.json" ||
      memberPath(controls.inventory, "manifest.controlFiles.inventory") !==
        "inventory.json"
    )
      throw new Error("manifest control files are not recognized");

    const inventory = closedObject(json("inventory.json"), "inventory", [
      "files",
    ]);
    const inventoryMembers = new Set<string>();
    for (const [index, entry] of array(
      inventory.files,
      "inventory.files",
    ).entries()) {
      const record = closedObject(entry, `inventory.files[${index}]`, [
        "bytes",
        "mediaType",
        "path",
      ]);
      const member = memberPath(record.path, `inventory.files[${index}].path`);
      if (inventoryMembers.has(member))
        throw new Error(`duplicate member ${member} in inventory`);
      inventoryMembers.add(member);
      if (
        string(record.mediaType, `inventory.files[${index}].mediaType`) !==
        "application/json"
      )
        throw new Error(`unsupported media type for ${member}`);
      if (
        integer(record.bytes, `inventory.files[${index}].bytes`) !==
        raw.get(member)?.length
      )
        throw new Error(`inventory size mismatch for ${member}`);
    }
    const expectedInventory = new Set(
      [...ALLOWED_MEMBERS].filter(
        (item) => item !== "checksums.json" && item !== "inventory.json",
      ),
    );
    if (
      inventoryMembers.size !== expectedInventory.size ||
      [...expectedInventory].some((item) => !inventoryMembers.has(item))
    )
      throw new Error("inventory member set is not recognized");

    const checksums = closedObject(json("checksums.json"), "checksums", [
      "algorithm",
      "files",
    ]);
    if (string(checksums.algorithm, "checksums.algorithm") !== "sha256")
      throw new Error("unsupported checksum algorithm");
    const checksumMembers = new Set<string>();
    for (const [index, entry] of array(
      checksums.files,
      "checksums.files",
    ).entries()) {
      const record = closedObject(entry, `checksums.files[${index}]`, [
        "path",
        "sha256",
      ]);
      const member = memberPath(record.path, `checksums.files[${index}].path`);
      if (checksumMembers.has(member))
        throw new Error(`duplicate member ${member} in checksums`);
      checksumMembers.add(member);
      const expected = string(
        record.sha256,
        `checksums.files[${index}].sha256`,
      );
      if (!/^[0-9a-f]{64}$/.test(expected))
        throw new Error(`invalid checksum for ${member}`);
      const actual = createHash("sha256")
        .update(raw.get(member) ?? Buffer.alloc(0))
        .digest("hex");
      if (actual !== expected)
        throw new Error(`checksum mismatch for ${member}`);
    }
    const expectedChecksums = new Set(
      [...ALLOWED_MEMBERS].filter((item) => item !== "checksums.json"),
    );
    if (
      checksumMembers.size !== expectedChecksums.size ||
      [...expectedChecksums].some((item) => !checksumMembers.has(item))
    )
      throw new Error("checksum member set is not recognized");

    const compatibility = closedObject(
      json("compatibility.json"),
      "compatibility",
      ["authoringContract", "coreSchema", "releaseContract"],
    );
    if (
      string(
        compatibility.authoringContract,
        "compatibility.authoringContract",
      ) !== "0.2.0" ||
      string(compatibility.releaseContract, "compatibility.releaseContract") !==
        "0.2.0" ||
      string(compatibility.coreSchema, "compatibility.coreSchema") !==
        ">=0.2.0 <0.3.0"
    )
      throw new Error("incompatible contract");

    const pack = closedObject(json("data/pack.json"), "pack", [
      "compatibility",
      "id",
      "license",
      "owner",
      "projectRelationship",
      "scope",
      "slug",
      "sourcePolicy",
      "title",
      "version",
    ]);
    const packCompatibility = closedObject(
      pack.compatibility,
      "pack.compatibility",
      ["coreSchema"],
    );
    if (packCompatibility.coreSchema !== compatibility.coreSchema)
      throw new Error(
        "data/pack.json compatibility does not match release compatibility",
      );
    const packLicense = closedObject(pack.license, "pack.license", [
      "id",
      "url",
    ]);
    string(packLicense.id, "pack.license.id");
    string(packLicense.url, "pack.license.url");
    const owner = closedObject(pack.owner, "pack.owner", [
      "copyrightContact",
      "governanceUrl",
      "maintainers",
      "name",
      "provenancePolicyUrl",
      "repository",
      "securityContact",
      "takedownPolicyUrl",
    ]);
    for (const field of [
      "copyrightContact",
      "governanceUrl",
      "name",
      "provenancePolicyUrl",
      "repository",
      "securityContact",
      "takedownPolicyUrl",
    ])
      string(owner[field], `pack.owner.${field}`);
    for (const [index, maintainer] of array(
      owner.maintainers,
      "pack.owner.maintainers",
    ).entries())
      string(maintainer, `pack.owner.maintainers[${index}]`);
    const projectRelationship = closedObject(
      pack.projectRelationship,
      "pack.projectRelationship",
      ["endorsedByWatchTracker", "independentlyMaintained"],
    );
    if (
      projectRelationship.endorsedByWatchTracker !== false ||
      projectRelationship.independentlyMaintained !== true
    )
      throw new Error("invalid pack project relationship");
    const sourcePolicy = closedObject(pack.sourcePolicy, "pack.sourcePolicy", [
      "expressiveContent",
      "summary",
    ]);
    if (sourcePolicy.expressiveContent !== "prohibited-by-default")
      throw new Error("invalid pack source policy");
    string(sourcePolicy.summary, "pack.sourcePolicy.summary");
    string(pack.scope, "pack.scope");
    const identity: CanonPackIdentity = {
      id: uuid(manifest.packId, "manifest.packId"),
      slug: string(manifest.packSlug, "manifest.packSlug"),
      title: string(manifest.packTitle, "manifest.packTitle"),
      version: string(manifest.packVersion, "manifest.packVersion"),
    };
    if (
      pack.id !== identity.id ||
      pack.slug !== identity.slug ||
      pack.title !== identity.title ||
      pack.version !== identity.version
    )
      throw new Error("data/pack.json identity does not match manifest");

    const sources = sortedRecords(json("data/sources.json"), "sources").map(
      (entry, index) => {
        const record = closedObject(entry, `sources[${index}]`, [
          "citation",
          "id",
          "license",
          "retrievedAt",
          "slug",
          "sourceType",
          "title",
          "url",
        ]);
        const license = closedObject(
          record.license,
          `sources[${index}].license`,
          ["id", "url"],
        );
        string(license.id, `sources[${index}].license.id`);
        string(license.url, `sources[${index}].license.url`);
        string(record.citation, `sources[${index}].citation`);
        date(record.retrievedAt, `sources[${index}].retrievedAt`);
        if (
          ![
            "fictional-primary",
            "official",
            "open-dataset",
            "reference",
          ].includes(string(record.sourceType, `sources[${index}].sourceType`))
        )
          throw new Error(`invalid source type at sources[${index}]`);
        string(record.url, `sources[${index}].url`);
        return {
          id: uuid(record.id, `sources[${index}].id`),
          slug: string(record.slug, `sources[${index}].slug`),
          title: string(record.title, `sources[${index}].title`),
        };
      },
    );
    const sourceIds = ids(sources, "source");
    const watchableTypes = sortedRecords(
      json("data/watchable-types.json"),
      "watchableTypes",
    ).map((record, index) => {
      record = closedObject(record, `watchableTypes[${index}]`, [
        "canonicalUrn",
        "code",
        "displayWeight",
        "id",
        "label",
        "provenance",
      ]);
      generatedUrn(record, identity.id, `watchableTypes[${index}]`);
      sourceReferences(record, sourceIds, `watchableTypes[${index}]`);
      return {
        id: uuid(record.id, `watchableTypes[${index}].id`),
        code: string(record.code, `watchableTypes[${index}].code`),
        label: string(record.label, `watchableTypes[${index}].label`),
        displayWeight: (() => {
          const displayWeight = integer(
            record.displayWeight,
            `watchableTypes[${index}].displayWeight`,
          );
          if (displayWeight < 1)
            throw new Error(
              `watchableTypes[${index}].displayWeight must be positive`,
            );
          return displayWeight;
        })(),
      };
    });
    const typeIds = ids(watchableTypes, "watchable type");
    const containers = sortedRecords(
      json("data/containers.json"),
      "containers",
    ).map((record, index) => {
      record = closedObject(record, `containers[${index}]`, [
        "canonicalUrn",
        "id",
        "kind",
        "provenance",
        "slug",
        "title",
      ]);
      generatedUrn(record, identity.id, `containers[${index}]`);
      sourceReferences(record, sourceIds, `containers[${index}]`);
      return {
        id: uuid(record.id, `containers[${index}].id`),
        slug: string(record.slug, `containers[${index}].slug`),
        title: string(record.title, `containers[${index}].title`),
        kind: string(record.kind, `containers[${index}].kind`),
      };
    });
    const containerIds = ids(containers, "container");
    const rawWatchables = sortedRecords(
      json("data/watchables.json"),
      "watchables",
    );
    const watchables = rawWatchables.map((entry, index) => {
      const record = closedObject(
        entry,
        `watchables[${index}]`,
        [
          "canonicalUrn",
          "firstPublicRelease",
          "id",
          "provenance",
          "slug",
          "summary",
          "title",
          "watchableTypeId",
        ],
        [
          "aliases",
          "episodeNumber",
          "externalIdentifiers",
          "generatedPoster",
          "packOrder",
          "posterUrl",
          "queueReason",
          "runtimeMinutes",
          "seasonNumber",
          "series",
        ],
      );
      generatedUrn(record, identity.id, `watchables[${index}]`);
      sourceReferences(record, sourceIds, `watchables[${index}]`);
      const watchableTypeId = uuid(
        record.watchableTypeId,
        `watchables[${index}].watchableTypeId`,
      );
      if (!typeIds.has(watchableTypeId))
        throw new Error(
          `unresolved reference: watchable type ${watchableTypeId}`,
        );
      const release = closedObject(
        record.firstPublicRelease,
        `watchables[${index}].firstPublicRelease`,
        ["date", "precision", "provenance", "status"],
      );
      const releaseDate = date(
        release.date,
        `watchables[${index}].firstPublicRelease.date`,
      );
      if (
        !["day", "month", "year"].includes(
          string(
            release.precision,
            `watchables[${index}].firstPublicRelease.precision`,
          ),
        )
      )
        throw new Error(`invalid release precision in watchables[${index}]`);
      if (
        !["announced", "released", "unreleased"].includes(
          string(
            release.status,
            `watchables[${index}].firstPublicRelease.status`,
          ),
        )
      )
        throw new Error(`invalid release status in watchables[${index}]`);
      strictProvenance(
        release.provenance,
        sourceIds,
        `watchables[${index}].firstPublicRelease.provenance`,
      );
      const runtimeMinutes = integer(
        record.runtimeMinutes,
        `watchables[${index}].runtimeMinutes`,
      );
      if (runtimeMinutes < 1)
        throw new Error(`watchables[${index}].runtimeMinutes must be positive`);
      const series =
        record.series === undefined
          ? "Unclassified"
          : string(record.series, `watchables[${index}].series`);
      const summary = string(record.summary, `watchables[${index}].summary`);
      const optionalIdentity = (field: "seasonNumber" | "episodeNumber") => {
        if (record[field] === undefined) return undefined;
        const value = integer(record[field], `watchables[${index}].${field}`);
        if (value < 1)
          throw new Error(`watchables[${index}].${field} must be positive`);
        return value;
      };
      const aliases =
        record.aliases === undefined
          ? []
          : array(record.aliases, `watchables[${index}].aliases`).map(
              (alias, aliasIndex) =>
                string(alias, `watchables[${index}].aliases[${aliasIndex}]`),
            );
      const generatedPoster =
        record.generatedPoster === undefined ? false : record.generatedPoster;
      if (typeof generatedPoster !== "boolean")
        throw new Error(`watchables[${index}].generatedPoster must be boolean`);
      const queueReason =
        record.queueReason === undefined
          ? summary
          : string(record.queueReason, `watchables[${index}].queueReason`);
      let posterUrl: string | undefined;
      if (record.posterUrl !== undefined) {
        posterUrl = string(record.posterUrl, `watchables[${index}].posterUrl`);
        const parsed = new URL(posterUrl);
        if (
          parsed.protocol !== "https:" ||
          !["image.tmdb.org", "media.themoviedb.org"].includes(parsed.hostname)
        )
          throw new Error(
            `watchables[${index}].posterUrl must use an approved TMDB image host`,
          );
      }
      const seasonNumber = optionalIdentity("seasonNumber");
      const episodeNumber = optionalIdentity("episodeNumber");
      if ((seasonNumber === undefined) !== (episodeNumber === undefined))
        throw new Error(
          `watchables[${index}] season and episode identity must be supplied together`,
        );
      if (new Set(aliases).size !== aliases.length)
        throw new Error(`watchables[${index}] aliases must be unique`);
      const packOrder = optionalPositiveInteger(
        record.packOrder,
        `watchables[${index}].packOrder`,
      );
      if (record.externalIdentifiers !== undefined) {
        for (const [identifierIndex, identifier] of array(
          record.externalIdentifiers,
          `watchables[${index}].externalIdentifiers`,
        ).entries()) {
          const externalIdentifier = closedObject(
            identifier,
            `watchables[${index}].externalIdentifiers[${identifierIndex}]`,
            ["namespace", "provenance", "value"],
          );
          string(
            externalIdentifier.namespace,
            `watchables[${index}].externalIdentifiers[${identifierIndex}].namespace`,
          );
          string(
            externalIdentifier.value,
            `watchables[${index}].externalIdentifiers[${identifierIndex}].value`,
          );
          strictProvenance(
            externalIdentifier.provenance,
            sourceIds,
            `watchables[${index}].externalIdentifiers[${identifierIndex}].provenance`,
          );
        }
      }
      return {
        id: uuid(record.id, `watchables[${index}].id`),
        slug: string(record.slug, `watchables[${index}].slug`),
        title: string(record.title, `watchables[${index}].title`),
        summary,
        watchableTypeId,
        releaseDate,
        packOrder,
        runtimeMinutes,
        series,
        ...(seasonNumber === undefined
          ? {}
          : { seasonNumber, episodeNumber: episodeNumber as number }),
        aliases,
        generatedPoster,
        queueReason,
        ...(posterUrl === undefined ? {} : { posterUrl }),
      };
    });
    const watchableIds = ids(watchables, "watchable");
    const slugSet = new Set<string>();
    for (const watchable of watchables) {
      if (slugSet.has(watchable.slug))
        throw new Error(`duplicate watchable slug ${watchable.slug}`);
      slugSet.add(watchable.slug);
    }
    const explicitOrders = watchables.map((watchable) => watchable.packOrder);
    if (explicitOrders.some((order) => order !== undefined)) {
      if (explicitOrders.some((order) => order === undefined))
        throw new Error(
          "packOrder must be supplied for every watchable or none",
        );
      if (new Set(explicitOrders).size !== explicitOrders.length)
        throw new Error("duplicate watchable packOrder");
      watchables.sort((left, right) => left.packOrder! - right.packOrder!);
    } else {
      watchables.sort(
        (left, right) =>
          left.releaseDate.localeCompare(right.releaseDate) ||
          left.slug.localeCompare(right.slug),
      );
    }
    const orderedWatchables = watchables.map((watchable, index) => ({
      ...watchable,
      releaseOrder: index + 1,
    }));

    const memberships = sortedRecords(
      json("data/memberships.json"),
      "memberships",
    ).map((record, index) => {
      record = closedObject(
        record,
        `memberships[${index}]`,
        ["containerId", "id", "memberId", "provenance", "role"],
        ["position"],
      );
      sourceReferences(record, sourceIds, `memberships[${index}]`);
      const containerId = uuid(
        record.containerId,
        `memberships[${index}].containerId`,
      );
      const memberId = uuid(record.memberId, `memberships[${index}].memberId`);
      if (
        !containerIds.has(containerId) ||
        (!containerIds.has(memberId) && !watchableIds.has(memberId))
      )
        throw new Error(`unresolved reference in membership ${index}`);
      const position = optionalPositiveInteger(
        record.position,
        `memberships[${index}].position`,
      );
      return {
        id: uuid(record.id, `memberships[${index}].id`),
        containerId,
        memberId,
        ...(position === undefined ? {} : { position }),
        role: string(record.role, `memberships[${index}].role`),
      };
    });
    ids(memberships, "membership");
    const relationships = sortedRecords(
      json("data/relationships.json"),
      "relationships",
    ).map((record, index) => {
      record = closedObject(record, `relationships[${index}]`, [
        "id",
        "prerequisiteId",
        "provenance",
        "summary",
        "type",
        "watchableId",
      ]);
      sourceReferences(record, sourceIds, `relationships[${index}]`);
      const watchableId = uuid(
        record.watchableId,
        `relationships[${index}].watchableId`,
      );
      const prerequisiteId = uuid(
        record.prerequisiteId,
        `relationships[${index}].prerequisiteId`,
      );
      if (!watchableIds.has(watchableId) || !watchableIds.has(prerequisiteId))
        throw new Error(`unresolved reference in relationship ${index}`);
      return {
        id: uuid(record.id, `relationships[${index}].id`),
        watchableId,
        prerequisiteId,
        type: string(record.type, `relationships[${index}].type`),
        summary: string(record.summary, `relationships[${index}].summary`),
      };
    });
    ids(relationships, "relationship");

    const allIds = [
      identity.id,
      ...sources.map((record) => record.id),
      ...watchableTypes.map((record) => record.id),
      ...containers.map((record) => record.id),
      ...watchables.map((record) => record.id),
      ...memberships.map((record) => record.id),
      ...relationships.map((record) => record.id),
    ];
    if (new Set(allIds).size !== allIds.length)
      throw new Error("immutable record IDs must be globally unique");
    if (new Set(sources.map((source) => source.slug)).size !== sources.length)
      throw new Error("duplicate source slug");
    if (
      new Set(watchableTypes.map((type) => type.code)).size !==
      watchableTypes.length
    )
      throw new Error("duplicate watchable type code");
    for (const code of ["movie", "episode", "special", "short"])
      if (!watchableTypes.some((type) => type.code === code))
        throw new Error(`missing required watchable type ${code}`);
    for (const type of watchableTypes)
      if (type.displayWeight < 0)
        throw new Error("watchable type display weight must be non-negative");
    for (const container of containers)
      if (container.kind !== "series" && container.kind !== "season")
        throw new Error(`invalid container kind ${container.kind}`);
    const containersById = new Map(
      containers.map((container) => [container.id, container]),
    );
    const primaryMemberships = new Set<string>();
    for (const membership of memberships) {
      const container = containersById.get(membership.containerId)!;
      const allowedMember =
        watchableIds.has(membership.memberId) ||
        containersById.get(membership.memberId)?.kind === "season";
      if (!allowedMember)
        throw new Error("membership member must be a watchable or season");
      const expectsSeason = membership.role === "primary-season";
      if (
        (expectsSeason && container.kind !== "season") ||
        (!expectsSeason && container.kind !== "series")
      )
        throw new Error("membership role does not match container kind");
      if (
        !["primary-series", "primary-season", "secondary-series"].includes(
          membership.role,
        )
      )
        throw new Error("invalid membership role");
      if (membership.role.startsWith("primary-")) {
        const key = `${membership.memberId}:${membership.role}`;
        if (primaryMemberships.has(key))
          throw new Error("duplicate primary membership");
        primaryMemberships.add(key);
      }
    }
    const logicalRelationships = new Set<string>();
    for (const relationship of relationships) {
      if (
        ![
          "required",
          "recommended",
          "sequence",
          "optional-connection",
        ].includes(relationship.type)
      )
        throw new Error("invalid relationship type");
      if (relationship.watchableId === relationship.prerequisiteId)
        throw new Error("relationship cannot self-reference");
      const key = `${relationship.type}:${relationship.prerequisiteId}:${relationship.watchableId}`;
      if (logicalRelationships.has(key))
        throw new Error("duplicate logical relationship");
      logicalRelationships.add(key);
    }
    requireGraphAcyclic(relationships);

    return {
      identity,
      manifestSha256: createHash("sha256")
        .update(raw.get("manifest.json") ?? Buffer.alloc(0))
        .digest("hex"),
      checksumsSha256: createHash("sha256")
        .update(raw.get("checksums.json") ?? Buffer.alloc(0))
        .digest("hex"),
      sourcePath: rootPath,
      verification: {
        fileCount: members.length,
        totalBytes: aggregateBytes,
        verified: true,
      },
      sources,
      watchableTypes,
      containers,
      watchables: orderedWatchables,
      memberships,
      relationships,
    };
  } finally {
    await root.handle.close();
  }
}
