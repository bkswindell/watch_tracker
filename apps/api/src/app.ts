import { randomBytes } from "node:crypto";

import helmet from "@fastify/helmet";
import staticFiles from "@fastify/static";
import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";

import { WATCH_TRACKER_API_SERVICE } from "../../../packages/contracts/src/health.js";
import type { SliceStore } from "./slice.js";

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
}

export const API_SERVER_LIMITS = Object.freeze({
  connectionTimeout: 10_000,
  requestTimeout: 30_000,
  keepAliveTimeout: 5_000,
  bodyLimit: 1_048_576,
});

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
        imgSrc: ["'self'"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'"],
        upgradeInsecureRequests: null,
      },
    },
  });

  app.addHook("onRequest", async (request, reply) => {
    void reply.header("x-request-id", request.id);
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
      return found;
    }
    async function requireCsrf(request: FastifyRequest, reply: FastifyReply) {
      const found = await requireAuth(request, reply);
      const csrf = readCsrf(request);
      if (!found || !csrf || !(await store.validateCsrf(found.token, csrf))) {
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

    app.get("/api/bootstrap", async (request) => {
      const found = await session(request);
      return {
        setupRequired: await store.needsSetup(),
        authenticated: Boolean(found?.value),
        csrfToken: found?.value?.csrfToken || readCsrf(request) || setupCsrf,
      };
    });
    app.post("/api/setup", async (request, reply) => {
      if (readCsrf(request) !== setupCsrf) {
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
    app.post<{ Body: { password?: unknown } }>(
      "/api/login",
      async (request, reply) => {
        if (readCsrf(request) !== setupCsrf) {
          sendError(
            reply,
            request,
            403,
            "csrf.invalid",
            "A valid CSRF token is required",
          );
          return;
        }
        const password = request.body?.password;
        if (
          typeof password !== "string" ||
          password.length > 1024 ||
          !(await store.authenticate(password))
        ) {
          sendError(
            reply,
            request,
            401,
            "auth.invalid-credentials",
            "Invalid credentials",
          );
          return;
        }
        const created = await store.createSession();
        void reply
          .header(
            "set-cookie",
            `watch_tracker_session=${created.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800`,
          )
          .header("x-csrf-token", created.csrfToken)
          .status(204)
          .send();
      },
    );
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
