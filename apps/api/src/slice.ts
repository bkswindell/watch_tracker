import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import path from "node:path";

import type { Pool } from "pg";

import type {
  CatalogAddition,
  CatalogAdditionInput,
} from "../../../packages/contracts/src/catalog.js";
import { importCanonPackDirectory, type CanonPack } from "./canon-pack.js";

export type ViewingState = "not-started" | "in-progress" | "watched";

export interface CatalogRelationship {
  type: string;
  direction: "requires" | "required-by";
  referencedWatchable: { id: string; slug: string; title: string };
  summary: string;
}

export interface CatalogItem {
  slug: string;
  title: string;
  type: string;
  summary: string;
  releaseOrder: number;
  releaseDate: string;
  runtime: number;
  series: string;
  seasonNumber?: number;
  episodeNumber?: number;
  aliases: string[];
  why: string;
  poster: boolean;
  posterUrl?: string;
  state: ViewingState;
  relationships: CatalogRelationship[];
}

export interface WorkspaceRelationship {
  fromSlug: string;
  toSlug: string;
  type: "required" | "sequence" | "recommended" | "optional";
  summary: string;
}

export interface WorkspaceNextUp extends CatalogItem {
  reason: "next-in-order" | "focus" | "unblocked";
  blockingSummary: string | null;
}

export interface WorkspaceHistory {
  slug: string;
  title: string;
  completedAt: string;
  action: "completed" | "discarded";
  duration: number | null;
  rating: number | null;
}

export interface WorkspacePack {
  title: string;
  version: string;
  manifestSha256: string;
  checksumsSha256: string;
  inventoryFileCount: number | null;
  inventoryTotalBytes: number | null;
  verificationStatus: "verified" | "rejected" | null;
}

export interface WorkspaceAggregate {
  items: (CatalogItem & {
    rating: number | null;
    feedback: string | null;
    media: null;
  })[];
  relationships: WorkspaceRelationship[];
  targetSlug: string | null;
  nextUp: WorkspaceNextUp[];
  history: WorkspaceHistory[];
  pack: WorkspacePack | null;
}

export interface SliceSession {
  token: string;
  csrfToken: string;
  trackerInstanceId: string;
}

export interface SliceStore {
  needsSetup(): Promise<boolean>;
  setup(): Promise<boolean>;
  authenticate(password: string): Promise<boolean>;
  createSession(): Promise<SliceSession>;
  getSession(
    token: string,
  ): Promise<{ csrfToken: string; trackerInstanceId: string } | undefined>;
  validateCsrf(token: string, csrfToken: string): Promise<boolean>;
  importLanternVale(): Promise<{ title: string; version: string }>;
  catalog(options?: {
    search?: string | undefined;
    type?: string | undefined;
  }): Promise<CatalogItem[]>;
  catalogTypes(): Promise<string[]>;
  item(slug: string): Promise<CatalogItem | undefined>;
  setFocus(targetSlug: string): Promise<CatalogItem | undefined>;
  nextUp(): Promise<CatalogItem | undefined>;
  workspace(): Promise<WorkspaceAggregate>;
  viewingAction(
    slug: string,
    action: "start" | "complete" | "discard" | "repeat",
  ): Promise<CatalogItem | undefined>;
  catalogAdditions(trackerInstanceId: string): Promise<CatalogAddition[]>;
  catalogAddition(
    trackerInstanceId: string,
    id: string,
  ): Promise<CatalogAddition | undefined>;
  createCatalogAddition(
    trackerInstanceId: string,
    input: CatalogAdditionInput,
  ): Promise<CatalogAddition>;
  updateCatalogAddition(
    trackerInstanceId: string,
    id: string,
    input: CatalogAdditionInput,
  ): Promise<CatalogAddition | undefined>;
  deleteCatalogAddition(
    trackerInstanceId: string,
    id: string,
  ): Promise<boolean>;
}

type ImportedItem = Omit<CatalogItem, "state">;

export { importCanonPackDirectory } from "./canon-pack.js";

export const DEFAULT_CANON_PACK_PATH = "/app/canon-packs/lantern-vale-0.2.3";

function defaultCanonPackPath(): string {
  return process.env.NODE_TEST_CONTEXT !== undefined
    ? path.resolve("canon-packs/lantern-vale-0.2.3")
    : DEFAULT_CANON_PACK_PATH;
}

/** The only release Core is authorized to activate in this preview. */
export const ACCEPTED_LANTERN_VALE_RELEASE = Object.freeze({
  id: "01954123-0000-7000-8000-000000000001",
  slug: "lantern-vale",
  title: "Lantern Vale Stories",
  version: "0.2.3",
  manifestSha256:
    "46db676c02d19980ac633c3e01e4c803f610c5d000b672d93c02751aac09d11c",
  checksumsSha256:
    "c97ba7b2deb02a4c22dace31178dd3411aebd0cd45ad90bc50d68df1327ce620",
});

