import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  accountId,
  amountString,
  assetKey,
  memoSchema,
  merchantSchema,
  paymentRecordSchema,
  paymentRequestSchema,
  paymentStatusSchema,
  statusResponseSchema,
  toQrSvg,
} from "@stellar-reqpay/sdk";
import type { RequestService } from "../service.js";
import type { Repository } from "../repository/types.js";

const createBody = z
  .object({
    id: z
      .string()
      .min(8)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
    destination: accountId,
    asset: assetKey,
    amount: amountString.optional(),
    memo: memoSchema.optional(),
    expires_at: z.string().datetime({ offset: true }).optional(),
    expires_in: z
      .number()
      .int()
      .min(30)
      .max(30 * 86_400)
      .optional(),
    description: z.string().max(280).optional(),
    merchant: merchantSchema.optional(),
    reference: z.string().max(128).optional(),
    return_url: z.string().url().startsWith("https://").optional(),
    metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  })
  .strict();

const viewSchema = z.object({
  request: paymentRequestSchema,
  signature: z.string().optional(),
  signer: z.string().optional(),
  status: paymentStatusSchema,
  received: z.string(),
  payments: z.array(paymentRecordSchema),
  links: z.object({ uri: z.string(), hosted: z.string(), sep7: z.string().optional() }),
  updated_at: z.string(),
});

const observedPaymentBody = z.object({
  txHash: z.string().regex(/^[0-9a-f]{64}$/),
  ledger: z.number().int().nonnegative(),
  timestamp: z.string().datetime({ offset: true }),
  destination: accountId,
  source: z.string(),
  asset: assetKey,
  amount: amountString,
  memo: memoSchema.optional(),
  allowLate: z.boolean().optional(),
});

const idParam = z.object({ id: z.string().min(8).max(64) });

export async function requestRoutes(
  app: FastifyInstance,
  deps: { service: RequestService; repo: Repository },
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    "/requests",
    {
      schema: {
        tags: ["requests"],
        summary: "Create a payment request",
        body: createBody,
        response: { 201: viewSchema },
      },
    },
    async (req, reply) => reply.status(201).send(await deps.service.create(req.body)),
  );

  r.get(
    "/requests",
    {
      schema: {
        tags: ["requests"],
        summary: "List requests",
        querystring: z.object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(200).default(50),
          status: paymentStatusSchema.optional(),
        }),
        response: {
          200: z.object({
            items: z.array(viewSchema),
            total: z.number().int(),
            page: z.number().int(),
            pageSize: z.number().int(),
          }),
        },
      },
    },
    async (req) => {
      const { page, pageSize, status } = req.query;
      const { items, total } = await deps.repo.list(page, pageSize, status);
      return { items: items.map((s) => deps.service.view(s)), total, page, pageSize };
    },
  );

  r.get(
    "/requests/:id",
    {
      schema: {
        tags: ["requests"],
        summary: "Get a request with links and status",
        params: idParam,
        response: { 200: viewSchema },
      },
    },
    async (req) => deps.service.get(req.params.id),
  );

  r.get(
    "/requests/:id/status",
    {
      schema: {
        tags: ["requests"],
        summary: "REQPAY/1 status document",
        params: idParam,
        response: { 200: statusResponseSchema },
      },
    },
    async (req) => deps.service.status(req.params.id),
  );

  r.post(
    "/requests/:id/cancel",
    {
      schema: {
        tags: ["requests"],
        summary: "Cancel a request",
        params: idParam,
        response: { 200: viewSchema },
      },
    },
    async (req) => deps.service.cancel(req.params.id),
  );

  r.post(
    "/requests/:id/payments",
    {
      schema: {
        tags: ["requests"],
        summary: "Attribute an observed on-chain payment to a request (manual or webhook)",
        params: idParam,
        body: observedPaymentBody,
        response: {
          200: viewSchema,
          202: z.object({ attributed: z.literal(false), reason: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const { allowLate, ...payment } = req.body;
      const view = await deps.service.recordPayment(req.params.id, payment, {
        ...(allowLate !== undefined ? { allowLate } : {}),
      });
      if (!view)
        return reply.status(202).send({
          attributed: false as const,
          reason: "payment does not match the request or was already recorded",
        });
      return view;
    },
  );

  r.get(
    "/requests/:id/qr.svg",
    {
      schema: {
        tags: ["requests"],
        summary: "QR code (SVG) of the REQPAY URI",
        params: idParam,
        querystring: z.object({ link: z.enum(["uri", "hosted"]).default("uri") }),
        produces: ["image/svg+xml"],
      },
    },
    async (req, reply) => {
      const view = await deps.service.get(req.params.id);
      const svg = await toQrSvg(req.query.link === "hosted" ? view.links.hosted : view.links.uri);
      return reply
        .header("content-type", "image/svg+xml")
        .header("cache-control", "no-store")
        .send(svg);
    },
  );
}

/** Public hosted-link endpoints (no /api prefix): GET /r/:id and GET /r/:id/status. */
export async function hostedRoutes(
  app: FastifyInstance,
  deps: { service: RequestService },
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.get("/r/:id", { schema: { hide: true, params: idParam } }, async (req, reply) => {
    const view = await deps.service.get(req.params.id);
    const body = {
      request: view.request,
      ...(view.signature ? { signature: view.signature, signer: view.signer } : {}),
    };
    return reply
      .header("content-type", "application/reqpay+json; charset=utf-8")
      .header("cache-control", "no-store")
      .send(JSON.stringify(body));
  });
  r.get("/r/:id/status", { schema: { hide: true, params: idParam } }, async (req, reply) =>
    reply
      .header("content-type", "application/reqpay+json; charset=utf-8")
      .header("cache-control", "no-store")
      .send(JSON.stringify(await deps.service.status(req.params.id))),
  );
}
