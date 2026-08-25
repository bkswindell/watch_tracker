import { randomBytes } from "node:crypto";

import helmet from "@fastify/helmet";
import staticFiles from "@fastify/static";
import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";

import {
  isCatalogAdditionId,
  parseCatalogAdditionInput,
} from "../../../packages/contracts/src/catalog.js";
import { parseWatchableFeedbackInput } from "../../../packages/contracts/src/feedback.js";
import { WATCH_TRACKER_API_SERVICE } from "../../../packages/contracts/src/health.js";
import { SESSION_IDLE_LIFETIME_MS, type SliceStore } from "./slice.js";

export interface ReadinessResult {
  ready: boolean;
  reason?: string;
}

export type ReadinessProbe = () => Promise<ReadinessResult>;

export interface BuildAppOptions {
  readinessProbe: ReadinessProbe;
  bodyLimit?: number;
  webRoot?: string;
  sliceStore?: SliceStore;
  posterFetch?: typeof fetch;
  loginThrottle?: {
    maxFailures: number;
    windowMs: number;
    maxEntries?: number;
  };
}

export const API_SERVER_LIMITS = Object.freeze({
  connectionTimeout: 10_000,
  requestTimeout: 30_000,
  keepAliveTimeout: 5_000,
  bodyLimit: 1_048_576,
});

const APPROVED_POSTER_HOSTS = new Set([
  "image.tmdb.org",
  "media.themoviedb.org",
]);
const POSTER_MAX_BYTES = 5 * 1024 * 1024;
const SESSION_COOKIE_MAX_AGE_SECONDS = SESSION_IDLE_LIFETIME_MS / 1_000;

export function approvedPosterUrl(value: unknown): URL | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" &&
      parsed.port === "" &&
      parsed.username === "" &&
      parsed.password === "" &&
      APPROVED_POSTER_HOSTS.has(parsed.hostname)
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
}

async function boundedImage(response: Response): Promise<Buffer | undefined> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > POSTER_MAX_BYTES)
    return undefined;
  if (!response.body) return undefined;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > POSTER_MAX_BYTES) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, total);
}

function sendError(
  reply: FastifyReply,
  request: FastifyRequest,
  statusCode: number,
  code: string,
  message: string,
): void {
  void reply.status(statusCode).send({
    error: { code, message },
    requestId: request.id,
  });
}

function readCookie(request: FastifyRequest, name: string): string | undefined {
  return new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(
    request.headers.cookie ?? "",
  )?.[1];
}

function readCsrf(request: FastifyRequest): string | undefined {
  const value = request.headers["x-csrf-token"];
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value)
    ? value
    : undefined;
}

function sameOrigin(request: FastifyRequest): boolean {
  const origin = request.headers.origin;
  if (!origin) return true; // Non-browser clients still require the CSRF token.
  if (Array.isArray(origin)) return false;
  try {
    const parsed = new URL(origin);
    const host = request.headers.host;
    return (
      Boolean(host) &&
      parsed.host === host &&
      parsed.protocol === `${request.protocol}:`
    );
  } catch {
    return false;
  }
}