async function importAcceptedLanternVale(
  directory: string,
): Promise<CanonPack> {
  const pack = await importCanonPackDirectory(directory);
  const accepted = ACCEPTED_LANTERN_VALE_RELEASE;
  if (
    pack.identity.id !== accepted.id ||
    pack.identity.slug !== accepted.slug ||
    pack.identity.title !== accepted.title ||
    pack.identity.version !== accepted.version ||
    pack.manifestSha256 !== accepted.manifestSha256 ||
    pack.checksumsSha256 !== accepted.checksumsSha256
  ) {
    throw new Error("Canon Pack is not an accepted Canon Pack release");
  }
  return pack;
}

function projection(pack: CanonPack): ImportedItem[] {
  const watchables = new Map(
    pack.watchables.map((watchable) => [watchable.id, watchable]),
  );
  return pack.watchables.map((watchable) => ({
    slug: watchable.slug,
    title: watchable.title,
    type:
      pack.watchableTypes.find((type) => type.id === watchable.watchableTypeId)
        ?.code ?? "unknown",
    summary: watchable.summary,
    releaseOrder: watchable.releaseOrder,
    releaseDate: watchable.releaseDate,
    runtime: watchable.runtimeMinutes,
    series: watchable.series,
    ...(watchable.seasonNumber === undefined
      ? {}
      : {
          seasonNumber: watchable.seasonNumber,
          episodeNumber: watchable.episodeNumber,
        }),
    aliases: watchable.aliases,
    why: watchable.queueReason,
    poster: watchable.generatedPoster,
    ...(watchable.posterUrl === undefined
      ? {}
      : { posterUrl: watchable.posterUrl }),
    relationships: pack.relationships
      .filter(
        (relationship) =>
          relationship.watchableId === watchable.id ||
          relationship.prerequisiteId === watchable.id,
      )
      .map((relationship) => {
        const requires = relationship.watchableId === watchable.id;
        const referenced = watchables.get(
          requires ? relationship.prerequisiteId : relationship.watchableId,
        );
        if (!referenced)
          throw new Error("relationship references unknown watchable");
        return {
          type: relationship.type,
          direction: requires ? "requires" : "required-by",
          referencedWatchable: {
            id: referenced.id,
            slug: referenced.slug,
            title: referenced.title,
          },
          summary: relationship.summary,
        };
      }),
  }));
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function credentialHash(
  password: string,
  salt = randomBytes(16).toString("hex"),
): string {
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

function credentialMatches(password: string, stored: string): boolean {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const actual = scryptSync(password, salt, 64).toString("hex");
  return (
    actual.length === expected.length &&
    timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
  );
}

function newSession(trackerInstanceId: string): SliceSession {
  return {
    token: randomBytes(32).toString("hex"),
    csrfToken: randomBytes(32).toString("hex"),
    trackerInstanceId,
  };
}

function stateFor(status?: string): ViewingState {
  if (status === "active") return "in-progress";
  if (status === "completed") return "watched";
  return "not-started";
}

function relationshipType(type: string): WorkspaceRelationship["type"] {
  return type === "optional-connection"
    ? "optional"
    : (type as WorkspaceRelationship["type"]);
}

function workspaceFromCatalog(
  items: CatalogItem[],
  targetSlug: string | null,
  pack: WorkspacePack | null,
  history: WorkspaceHistory[],
  projectedRelationships?: WorkspaceRelationship[],
): WorkspaceAggregate {
  const relationships = [
    ...(projectedRelationships ??
      items.flatMap((item) =>
        item.relationships.flatMap((relationship) => {
          const fromSlug =
            relationship.direction === "requires"
              ? relationship.referencedWatchable.slug
              : item.slug;
          const toSlug =
            relationship.direction === "requires"
              ? item.slug
              : relationship.referencedWatchable.slug;
          return [
            {
              fromSlug,
              toSlug,
              type: relationshipType(relationship.type),
              summary: relationship.summary,
            },
          ];
        }),
      )),
  ].filter(
    (relationship, index, all) =>
      all.findIndex(
        (candidate) =>
          candidate.fromSlug === relationship.fromSlug &&
          candidate.toSlug === relationship.toSlug &&
          candidate.type === relationship.type &&
          candidate.summary === relationship.summary,
      ) === index,
  );
  const bySlug = new Map(items.map((item) => [item.slug, item]));
  const resolvedTarget =
    (targetSlug && bySlug.has(targetSlug) ? targetSlug : items.at(-1)?.slug) ??
    null;
  const route = new Set<string>(resolvedTarget ? [resolvedTarget] : []);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const relationship of relationships) {
      if (
        relationship.type !== "optional" &&
        route.has(relationship.toSlug) &&
        !route.has(relationship.fromSlug)
      ) {
        route.add(relationship.fromSlug);
        expanded = true;
      }
    }
  }
  const nextUp: WorkspaceNextUp[] = items
    .filter((item) => route.has(item.slug))
    .map((item) => {
      const required = relationships.filter(
        (r) => r.toSlug === item.slug && r.type === "required",
      );
      const blocked = required.find(
        (r) => bySlug.get(r.fromSlug)?.state !== "watched",
      );
      return {
        ...item,
        reason: (item.slug === resolvedTarget
          ? "focus"
          : blocked
            ? "unblocked"
            : "next-in-order") as WorkspaceNextUp["reason"],
        blockingSummary: blocked?.summary ?? null,
      };
    });
  return {
    items: items.map((item) => ({
      ...item,
      rating: null,
      feedback: null,
      media: null,
    })),
    relationships,
    targetSlug,
    nextUp,
    history,
    pack,
  };
}

