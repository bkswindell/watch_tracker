import helmet from "@fastify/helmet";
import staticFiles from "@fastify/static";
import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";

import { WATCH_TRACKER_API_SERVICE } from "../../../packages/contracts/src/health.js";

export interface ReadinessResult {
  ready: boolean;
  reason?: string;
}

export type ReadinessProbe = () => Promise<ReadinessResult>;

export interface BuildAppOptions {
  readinessProbe: ReadinessProbe;
  bodyLimit?: number;
  webRoot?: string;
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
      if (result.ready) {
        return {
          status: "ready",
          requestId: request.id,
        };
      }

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
    const code = statusCode >= 500 ? "internal.error" : "request.invalid";
    const message = statusCode >= 500 ? "Internal server error" : error.message;
    sendError(reply, request, statusCode, code, message);
  });

  await app.ready();
  return app;
}
