import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import path from "node:path";

import type { Pool } from "pg";

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
  state: ViewingState;
  relationships: CatalogRelationship[];
}

export interface SliceSession {
  token: string;
  csrfToken: string;
}

export interface SliceStore {
  needsSetup(): Promise<boolean>;
  setup(): Promise<boolean>;
  authenticate(password: string): Promise<boolean>;
  createSession(): Promise<SliceSession>;
  getSession(token: string): Promise<{ csrfToken: string } | undefined>;
  validateCsrf(token: string, csrfToken: string): Promise<boolean>;
  importLanternVale(): Promise<{ title: string; version: string }>;
  catalog(): Promise<CatalogItem[]>;
  item(slug: string): Promise<CatalogItem | undefined>;
  setFocus(targetSlug: string): Promise<CatalogItem | undefined>;
  nextUp(): Promise<CatalogItem | undefined>;
  viewingAction(
    slug: string,
    action: "start" | "complete" | "discard" | "repeat",
  ): Promise<CatalogItem | undefined>;
}

type ImportedItem = Omit<CatalogItem, "state">;

export { importCanonPackDirectory } from "./canon-pack.js";

export const DEFAULT_CANON_PACK_PATH = "/app/canon-packs/lantern-vale-0.2.0";

function defaultCanonPackPath(): string {
  return process.env.NODE_TEST_CONTEXT !== undefined
    ? path.resolve("canon-packs/lantern-vale-0.2.0")
    : DEFAULT_CANON_PACK_PATH;
}

/** The only release Core is authorized to activate in this preview. */
export const ACCEPTED_LANTERN_VALE_RELEASE = Object.freeze({
  id: "01954123-0000-7000-8000-000000000001",
  slug: "lantern-vale",
  title: "Lantern Vale Stories",
  version: "0.2.0",
  manifestSha256:
    "f5c1041ad7daf7a49f8987bdd7d8127f0a8b6c94e70b4aca775e732010b98b8c",
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
    pack.manifestSha256 !== accepted.manifestSha256
  ) {
    throw new Error("Canon Pack is not an accepted Canon Pack release");
  }
  return pack;
}

