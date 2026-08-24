import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

import type { Pool } from "pg";

export type ViewingState = "not-started" | "in-progress" | "watched";

export interface CatalogItem {
  slug: string;
  title: string;
  type: "Movie" | "Episode" | "Special" | "Short";
  summary: string;
  releaseOrder: number;
  state: ViewingState;
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

// Projection of the verified Lantern Vale 0.2.0 release at Template commit
// f3212a85f8cbb1dd79fb5332cec82e6ddc5fcc78. Only catalog fields required by
// this first Core slice are retained; the Pack remains declarative data.
const LANTERN_VALE: readonly ImportedItem[] = [
  {
    slug: "lantern-vale-first-light",
    title: "Lantern Vale: First Light",
    type: "Movie",
    summary:
      "A survey team restores an old beacon before the valley's longest night.",
    releaseOrder: 1,
  },
  {
    slug: "a-light-between",
    title: "A Light Between",
    type: "Short",
    summary: "Two travelers trade a pocket lantern while waiting for dawn.",
    releaseOrder: 2,
  },
  {
    slug: "the-quiet-beacon",
    title: "The Quiet Beacon",
    type: "Episode",
    summary:
      "A junior keeper discovers that a silent tower is still sending a signal.",
    releaseOrder: 3,
  },
  {
    slug: "the-echo-line",
    title: "The Echo Line",
    type: "Episode",
    summary: "The keepers follow the returning signal beyond the mapped ridge.",
    releaseOrder: 4,
  },
  {
    slug: "midwinter-signal",
    title: "Midwinter Signal",
    type: "Special",
    summary:
      "The valley gathers for a one-night relay across every restored beacon.",
    releaseOrder: 5,
  },
];

const PACK = { title: "Lantern Vale Stories", version: "0.2.0" };

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

  constructor(options: { initialPassword?: string } = {}) {
    if (options.initialPassword !== undefined)
      this.#configuredPassword = options.initialPassword;
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
    for (const item of LANTERN_VALE) this.#items.set(item.slug, item);
    return PACK;
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
  constructor(
    private readonly pool: Pool,
    initialPassword?: string,
  ) {
    if (initialPassword !== undefined) this.#initialPassword = initialPassword;
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
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const item of LANTERN_VALE)
        await client.query(
          "INSERT INTO catalog_item (slug, title, type, summary, release_order) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, type = EXCLUDED.type, summary = EXCLUDED.summary, release_order = EXCLUDED.release_order",
          [item.slug, item.title, item.type, item.summary, item.releaseOrder],
        );
      await client.query(
        "INSERT INTO active_canon_pack (singleton, title, version) VALUES (true, $1, $2) ON CONFLICT (singleton) DO UPDATE SET title = EXCLUDED.title, version = EXCLUDED.version",
        [PACK.title, PACK.version],
      );
      await client.query("COMMIT");
      return PACK;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async catalog(): Promise<CatalogItem[]> {
    const result = await this.pool.query<CatalogItem>(
      "SELECT item.slug, item.title, item.type, item.summary, item.release_order AS \"releaseOrder\", CASE active.status WHEN 'active' THEN 'in-progress' WHEN 'completed' THEN 'watched' ELSE 'not-started' END AS state FROM catalog_item item LEFT JOIN LATERAL (SELECT status FROM viewing_attempt WHERE catalog_slug = item.slug ORDER BY created_at DESC LIMIT 1) active ON true ORDER BY item.release_order",
    );
    return result.rows;
  }
  async item(slug: string): Promise<CatalogItem | undefined> {
    return (await this.catalog()).find((item) => item.slug === slug);
  }
  async setFocus(targetSlug: string): Promise<CatalogItem | undefined> {
    if (!(await this.item(targetSlug))) return undefined;
    await this.pool.query(
      "INSERT INTO watch_focus (singleton, target_slug) VALUES (true, $1) ON CONFLICT (singleton) DO UPDATE SET target_slug = EXCLUDED.target_slug",
      [targetSlug],
    );
    return this.nextUp();
  }
  async nextUp(): Promise<CatalogItem | undefined> {
    const catalog = await this.catalog();
    const focus = await this.pool.query<{ target_slug: string }>(
      "SELECT target_slug FROM watch_focus WHERE singleton = true",
    );
    const targetIndex = focus.rows[0]
      ? catalog.findIndex((item) => item.slug === focus.rows[0]?.target_slug)
      : catalog.length - 1;
    return catalog
      .slice(0, targetIndex + 1)
      .find((item) => item.state !== "watched");
  }
  async viewingAction(
    slug: string,
    action: "start" | "complete" | "discard" | "repeat",
  ): Promise<CatalogItem | undefined> {
    if (!(await this.item(slug))) return undefined;
    await this.pool.query(
      "INSERT INTO viewing_attempt (viewing_attempt_id, catalog_slug, status) VALUES ($1, $2, $3)",
      [
        randomUUID(),
        slug,
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