// Recovery completion does not have an established session/CSRF token to
// validate. Unlike authenticated API paths, it is browser-only: require the
// browser Origin header in addition to an exact origin match.
function sameBrowserOrigin(request: FastifyRequest): boolean {
  return typeof request.headers.origin === "string" && sameOrigin(request);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

export async function buildApp(
  options: BuildAppOptions,
): Promise<FastifyInstance> {
  const app = Fastify({
    ...API_SERVER_LIMITS,
    bodyLimit: options.bodyLimit ?? API_SERVER_LIMITS.bodyLimit,
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        // React Flow and AG Grid calculate element geometry at runtime and emit
        // style attributes. Permit only inline styles; scripts remain self-only.
        styleSrc: ["'self'", "'unsafe-inline'"],
        upgradeInsecureRequests: null,
      },
    },
  });

  app.addHook("onRequest", async (request, reply) => {
    void reply.header("x-request-id", request.id);
    // API responses can contain authentication material or owner-scoped state.
    // Keep successful and error responses out of browser/intermediary caches.
    if (request.url === "/api" || request.url.startsWith("/api/"))
      void reply.header("cache-control", "no-store");
  });

  app.get("/health", async (request) => ({
    status: "ok",
    service: WATCH_TRACKER_API_SERVICE,
    requestId: request.id,
  }));

  app.get("/ready", async (request, reply) => {
    try {
      const result = await options.readinessProbe();
      if (result.ready) return { status: "ready", requestId: request.id };
      return reply.status(503).send({
        status: "not-ready",
        reason: result.reason ?? "dependency unavailable",
        requestId: request.id,
      });
    } catch {
      return reply.status(503).send({
        status: "not-ready",
        reason: "database unavailable",
        requestId: request.id,
      });
    }
  });

  if (options.sliceStore) {
    const store = options.sliceStore;
    const setupCsrf = randomBytes(32).toString("hex");
    // Match the reviewed deployment baseline: ten failures from one remote
    // address within 15 minutes trigger a 15-minute cooldown.
    const loginThrottle = options.loginThrottle ?? {
      maxFailures: 10,
      windowMs: 15 * 60_000,
      maxEntries: 10_000,
    };
    const loginThrottleMaxEntries = loginThrottle.maxEntries ?? 10_000;
    const failedLogins = new Map<
      string,
      { count: number; startedAt: number }
    >();
    function loginKey(request: FastifyRequest): string {
      return request.ip;
    }
    function pruneLoginFailures(now: number): void {
      for (const [key, failure] of failedLogins) {
        if (now - failure.startedAt >= loginThrottle.windowMs)
          failedLogins.delete(key);
      }
      while (failedLogins.size >= loginThrottleMaxEntries) {
        const oldest = failedLogins.keys().next().value;
        if (oldest === undefined) return;
        failedLogins.delete(oldest);
      }
    }
    function loginBlocked(request: FastifyRequest): number | undefined {
      const failure = failedLogins.get(loginKey(request));
      if (!failure) return undefined;
      const remaining =
        loginThrottle.windowMs - (Date.now() - failure.startedAt);
      if (remaining <= 0) {
        failedLogins.delete(loginKey(request));
        return undefined;
      }
      return failure.count >= loginThrottle.maxFailures ? remaining : undefined;
    }
    function recordLoginFailure(request: FastifyRequest): void {
      const key = loginKey(request);
      const existing = failedLogins.get(key);
      const now = Date.now();
      if (!existing || now - existing.startedAt >= loginThrottle.windowMs) {
        pruneLoginFailures(now);
        failedLogins.set(key, { count: 1, startedAt: now });
      } else existing.count += 1;
    }
    function clearLoginFailures(request: FastifyRequest): void {
      failedLogins.delete(loginKey(request));
    }
    async function session(request: FastifyRequest) {
      const token = readCookie(request, "watch_tracker_session");
      return token
        ? { token, value: await store.getSession(token) }
        : undefined;
    }
    async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
      const found = await session(request);
      if (!found?.value) {
        sendError(reply, request, 401, "auth.required", "Sign in is required");
        return undefined;
      }
      return { token: found.token, value: found.value };
    }
    async function requireCsrf(request: FastifyRequest, reply: FastifyReply) {
      const found = await requireAuth(request, reply);
      const csrf = readCsrf(request);
      if (
        !found ||
        !sameOrigin(request) ||
        !csrf ||
        !(await store.validateCsrf(found.token, csrf))
      ) {
        if (found)
          sendError(
            reply,
            request,
            403,
            "csrf.invalid",
            "A valid CSRF token is required",
          );
        return undefined;
      }
      return found;
    }

    app.get<{ Querystring: { url?: unknown } }>(
      "/tmdb-image",
      async (request, reply) => {
        if (!(await requireAuth(request, reply))) return;
        const source = approvedPosterUrl(request.query.url);
        if (!source)
          return sendError(
            reply,
            request,
            400,
            "poster.invalid-source",
            "Poster URL must use an approved HTTPS media host",
          );
        try {
          const response = await (options.posterFetch ?? fetch)(source, {
            redirect: "error",
            signal: AbortSignal.timeout(10_000),
          });
          const contentType = response.headers
            .get("content-type")
            ?.split(";")[0];
          if (
            !response.ok ||
            !contentType ||
            !["image/jpeg", "image/png", "image/webp"].includes(contentType)
          )
            return sendError(
              reply,
              request,
              502,
              "poster.unavailable",
              "Poster source did not return an approved image",
            );
          const image = await boundedImage(response);
          if (!image)
            return sendError(
              reply,
              request,
              502,
              "poster.unavailable",
              "Poster source exceeded the safe response limit",
            );
          return reply
            .type(contentType)
            .header("cache-control", "private, max-age=86400")
            .send(image);
        } catch {
          return sendError(
            reply,
            request,
            502,
            "poster.unavailable",
            "Poster source is unavailable",
          );
        }
      },
    );

    app.get("/api/bootstrap", async (request, reply) => {
      const found = await session(request);
      // The response carries a setup or session CSRF token, so it must never
      // be retained by a browser or intermediary cache.
      void reply.header("cache-control", "no-store");
      return {
        setupRequired: await store.needsSetup(),
        authenticated: Boolean(found?.value),
        csrfToken: found?.value?.csrfToken || readCsrf(request) || setupCsrf,
      };
    });
    app.post("/api/setup", async (request, reply) => {
      if (!sameOrigin(request) || readCsrf(request) !== setupCsrf) {
        sendError(
          reply,
          request,
          403,
          "csrf.invalid",
          "A valid CSRF token is required",
        );
        return;
      }
      if (!(await store.setup())) {
        sendError(
          reply,
          request,
          409,
          "setup.unavailable",
          "Setup is unavailable",
        );
        return;
      }
      void reply.status(204).send();
    });
    app.post<{ Body: { token?: unknown; password?: unknown } }>(
      "/api/password-reset/complete",
      async (request, reply) => {
        void reply
          .header("cache-control", "no-store")
          .header("referrer-policy", "no-referrer");
        const genericFailure = () =>
          sendError(
            reply,
            request,
            400,
            "password-reset.invalid",
            "Password reset could not be completed",
          );
        if (!sameBrowserOrigin(request)) {
          genericFailure();
          return;
        }
        const token = request.body?.token;
        const password = request.body?.password;
        if (
          typeof token !== "string" ||
          typeof password !== "string" ||
          token.length > 256 ||
          password.length > 1024 ||
          !(await store.completePasswordReset(token, password))
        ) {
          genericFailure();
          return;
        }
        void reply
          .header("cache-control", "no-store")
          .header("referrer-policy", "no-referrer")
          .status(204)
          .send();
      },
    );
    app.post<{ Body: { password?: unknown } }>(
      "/api/login",
      async (request, reply) => {
        void reply.header("cache-control", "no-store");
        if (!sameOrigin(request) || readCsrf(request) !== setupCsrf) {
          sendError(
            reply,
            request,
            403,
            "csrf.invalid",
            "A valid CSRF token is required",
          );
          return;
        }
        const blockedFor = loginBlocked(request);
        if (blockedFor !== undefined) {
          void reply.header("retry-after", Math.ceil(blockedFor / 1000));
          return sendError(
            reply,
            request,
            429,
            "auth.throttled",
            "Too many sign-in attempts. Try again later.",
          );
        }
        const password = request.body?.password;
        const created =
          typeof password === "string" && password.length <= 1024
            ? await store.authenticateAndCreateSession(password)
            : undefined;
        if (!created) {
          recordLoginFailure(request);
          sendError(
            reply,
            request,
            401,
            "auth.invalid-credentials",
            "Invalid credentials",
          );
          return;
        }
        clearLoginFailures(request);
        void reply
          .header(
            "set-cookie",
            `watch_tracker_session=${created.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_COOKIE_MAX_AGE_SECONDS}`,
          )
          .header("x-csrf-token", created.csrfToken)
          .status(204)
          .send();
      },
    );
    app.post("/api/logout", async (request, reply) => {
      void reply.header("cache-control", "no-store");
      const found = await requireCsrf(request, reply);
      if (!found) return;
      await store.invalidateSession(found.token);
      void reply
        .header(
          "set-cookie",
          "watch_tracker_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
        )
        .status(204)
        .send();
    });
    app.post("/api/import-lantern-vale", async (request, reply) => {
      if (!(await requireCsrf(request, reply))) return;
      return reply.status(201).send({ pack: await store.importLanternVale() });
    });
    app.get("/api/workspace", async (request, reply) => {
      if (!(await requireAuth(request, reply))) return;
      return store.workspace();
    });
    app.get<{ Querystring: { search?: unknown; type?: unknown } }>(
      "/api/catalog",
      async (request, reply) => {
        if (!(await requireAuth(request, reply))) return;
        const { search, type } = request.query;
        if (
          (search !== undefined && typeof search !== "string") ||
          (type !== undefined && typeof type !== "string")
        )
          return sendError(
            reply,
            request,
            400,
            "request.invalid",
            "search and type must be strings",
          );
        const normalizedSearch = search?.trim() || undefined;
        const normalizedType = type?.trim() || undefined;
        if (
          normalizedType !== undefined &&
          !(await store.catalogTypes()).includes(normalizedType)
        )
          return sendError(
            reply,
            request,
            400,
            "request.invalid",
            "type is not an accepted Pack Watchable Type",
          );
        return {
          items: await store.catalog({
            search: normalizedSearch,
            type: normalizedType,
          }),
          nextUp: await store.nextUp(),
        };
      },
    );
    app.get("/api/catalog-additions", async (request, reply) => {
      const found = await requireAuth(request, reply);
      if (!found) return;
      return {
        items: await store.catalogAdditions(found.value.trackerInstanceId),
      };
    });
    app.get<{ Params: { id: string } }>(
      "/api/catalog-additions/:id",
      async (request, reply) => {
        const found = await requireAuth(request, reply);
        if (!found) return;
        if (!isCatalogAdditionId(request.params.id))
          return sendError(
            reply,
            request,
            400,
            "request.invalid",
            "Catalog addition id must be a UUID",
          );
        const item = await store.catalogAddition(
          found.value.trackerInstanceId,
          request.params.id,
        );
        if (!item)
          return sendError(
            reply,
            request,
            404,
            "catalog-addition.not-found",
            "Catalog addition not found",
          );
        return item;
      },
    );
    app.post<{ Body: unknown }>(
      "/api/catalog-additions",
      async (request, reply) => {
        const found = await requireCsrf(request, reply);
        if (!found) return;
        const parsed = parseCatalogAdditionInput(request.body);
        if (!parsed.value)
          return sendError(
            reply,
            request,
            400,
            "request.invalid",
            parsed.message ?? "Catalog addition is invalid",
          );
        try {
          return reply.status(201).send({
            item: await store.createCatalogAddition(
              found.value.trackerInstanceId,
              parsed.value,
            ),
          });
        } catch (error) {
          if (isUniqueViolation(error))
            return sendError(
              reply,
              request,
              409,
              "catalog-addition.slug-conflict",
              "A Catalog addition with this slug already exists",
            );
          throw error;
        }
      },
    );
    app.put<{ Params: { id: string }; Body: unknown }>(
      "/api/catalog-additions/:id",
      async (request, reply) => {
        const found = await requireCsrf(request, reply);
        if (!found) return;
        if (!isCatalogAdditionId(request.params.id))
          return sendError(
            reply,
            request,
            400,
            "request.invalid",
            "Catalog addition id must be a UUID",
          );
        const parsed = parseCatalogAdditionInput(request.body);
        if (!parsed.value)
          return sendError(
            reply,
            request,
            400,
            "request.invalid",
            parsed.message ?? "Catalog addition is invalid",
          );
        try {
          const item = await store.updateCatalogAddition(
            found.value.trackerInstanceId,
            request.params.id,
            parsed.value,
          );
          if (!item)
            return sendError(
              reply,
              request,
              404,
              "catalog-addition.not-found",
              "Catalog addition not found",
            );
          return { item };
        } catch (error) {
          if (isUniqueViolation(error))
            return sendError(
              reply,
              request,
              409,
              "catalog-addition.slug-conflict",
              "A Catalog addition with this slug already exists",
            );
          throw error;
        }
      },
    );
    app.delete<{ Params: { id: string } }>(
      "/api/catalog-additions/:id",
      async (request, reply) => {
        const found = await requireCsrf(request, reply);
        if (!found) return;
        if (!isCatalogAdditionId(request.params.id))
          return sendError(
            reply,
            request,
            400,
            "request.invalid",
            "Catalog addition id must be a UUID",
          );
        if (
          !(await store.deleteCatalogAddition(
            found.value.trackerInstanceId,
            request.params.id,
          ))
        )
          return sendError(
            reply,
            request,
            404,
            "catalog-addition.not-found",
            "Catalog addition not found",
          );
        void reply.status(204).send();
      },
    );
    app.get<{ Params: { slug: string } }>(
      "/api/catalog/:slug/feedback",
      async (request, reply) => {
        const found = await requireAuth(request, reply);
        if (!found) return;
        const result = await store.watchableFeedback(
          found.value.trackerInstanceId,
          request.params.slug,
        );
        if (!result)
          return sendError(
            reply,
            request,
            404,
            "catalog.not-found",
            "Catalog item not found",
          );
        return result;
      },
    );
    app.put<{ Params: { slug: string }; Body: unknown }>(
      "/api/catalog/:slug/feedback",
      async (request, reply) => {
        const found = await requireCsrf(request, reply);
        if (!found) return;
        const parsed = parseWatchableFeedbackInput(request.body);
        if (!parsed.value)
          return sendError(
            reply,
            request,
            400,
            "request.invalid",
            parsed.message ?? "Feedback is invalid",
          );
        const result = await store.saveWatchableFeedback(
          found.value.trackerInstanceId,
          request.params.slug,
          parsed.value,
        );
        if (result.status === "not-found")
          return sendError(
            reply,
            request,
            404,
            "catalog.not-found",
            "Catalog item not found",
          );
        if (result.status === "not-watched")
          return sendError(
            reply,
            request,
            409,
            "feedback.watch-required",
            "Feedback can only be changed while the watchable is Watched",
          );
        return { feedback: result.feedback };
      },
    );
    app.get<{ Params: { slug: string } }>(
      "/api/catalog/:slug",
      async (request, reply) => {
        if (!(await requireAuth(request, reply))) return;
        const item = await store.item(request.params.slug);
        if (!item)
          return sendError(
            reply,
            request,
            404,
            "catalog.not-found",
            "Catalog item not found",
          );
        return item;
      },
    );
    app.post<{ Body: { targetSlug?: unknown } }>(
      "/api/focus",
      async (request, reply) => {
        if (!(await requireCsrf(request, reply))) return;
        const targetSlug = request.body?.targetSlug;
        if (typeof targetSlug !== "string")
          return sendError(
            reply,
            request,
            400,
            "request.invalid",
            "targetSlug is required",
          );
        const nextUp = await store.setFocus(targetSlug);
        if (!nextUp)
          return sendError(
            reply,
            request,
            404,
            "catalog.not-found",
            "Catalog item not found",
          );
        return { nextUp };
      },
    );
    app.post<{
      Params: {
        slug: string;
        action: "start" | "complete" | "discard" | "repeat";
      };
    }>("/api/catalog/:slug/:action", async (request, reply) => {
      if (!(await requireCsrf(request, reply))) return;
      const allowed = ["start", "complete", "discard", "repeat"] as const;
      if (!allowed.includes(request.params.action))
        return sendError(
          reply,
          request,
          404,
          "request.not-found",
          "Route not found",
        );
      const item = await store.viewingAction(
        request.params.slug,
        request.params.action,
      );
      if (!item)
        return sendError(
          reply,
          request,
          404,
          "catalog.not-found",
          "Catalog item not found",
        );
      return item;
    });
  }

  if (options.webRoot) {
    await app.register(staticFiles, {
      root: options.webRoot,
      prefix: "/",
      redirect: false,
    });
    app.get("/reset-password", (_request, reply) =>
      reply
        .header("cache-control", "no-store")
        .header("referrer-policy", "no-referrer")
        .sendFile("index.html", { cacheControl: false }),
    );
  }

  app.setNotFoundHandler((request, reply) => {
    sendError(reply, request, 404, "request.not-found", "Route not found");
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
      sendError(
        reply,
        request,
        413,
        "request.body-too-large",
        "Request body exceeds the configured limit",
      );
      return;
    }
    const statusCode =
      typeof error.statusCode === "number" && error.statusCode >= 400
        ? error.statusCode
        : 500;
    sendError(
      reply,
      request,
      statusCode,
      statusCode >= 500 ? "internal.error" : "request.invalid",
      statusCode >= 500 ? "Internal server error" : error.message,
    );
  });

  await app.ready();
  return app;
}