function projection(pack: CanonPack): ImportedItem[] {
  const labels = new Map(
    pack.watchableTypes.map((type) => [type.id, type.label]),
  );
  const watchables = new Map(
    pack.watchables.map((watchable) => [watchable.id, watchable]),
  );
  return pack.watchables.map((watchable) => ({
    slug: watchable.slug,
    title: watchable.title,
    type: labels.get(watchable.watchableTypeId) ?? "Unknown",
    summary: watchable.summary,
    releaseOrder: watchable.releaseOrder,
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

function newSession(): SliceSession {
  return {
    token: randomBytes(32).toString("hex"),
    csrfToken: randomBytes(32).toString("hex"),
  };
}

function stateFor(status?: string): ViewingState {
  if (status === "active") return "in-progress";
  if (status === "completed") return "watched";
  return "not-started";
}

export class MemorySliceStore implements SliceStore {
  #configuredPassword: string | undefined;
  #credential: string | undefined;
  #sessions = new Map<string, string>();
  #items = new Map<string, ImportedItem>();
  #states = new Map<string, string>();
  #focus?: string;
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
    const session = newSession();
    this.#sessions.set(session.token, session.csrfToken);
    return session;
  }
  async getSession(token: string): Promise<{ csrfToken: string } | undefined> {
    const csrfToken = this.#sessions.get(token);
    return csrfToken ? { csrfToken } : undefined;
  }
  async validateCsrf(token: string, csrfToken: string): Promise<boolean> {
    return this.#sessions.get(token) === csrfToken;
  }
  async importLanternVale(): Promise<{ title: string; version: string }> {
    const pack = await importAcceptedLanternVale(this.#packPath);
    const staged = new Map(projection(pack).map((item) => [item.slug, item]));
    if (this.#faultAfterStage?.()) throw new Error("injected activation fault");
    this.#items = staged;
    return { title: pack.identity.title, version: pack.identity.version };
  }
  async catalog(): Promise<CatalogItem[]> {
    return [...this.#items.values()]
      .sort((a, b) => a.releaseOrder - b.releaseOrder)
      .map((item) => ({
        ...item,
        state: stateFor(this.#states.get(item.slug)),
      }));
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
    return this.item(slug);
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
    const session = newSession();
    await this.pool.query(
      "INSERT INTO app_session (token_sha256, csrf_token, csrf_sha256, expires_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL '7 days')",
      [digest(session.token), session.csrfToken, digest(session.csrfToken)],
    );
    return session;
  }
  async getSession(token: string): Promise<{ csrfToken: string } | undefined> {
    const result = await this.pool.query<{ csrf_token: string }>(
      "SELECT csrf_token FROM app_session WHERE token_sha256 = $1 AND expires_at > CURRENT_TIMESTAMP",
      [digest(token)],
    );
    const csrfToken = result.rows[0]?.csrf_token;
    return csrfToken ? { csrfToken } : undefined;
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
      }>(
        "SELECT canon_pack_release_id, manifest_sha256 FROM canon_pack_release WHERE pack_id = $1 AND pack_version = $2",
        [pack.identity.id, pack.identity.version],
      );
      let releaseId = existing.rows[0]?.canon_pack_release_id;
      if (
        existing.rows[0] &&
        existing.rows[0].manifest_sha256 !== pack.manifestSha256
      )
        throw new Error(
          "immutable Canon Pack release identity has a different manifest",
        );
      if (!releaseId) {
        const created = await client.query<{ canon_pack_release_id: string }>(
          "INSERT INTO canon_pack_release (pack_id, pack_slug, pack_title, pack_version, contract_version, manifest_sha256, source_path) VALUES ($1, $2, $3, $4, '0.2.0', $5, $6) RETURNING canon_pack_release_id",
          [
            pack.identity.id,
            pack.identity.slug,
            pack.identity.title,
            pack.identity.version,
            pack.manifestSha256,
            pack.sourcePath,
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
            "INSERT INTO canon_pack_watchable (canon_pack_release_id, watchable_id, slug, title, summary, watchable_type_id, release_date, release_order) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
            [
              releaseId,
              watchable.id,
              watchable.slug,
              watchable.title,
              watchable.summary,
              watchable.watchableTypeId,
              watchable.releaseDate,
              watchable.releaseOrder,
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
  async catalog(): Promise<CatalogItem[]> {
    const result = await this.pool.query<Omit<CatalogItem, "relationships">>(
      `SELECT watchable.slug, watchable.title, type.label AS type, watchable.summary,
              watchable.release_order AS "releaseOrder",
              CASE latest_attempt.status WHEN 'active' THEN 'in-progress' WHEN 'completed' THEN 'watched' ELSE 'not-started' END AS state
         FROM active_canon_pack_registry active
         JOIN canon_pack_watchable watchable ON watchable.canon_pack_release_id = active.canon_pack_release_id
         JOIN canon_pack_watchable_type type ON type.canon_pack_release_id = watchable.canon_pack_release_id AND type.watchable_type_id = watchable.watchable_type_id
         LEFT JOIN LATERAL (
           SELECT attempt.status FROM canon_pack_viewing_attempt attempt
            WHERE attempt.canon_pack_release_id = active.canon_pack_release_id AND attempt.watchable_id = watchable.watchable_id
            ORDER BY attempt.created_at DESC LIMIT 1
         ) latest_attempt ON true
        ORDER BY watchable.release_order`,
    );
    return result.rows.map((item) => ({ ...item, relationships: [] }));
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
  async viewingAction(
    slug: string,
    action: "start" | "complete" | "discard" | "repeat",
  ): Promise<CatalogItem | undefined> {
    const target = await this.pool.query<{
      canon_pack_release_id: string;
      watchable_id: string;
    }>(
      `SELECT watchable.canon_pack_release_id, watchable.watchable_id
         FROM active_canon_pack_registry active
         JOIN canon_pack_watchable watchable ON watchable.canon_pack_release_id = active.canon_pack_release_id
        WHERE watchable.slug = $1`,
      [slug],
    );
    const watchable = target.rows[0];
    if (!watchable) return undefined;
    await this.pool.query(
      "INSERT INTO canon_pack_viewing_attempt (viewing_attempt_id, canon_pack_release_id, watchable_id, status) VALUES ($1, $2, $3, $4)",
      [
        randomUUID(),
        watchable.canon_pack_release_id,
        watchable.watchable_id,
        action === "complete"
          ? "completed"
          : action === "discard"
            ? "discarded"
            : "active",
      ],
    );
    return this.item(slug);
  }
}