function escapeSqlLike(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
}

export class MemorySliceStore implements SliceStore {
  #configuredPassword: string | undefined;
  #credential: string | undefined;
  #trackerInstanceId = randomUUID();
  #sessions = new Map<
    string,
    { csrfToken: string; trackerInstanceId: string }
  >();
  #additions = new Map<string, CatalogAddition>();
  #items = new Map<string, ImportedItem>();
  #types: string[] = [];
  #states = new Map<string, string>();
  #focus?: string;
  #history: WorkspaceHistory[] = [];
  #pack: WorkspacePack | null = null;
  #packPath: string;
  #faultAfterStage: (() => boolean) | undefined;

  constructor(
    options: {
      initialPassword?: string;
      packPath?: string;
      faultAfterStage?: () => boolean;
    } = {},
  ) {
    if (options.initialPassword !== undefined)
      this.#configuredPassword = options.initialPassword;
    this.#packPath = options.packPath ?? defaultCanonPackPath();
    this.#faultAfterStage = options.faultAfterStage;
  }

  async needsSetup(): Promise<boolean> {
    return this.#credential === undefined;
  }
  async setup(): Promise<boolean> {
    if (this.#credential !== undefined || !this.#configuredPassword)
      return false;
    this.#credential = credentialHash(this.#configuredPassword);
    this.#configuredPassword = undefined;
    return true;
  }
  async authenticate(password: string): Promise<boolean> {
    return (
      this.#credential !== undefined &&
      credentialMatches(password, this.#credential)
    );
  }
  async createSession(): Promise<SliceSession> {
    const session = newSession(this.#trackerInstanceId);
    this.#sessions.set(session.token, {
      csrfToken: session.csrfToken,
      trackerInstanceId: session.trackerInstanceId,
    });
    return session;
  }
  async getSession(
    token: string,
  ): Promise<{ csrfToken: string; trackerInstanceId: string } | undefined> {
    return this.#sessions.get(token);
  }
  async validateCsrf(token: string, csrfToken: string): Promise<boolean> {
    return this.#sessions.get(token)?.csrfToken === csrfToken;
  }
  async importLanternVale(): Promise<{ title: string; version: string }> {
    const pack = await importAcceptedLanternVale(this.#packPath);
    const staged = new Map(projection(pack).map((item) => [item.slug, item]));
    if (this.#faultAfterStage?.()) throw new Error("injected activation fault");
    this.#items = staged;
    this.#types = pack.watchableTypes.map((type) => type.code);
    this.#pack = {
      title: pack.identity.title,
      version: pack.identity.version,
      manifestSha256: pack.manifestSha256,
      checksumsSha256: pack.checksumsSha256,
      inventoryFileCount: pack.verification.fileCount,
      inventoryTotalBytes: pack.verification.totalBytes,
      verificationStatus: pack.verification.verified ? "verified" : "rejected",
    };
    return { title: pack.identity.title, version: pack.identity.version };
  }
  async catalog(
    options: { search?: string | undefined; type?: string | undefined } = {},
  ): Promise<CatalogItem[]> {
    const search = options.search?.trim().toLowerCase();
    return [...this.#items.values()]
      .filter((item) => !options.type || item.type === options.type)
      .filter(
        (item) =>
          !search ||
          `${item.title} ${item.summary}`.toLowerCase().includes(search),
      )
      .sort((a, b) => a.releaseOrder - b.releaseOrder)
      .map((item) => ({
        ...item,
        state: stateFor(this.#states.get(item.slug)),
      }));
  }
  async catalogTypes(): Promise<string[]> {
    return [...this.#types];
  }
  async item(slug: string): Promise<CatalogItem | undefined> {
    const item = this.#items.get(slug);
    return item
      ? { ...item, state: stateFor(this.#states.get(slug)) }
      : undefined;
  }
  async setFocus(targetSlug: string): Promise<CatalogItem | undefined> {
    if (!this.#items.has(targetSlug)) return undefined;
    this.#focus = targetSlug;
    return this.nextUp();
  }
  async nextUp(): Promise<CatalogItem | undefined> {
    const items = await this.catalog();
    const target = this.#focus
      ? items.findIndex((item) => item.slug === this.#focus)
      : items.length - 1;
    return items.slice(0, target + 1).find((item) => item.state !== "watched");
  }
  async workspace(): Promise<WorkspaceAggregate> {
    const items = await Promise.all(
      [...this.#items.keys()].map((slug) => this.item(slug)),
    );
    return workspaceFromCatalog(
      items.filter((item): item is CatalogItem => item !== undefined),
      this.#focus ?? null,
      this.#pack,
      this.#history.slice(0, 20),
    );
  }
  async viewingAction(
    slug: string,
    action: "start" | "complete" | "discard" | "repeat",
  ): Promise<CatalogItem | undefined> {
    if (!this.#items.has(slug)) return undefined;
    this.#states.set(
      slug,
      action === "complete"
        ? "completed"
        : action === "discard"
          ? "discarded"
          : "active",
    );
    if (action === "complete" || action === "discard") {
      const item = this.#items.get(slug);
      if (item)
        this.#history.unshift({
          slug,
          title: item.title,
          completedAt: new Date().toISOString(),
          action: action === "complete" ? "completed" : "discarded",
          duration: action === "complete" ? item.runtime : null,
          rating: null,
        });
    }
    return this.item(slug);
  }
  async catalogAdditions(
    trackerInstanceId: string,
  ): Promise<CatalogAddition[]> {
    return [...this.#additions.entries()]
      .filter(([key]) => key.startsWith(`${trackerInstanceId}:`))
      .map(([key, addition]) => ({
        ...addition,
        id: key.slice(trackerInstanceId.length + 1),
      }))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }
  async catalogAddition(
    trackerInstanceId: string,
    id: string,
  ): Promise<CatalogAddition | undefined> {
    const addition = this.#additions.get(`${trackerInstanceId}:${id}`);
    return addition ? { ...addition, id } : undefined;
  }
  async createCatalogAddition(
    trackerInstanceId: string,
    input: CatalogAdditionInput,
  ): Promise<CatalogAddition> {
    if (
      [...this.#additions.entries()].some(
        ([key, addition]) =>
          key.startsWith(`${trackerInstanceId}:`) &&
          addition.slug === input.slug,
      )
    )
      throw Object.assign(new Error("Catalog addition slug already exists"), {
        code: "23505",
      });
    const id = randomUUID();
    const timestamp = new Date().toISOString();
    const addition = {
      ...input,
      id,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.#additions.set(`${trackerInstanceId}:${id}`, addition);
    return addition;
  }
  async updateCatalogAddition(
    trackerInstanceId: string,
    id: string,
    input: CatalogAdditionInput,
  ): Promise<CatalogAddition | undefined> {
    const key = `${trackerInstanceId}:${id}`;
    const existing = this.#additions.get(key);
    if (!existing) return undefined;
    if (
      [...this.#additions.entries()].some(
        ([candidateKey, addition]) =>
          candidateKey !== key &&
          candidateKey.startsWith(`${trackerInstanceId}:`) &&
          addition.slug === input.slug,
      )
    )
      throw Object.assign(new Error("Catalog addition slug already exists"), {
        code: "23505",
      });
    const updated = {
      ...input,
      id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    this.#additions.set(key, updated);
    return updated;
  }
  async deleteCatalogAddition(
    trackerInstanceId: string,
    id: string,
  ): Promise<boolean> {
    return this.#additions.delete(`${trackerInstanceId}:${id}`);
  }
}

export class SqlSliceStore implements SliceStore {
  #initialPassword: string | undefined = undefined;
  #packPath: string;
  #faultAfterStage: (() => boolean) | undefined;
  constructor(
    private readonly pool: Pool,
    initialPassword?: string,
    options: { packPath?: string; faultAfterStage?: () => boolean } = {},
  ) {
    if (initialPassword !== undefined) this.#initialPassword = initialPassword;
    this.#packPath = options.packPath ?? defaultCanonPackPath();
    this.#faultAfterStage = options.faultAfterStage;
  }
  async needsSetup(): Promise<boolean> {
    return (
      (
        await this.pool.query(
          "SELECT 1 FROM installation_setup WHERE singleton = true",
        )
      ).rowCount === 0
    );
  }
  async setup(): Promise<boolean> {
    const initialPassword = this.#initialPassword;
    if (!initialPassword) return false;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("LOCK TABLE installation_setup IN EXCLUSIVE MODE");
      const configured = await client.query(
        "SELECT 1 FROM installation_setup WHERE singleton = true",
      );
      if (configured.rowCount) {
        await client.query("ROLLBACK");
        return false;
      }
      const instance = await client.query<{ tracker_instance_id: string }>(
        "INSERT INTO tracker_instance (display_name, credential_hash, setup_completed_at) VALUES ('Local admin', $1, CURRENT_TIMESTAMP) RETURNING tracker_instance_id",
        [credentialHash(initialPassword)],
      );
      const trackerInstanceId = instance.rows[0]?.tracker_instance_id;
      if (!trackerInstanceId)
        throw new Error("setup did not create a tracker instance");
      await client.query(
        "INSERT INTO installation_setup (singleton, tracker_instance_id) VALUES (true, $1)",
        [trackerInstanceId],
      );
      await client.query("COMMIT");
      this.#initialPassword = undefined;
      return true;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
  async authenticate(password: string): Promise<boolean> {
    const result = await this.pool.query<{ credential_hash: string }>(
      "SELECT instance.credential_hash FROM tracker_instance instance JOIN installation_setup setup ON setup.tracker_instance_id = instance.tracker_instance_id WHERE setup.singleton = true",
    );
    return result.rows[0]?.credential_hash
      ? credentialMatches(password, result.rows[0].credential_hash)
      : false;
  }
  async createSession(): Promise<SliceSession> {
    const setup = await this.pool.query<{ tracker_instance_id: string }>(
      "SELECT tracker_instance_id FROM installation_setup WHERE singleton = true",
    );
    const trackerInstanceId = setup.rows[0]?.tracker_instance_id;
    if (!trackerInstanceId) throw new Error("setup is not complete");
    const session = newSession(trackerInstanceId);
    await this.pool.query(
      "INSERT INTO app_session (token_sha256, csrf_token, csrf_sha256, tracker_instance_id, expires_at) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP + INTERVAL '7 days')",
      [
        digest(session.token),
        session.csrfToken,
        digest(session.csrfToken),
        session.trackerInstanceId,
      ],
    );
    return session;
  }
  async getSession(
    token: string,
  ): Promise<{ csrfToken: string; trackerInstanceId: string } | undefined> {
    const result = await this.pool.query<{
      csrfToken: string;
      trackerInstanceId: string;
    }>(
      'SELECT csrf_token AS "csrfToken", tracker_instance_id AS "trackerInstanceId" FROM app_session WHERE token_sha256 = $1 AND expires_at > CURRENT_TIMESTAMP',
      [digest(token)],
    );
    return result.rows[0];
  }
  async validateCsrf(token: string, csrfToken: string): Promise<boolean> {
    const result = await this.pool.query(
      "SELECT 1 FROM app_session WHERE token_sha256 = $1 AND csrf_sha256 = $2 AND expires_at > CURRENT_TIMESTAMP",
      [digest(token), digest(csrfToken)],
    );
    return result.rowCount === 1;
  }
  async importLanternVale(): Promise<{ title: string; version: string }> {
    const pack = await importAcceptedLanternVale(this.#packPath);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query<{
        canon_pack_release_id: string;
        manifest_sha256: string;
        checksums_sha256: string | null;
      }>(
        "SELECT canon_pack_release_id, manifest_sha256, checksums_sha256 FROM canon_pack_release WHERE pack_id = $1 AND pack_version = $2",
        [pack.identity.id, pack.identity.version],
      );
      let releaseId = existing.rows[0]?.canon_pack_release_id;
      if (
        existing.rows[0] &&
        (existing.rows[0].manifest_sha256 !== pack.manifestSha256 ||
          existing.rows[0].checksums_sha256 !== pack.checksumsSha256)
      )
        throw new Error(
          "immutable Canon Pack release identity has a different manifest",
        );
      if (!releaseId) {
        const created = await client.query<{ canon_pack_release_id: string }>(
          "INSERT INTO canon_pack_release (pack_id, pack_slug, pack_title, pack_version, contract_version, manifest_sha256, checksums_sha256, source_path, inventory_file_count, inventory_total_bytes, verification_status) VALUES ($1, $2, $3, $4, '0.2.0', $5, $6, $7, $8, $9, $10) RETURNING canon_pack_release_id",
          [
            pack.identity.id,
            pack.identity.slug,
            pack.identity.title,
            pack.identity.version,
            pack.manifestSha256,
            pack.checksumsSha256,
            pack.sourcePath,
            pack.verification.fileCount,
            pack.verification.totalBytes,
            pack.verification.verified ? "verified" : "rejected",
          ],
        );
        releaseId = created.rows[0]?.canon_pack_release_id;
        if (!releaseId)
          throw new Error("Canon Pack staging did not create a release");
        for (const source of pack.sources)
          await client.query(
            "INSERT INTO canon_pack_source (canon_pack_release_id, source_id, slug, title) VALUES ($1, $2, $3, $4)",
            [releaseId, source.id, source.slug, source.title],
          );
        for (const type of pack.watchableTypes)
          await client.query(
            "INSERT INTO canon_pack_watchable_type (canon_pack_release_id, watchable_type_id, code, label, display_weight) VALUES ($1, $2, $3, $4, $5)",
            [releaseId, type.id, type.code, type.label, type.displayWeight],
          );
        for (const container of pack.containers)
          await client.query(
            "INSERT INTO canon_pack_container (canon_pack_release_id, container_id, slug, title, kind) VALUES ($1, $2, $3, $4, $5)",
            [
              releaseId,
              container.id,
              container.slug,
              container.title,
              container.kind,
            ],
          );
        for (const watchable of pack.watchables)
          await client.query(
            "INSERT INTO canon_pack_watchable (canon_pack_release_id, watchable_id, slug, title, summary, watchable_type_id, release_date, release_order, runtime_minutes, primary_series, season_number, episode_number, aliases, generated_poster, queue_reason, poster_url) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)",
            [
              releaseId,
              watchable.id,
              watchable.slug,
              watchable.title,
              watchable.summary,
              watchable.watchableTypeId,
              watchable.releaseDate,
              watchable.releaseOrder,
              watchable.runtimeMinutes,
              watchable.series,
              watchable.seasonNumber ?? null,
              watchable.episodeNumber ?? null,
              watchable.aliases,
              watchable.generatedPoster,
              watchable.queueReason,
              watchable.posterUrl ?? null,
            ],
          );
        for (const membership of pack.memberships)
          await client.query(
            "INSERT INTO canon_pack_membership (canon_pack_release_id, membership_id, container_id, member_id, position, role) VALUES ($1, $2, $3, $4, $5, $6)",
            [
              releaseId,
              membership.id,
              membership.containerId,
              membership.memberId,
              membership.position,
              membership.role,
            ],
          );
        for (const relationship of pack.relationships)
          await client.query(
            "INSERT INTO canon_pack_relationship (canon_pack_release_id, relationship_id, watchable_id, prerequisite_id, relationship_type, summary) VALUES ($1, $2, $3, $4, $5, $6)",
            [
              releaseId,
              relationship.id,
              relationship.watchableId,
              relationship.prerequisiteId,
              relationship.type,
              relationship.summary,
            ],
          );
      }
      await client.query(
        "INSERT INTO canon_pack_import (canon_pack_release_id, manifest_sha256, source_path) VALUES ($1, $2, $3)",
        [releaseId, pack.manifestSha256, pack.sourcePath],
      );
      if (this.#faultAfterStage?.())
        throw new Error("injected activation fault");
      await client.query(
        "INSERT INTO active_canon_pack_registry (singleton, canon_pack_release_id) VALUES (true, $1) ON CONFLICT (singleton) DO UPDATE SET canon_pack_release_id = EXCLUDED.canon_pack_release_id, activated_at = CURRENT_TIMESTAMP",
        [releaseId],
      );
      await client.query("COMMIT");
      return { title: pack.identity.title, version: pack.identity.version };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
  async catalog(
    options: { search?: string | undefined; type?: string | undefined } = {},
  ): Promise<CatalogItem[]> {
    const values: string[] = [];
    const clauses = [
      "watchable.canon_pack_release_id = active.canon_pack_release_id",
    ];
    const search = options.search?.trim();
    if (search) {
      values.push(`%${escapeSqlLike(search)}%`);
      clauses.push(
        `(watchable.title ILIKE $${values.length} ESCAPE '\\' OR watchable.summary ILIKE $${values.length} ESCAPE '\\')`,
      );
    }
    if (options.type) {
      values.push(options.type);
      clauses.push(`type.code = $${values.length}`);
    }
    const result = await this.pool.query<Omit<CatalogItem, "relationships">>(
      `SELECT watchable.slug, watchable.title, type.code AS type, watchable.summary,
              watchable.release_order AS "releaseOrder", watchable.release_date::text AS "releaseDate",
              watchable.runtime_minutes AS runtime, watchable.primary_series AS series,
              watchable.season_number AS "seasonNumber", watchable.episode_number AS "episodeNumber",
              watchable.aliases, watchable.queue_reason AS why,
              watchable.generated_poster AS poster, watchable.poster_url AS "posterUrl",
              CASE latest_attempt.status WHEN 'active' THEN 'in-progress' WHEN 'completed' THEN 'watched' ELSE 'not-started' END AS state
         FROM active_canon_pack_registry active
         JOIN canon_pack_watchable watchable ON watchable.canon_pack_release_id = active.canon_pack_release_id
         JOIN canon_pack_watchable_type type ON type.canon_pack_release_id = watchable.canon_pack_release_id AND type.watchable_type_id = watchable.watchable_type_id
         LEFT JOIN LATERAL (
           SELECT attempt.status FROM canon_pack_viewing_attempt attempt
            WHERE attempt.canon_pack_release_id = active.canon_pack_release_id AND attempt.watchable_id = watchable.watchable_id
            ORDER BY attempt.created_at DESC LIMIT 1
         ) latest_attempt ON true
        WHERE ${clauses.join(" AND ")}
        ORDER BY watchable.release_order`,
      values,
    );
    return result.rows.map((item) => ({ ...item, relationships: [] }));
  }
  async catalogTypes(): Promise<string[]> {
    const result = await this.pool.query<{ code: string }>(
      `SELECT type.code FROM active_canon_pack_registry active
       JOIN canon_pack_watchable_type type ON type.canon_pack_release_id = active.canon_pack_release_id
       ORDER BY type.display_weight, type.code`,
    );
    return result.rows.map((row) => row.code);
  }
  async item(slug: string): Promise<CatalogItem | undefined> {
    const item = (await this.catalog()).find((item) => item.slug === slug);
    if (!item) return undefined;
    const result = await this.pool.query<{
      relationship_type: string;
      direction: "requires" | "required-by";
      referenced_id: string;
      referenced_slug: string;
      referenced_title: string;
      summary: string;
    }>(
      `SELECT relationship.relationship_type,
              CASE WHEN relationship.watchable_id = target.watchable_id THEN 'requires' ELSE 'required-by' END AS direction,
              referenced.watchable_id AS referenced_id, referenced.slug AS referenced_slug,
              referenced.title AS referenced_title, relationship.summary
         FROM active_canon_pack_registry active
         JOIN canon_pack_watchable target ON target.canon_pack_release_id = active.canon_pack_release_id
         JOIN canon_pack_relationship relationship ON relationship.canon_pack_release_id = active.canon_pack_release_id
          AND (relationship.watchable_id = target.watchable_id OR relationship.prerequisite_id = target.watchable_id)
         JOIN canon_pack_watchable referenced ON referenced.canon_pack_release_id = active.canon_pack_release_id
          AND referenced.watchable_id = CASE WHEN relationship.watchable_id = target.watchable_id THEN relationship.prerequisite_id ELSE relationship.watchable_id END
        WHERE target.slug = $1 ORDER BY relationship.relationship_id`,
      [slug],
    );
    return {
      ...item,
      relationships: result.rows.map((row) => ({
        type: row.relationship_type,
        direction: row.direction,
        referencedWatchable: {
          id: row.referenced_id,
          slug: row.referenced_slug,
          title: row.referenced_title,
        },
        summary: row.summary,
      })),
    };
  }
  async setFocus(targetSlug: string): Promise<CatalogItem | undefined> {
    const target = await this.pool.query<{
      canon_pack_release_id: string;
      watchable_id: string;
    }>(
      `SELECT watchable.canon_pack_release_id, watchable.watchable_id
         FROM active_canon_pack_registry active
         JOIN canon_pack_watchable watchable ON watchable.canon_pack_release_id = active.canon_pack_release_id
        WHERE watchable.slug = $1`,
      [targetSlug],
    );
    const focus = target.rows[0];
    if (!focus) return undefined;
    await this.pool.query(
      "INSERT INTO canon_pack_watch_focus (singleton, canon_pack_release_id, watchable_id) VALUES (true, $1, $2) ON CONFLICT (singleton) DO UPDATE SET canon_pack_release_id = EXCLUDED.canon_pack_release_id, watchable_id = EXCLUDED.watchable_id, updated_at = CURRENT_TIMESTAMP",
      [focus.canon_pack_release_id, focus.watchable_id],
    );
    return this.nextUp();
  }
  async nextUp(): Promise<CatalogItem | undefined> {
    const catalog = await this.catalog();
    const focus = await this.pool.query<{ watchable_id: string }>(
      `SELECT focus.watchable_id FROM canon_pack_watch_focus focus
        JOIN active_canon_pack_registry active ON active.canon_pack_release_id = focus.canon_pack_release_id
       WHERE focus.singleton = true`,
    );
    const focusId = focus.rows[0]?.watchable_id;
    const active = await this.pool.query<{
      watchable_id: string;
      slug: string;
    }>(
      `SELECT watchable.watchable_id, watchable.slug FROM active_canon_pack_registry registry
        JOIN canon_pack_watchable watchable ON watchable.canon_pack_release_id = registry.canon_pack_release_id`,
    );
    const focusSlug = active.rows.find(
      (row) => row.watchable_id === focusId,
    )?.slug;
    const targetIndex = focusSlug
      ? catalog.findIndex((item) => item.slug === focusSlug)
      : catalog.length - 1;
    return catalog
      .slice(0, targetIndex + 1)
      .find((item) => item.state !== "watched");
  }
  async workspace(): Promise<WorkspaceAggregate> {
    const items = await this.catalog();
    const relationships = await this.pool.query<{
      from_slug: string;
      to_slug: string;
      relationship_type: string;
      summary: string;
    }>(
      `SELECT prerequisite.slug AS from_slug,
              watchable.slug AS to_slug,
              relationship.relationship_type,
              relationship.summary
         FROM active_canon_pack_registry active
         JOIN canon_pack_relationship relationship
           ON relationship.canon_pack_release_id = active.canon_pack_release_id
         JOIN canon_pack_watchable watchable
           ON watchable.canon_pack_release_id = relationship.canon_pack_release_id
          AND watchable.watchable_id = relationship.watchable_id
         JOIN canon_pack_watchable prerequisite
           ON prerequisite.canon_pack_release_id = relationship.canon_pack_release_id
          AND prerequisite.watchable_id = relationship.prerequisite_id
        ORDER BY relationship.relationship_id`,
    );
    const mappedRelationships = relationships.rows.map((row) => ({
      fromSlug: row.from_slug,
      toSlug: row.to_slug,
      type: relationshipType(row.relationship_type),
      summary: row.summary,
    }));
    const focus = await this.pool.query<{ slug: string }>(
      `SELECT target.slug
         FROM canon_pack_watch_focus focus
         JOIN active_canon_pack_registry active
           ON active.canon_pack_release_id = focus.canon_pack_release_id
         JOIN canon_pack_watchable target
           ON target.canon_pack_release_id = focus.canon_pack_release_id
          AND target.watchable_id = focus.watchable_id
        WHERE focus.singleton = true`,
    );
    const pack = await this.pool.query<WorkspacePack>(
      `SELECT pack.pack_title AS title, pack.pack_version AS version,
              pack.manifest_sha256 AS "manifestSha256",
              pack.checksums_sha256 AS "checksumsSha256",
              pack.inventory_file_count AS "inventoryFileCount",
              pack.inventory_total_bytes::integer AS "inventoryTotalBytes",
              pack.verification_status AS "verificationStatus"
         FROM active_canon_pack_registry registry
         JOIN canon_pack_release pack
           ON pack.canon_pack_release_id = registry.canon_pack_release_id`,
    );
    const history = await this.pool.query<WorkspaceHistory>(
      `SELECT watchable.slug, watchable.title,
              COALESCE(attempt.completed_at, attempt.created_at)::text AS "completedAt",
              attempt.status AS action, attempt.watched_minutes AS duration,
              NULL::integer AS rating
         FROM canon_pack_viewing_attempt attempt
         JOIN active_canon_pack_registry active
           ON active.canon_pack_release_id = attempt.canon_pack_release_id
         JOIN canon_pack_watchable watchable
           ON watchable.canon_pack_release_id = attempt.canon_pack_release_id
          AND watchable.watchable_id = attempt.watchable_id
        WHERE attempt.status IN ('completed', 'discarded')
        ORDER BY attempt.created_at DESC LIMIT 20`,
    );
    return workspaceFromCatalog(
      items,
      focus.rows[0]?.slug ?? null,
      pack.rows[0] ?? null,
      history.rows,
      mappedRelationships,
    );
  }
  async viewingAction(
    slug: string,
    action: "start" | "complete" | "discard" | "repeat",
  ): Promise<CatalogItem | undefined> {
    const target = await this.pool.query<{
      canon_pack_release_id: string;
      watchable_id: string;
      runtime_minutes: number;
    }>(
      `SELECT watchable.canon_pack_release_id, watchable.watchable_id, watchable.runtime_minutes
         FROM active_canon_pack_registry active
         JOIN canon_pack_watchable watchable ON watchable.canon_pack_release_id = active.canon_pack_release_id
        WHERE watchable.slug = $1`,
      [slug],
    );
    const watchable = target.rows[0];
    if (!watchable) return undefined;
    await this.pool.query(
      "INSERT INTO canon_pack_viewing_attempt (viewing_attempt_id, canon_pack_release_id, watchable_id, status, watched_minutes, completed_at) VALUES ($1, $2, $3, $4, $5, $6)",
      [
        randomUUID(),
        watchable.canon_pack_release_id,
        watchable.watchable_id,
        action === "complete"
          ? "completed"
          : action === "discard"
            ? "discarded"
            : "active",
        action === "complete" ? watchable.runtime_minutes : null,
        action === "complete" ? new Date() : null,
      ],
    );
    return this.item(slug);
  }
  async catalogAdditions(
    trackerInstanceId: string,
  ): Promise<CatalogAddition[]> {
    const result = await this.pool.query<CatalogAddition>(
      `SELECT catalog_addition_id AS id, slug, title, type, summary,
              release_date::text AS "releaseDate", runtime_minutes AS runtime,
              primary_series AS series, aliases, queue_reason AS why,
              poster_url AS "posterUrl", created_at::text AS "createdAt",
              updated_at::text AS "updatedAt"
         FROM catalog_addition
        WHERE tracker_instance_id = $1 AND deleted_at IS NULL
        ORDER BY created_at, catalog_addition_id`,
      [trackerInstanceId],
    );
    return result.rows;
  }
  async catalogAddition(
    trackerInstanceId: string,
    id: string,
  ): Promise<CatalogAddition | undefined> {
    const result = await this.pool.query<CatalogAddition>(
      `SELECT catalog_addition_id AS id, slug, title, type, summary,
              release_date::text AS "releaseDate", runtime_minutes AS runtime,
              primary_series AS series, aliases, queue_reason AS why,
              poster_url AS "posterUrl", created_at::text AS "createdAt",
              updated_at::text AS "updatedAt"
         FROM catalog_addition
        WHERE tracker_instance_id = $1 AND catalog_addition_id = $2
          AND deleted_at IS NULL`,
      [trackerInstanceId, id],
    );
    return result.rows[0];
  }
  async createCatalogAddition(
    trackerInstanceId: string,
    input: CatalogAdditionInput,
  ): Promise<CatalogAddition> {
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO catalog_addition
         (tracker_instance_id, slug, title, type, summary, release_date,
          runtime_minutes, primary_series, aliases, queue_reason, poster_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING catalog_addition_id AS id`,
      [
        trackerInstanceId,
        input.slug,
        input.title,
        input.type,
        input.summary,
        input.releaseDate,
        input.runtime,
        input.series,
        input.aliases,
        input.why,
        input.posterUrl ?? null,
      ],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error("Catalog addition was not created");
    const created = await this.catalogAddition(trackerInstanceId, id);
    if (!created)
      throw new Error("Catalog addition was not readable after creation");
    return created;
  }
  async updateCatalogAddition(
    trackerInstanceId: string,
    id: string,
    input: CatalogAdditionInput,
  ): Promise<CatalogAddition | undefined> {
    const result = await this.pool.query(
      `UPDATE catalog_addition
          SET slug = $3, title = $4, type = $5, summary = $6,
              release_date = $7, runtime_minutes = $8, primary_series = $9,
              aliases = $10, queue_reason = $11, poster_url = $12,
              updated_at = CURRENT_TIMESTAMP
        WHERE tracker_instance_id = $1 AND catalog_addition_id = $2
          AND deleted_at IS NULL`,
      [
        trackerInstanceId,
        id,
        input.slug,
        input.title,
        input.type,
        input.summary,
        input.releaseDate,
        input.runtime,
        input.series,
        input.aliases,
        input.why,
        input.posterUrl ?? null,
      ],
    );
    if (result.rowCount !== 1) return undefined;
    return this.catalogAddition(trackerInstanceId, id);
  }
  async deleteCatalogAddition(
    trackerInstanceId: string,
    id: string,
  ): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE catalog_addition
          SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE tracker_instance_id = $1 AND catalog_addition_id = $2
          AND deleted_at IS NULL`,
      [trackerInstanceId, id],
    );
    return result.rowCount === 1;
  }
}
