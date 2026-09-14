import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { Keypair } from "@stellar/stellar-sdk";
import type { AppConfig } from "./config.js";
import { errorHandler } from "./errors.js";
import { createLogger } from "./logger.js";
import { InMemoryRepository, PostgresRepository, type Repository } from "./repository/index.js";
import { healthRoutes } from "./routes/health.js";
import { hostedRoutes, requestRoutes } from "./routes/requests.js";
import { RequestService } from "./service.js";
import { HorizonPaymentSource, PaymentWatcher, type PaymentSource } from "./watcher.js";

export const APP_VERSION = "0.1.0";

export interface AppDeps {
  repo?: Repository;
  paymentSource?: PaymentSource;
  now?: () => Date;
}

export type App = Awaited<ReturnType<typeof buildApp>>;

export async function buildApp(config: AppConfig, deps: AppDeps = {}) {
  const app = Fastify({
    loggerInstance: createLogger(config.LOG_LEVEL, config.NODE_ENV === "development"),
    genReqId: (req) => (req.headers["x-request-id"] as string | undefined) ?? randomUUID(),
    requestIdHeader: "x-request-id",
    bodyLimit: 64 * 1024,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);
  app.addHook("onSend", async (req, reply) => {
    reply.header("x-request-id", req.id);
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin:
      config.CORS_ORIGINS === "*" ? true : config.CORS_ORIGINS.split(",").map((s) => s.trim()),
  });
  await app.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "stellar-reqpay API",
        description: "Open Request-to-Pay protocol server for Stellar (REQPAY/1).",
        version: APP_VERSION,
      },
      tags: [{ name: "system" }, { name: "requests" }],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  const repo =
    deps.repo ??
    (config.DATABASE_URL ? new PostgresRepository(config.DATABASE_URL) : new InMemoryRepository());
  const storage = deps.repo ? "injected" : config.DATABASE_URL ? "postgres" : "memory";
  if (storage === "memory" && config.NODE_ENV === "production")
    app.log.warn("DATABASE_URL is not set: in-memory storage loses requests on restart");

  const signer = config.REQPAY_SIGNING_SEED
    ? Keypair.fromSecret(config.REQPAY_SIGNING_SEED)
    : undefined;
  const service = new RequestService({
    repo,
    publicBaseUrl: config.PUBLIC_BASE_URL,
    networkPassphrase: config.networkPassphrase,
    defaultExpirySeconds: config.DEFAULT_EXPIRY_SECONDS,
    ...(signer ? { signer } : {}),
    ...(config.MERCHANT_NAME && config.MERCHANT_DOMAIN
      ? { merchant: { name: config.MERCHANT_NAME, domain: config.MERCHANT_DOMAIN } }
      : {}),
    ...(deps.now ? { now: deps.now } : {}),
  });

  let watcher: PaymentWatcher | undefined;
  const source =
    deps.paymentSource ??
    (config.horizonUrl
      ? new HorizonPaymentSource(config.horizonUrl, config.NODE_ENV !== "production")
      : undefined);
  if (source && config.WATCH_INTERVAL_SECONDS > 0) {
    watcher = new PaymentWatcher({ repo, service, source, log: app.log });
    app.addHook("onReady", async () => watcher!.start(config.WATCH_INTERVAL_SECONDS));
  }
  app.addHook("onClose", async () => {
    watcher?.stop();
    if (!deps.repo) await repo.close();
  });

  await app.register(async (i) =>
    healthRoutes(i, { repo, version: APP_VERSION, storage, watcher: Boolean(watcher) }),
  );
  await app.register(async (i) => hostedRoutes(i, { service }));
  await app.register(
    async (i) => {
      await requestRoutes(i, { service, repo });
      i.get("/openapi.json", { schema: { hide: true } }, async () => app.swagger());
    },
    { prefix: "/api/v1" },
  );
  return Object.assign(app, { service, repo, watcher });
}
