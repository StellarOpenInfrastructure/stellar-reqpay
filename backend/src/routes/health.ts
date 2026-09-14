import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Repository } from "../repository/types.js";

export async function healthRoutes(
  app: FastifyInstance,
  deps: { repo: Repository; version: string; storage: string; watcher: boolean },
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.get(
    "/health",
    {
      schema: {
        tags: ["system"],
        response: { 200: z.object({ status: z.literal("ok"), version: z.string() }) },
      },
    },
    async () => ({ status: "ok" as const, version: deps.version }),
  );
  r.get(
    "/ready",
    {
      schema: {
        tags: ["system"],
        response: {
          200: z.object({ status: z.literal("ready"), checks: z.record(z.string(), z.string()) }),
          503: z.object({
            status: z.literal("not_ready"),
            checks: z.record(z.string(), z.string()),
          }),
        },
      },
    },
    async (_req, reply) => {
      const checks: Record<string, string> = { watcher: deps.watcher ? "running" : "disabled" };
      try {
        await deps.repo.ping();
        checks.storage = deps.storage;
        return { status: "ready" as const, checks };
      } catch (err) {
        checks.storage = err instanceof Error ? err.message : "unavailable";
        return reply.status(503).send({ status: "not_ready" as const, checks });
      }
    },
  );
}
