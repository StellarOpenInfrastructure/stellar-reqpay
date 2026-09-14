import { z } from "zod";

export const PROTOCOL_VERSION = "REQPAY/1" as const;

export const accountId = z.string().regex(/^[GM][A-Z2-7]{55}$/, "invalid Stellar destination");
export const contractId = z.string().regex(/^C[A-Z2-7]{55}$/, "invalid contract id");
export const assetKey = z
  .string()
  .regex(
    /^(native|[A-Za-z0-9]{1,12}:G[A-Z2-7]{55}|contract:C[A-Z2-7]{55})$/,
    "asset must be native, CODE:ISSUER or contract:C...",
  );
export const amountString = z
  .string()
  .regex(/^\d+(\.\d{1,7})?$/, "amount must be a positive decimal with ≤ 7 fractional digits")
  .refine((a) => Number(a) > 0, "amount must be > 0");

export const memoSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), value: z.string().min(1).max(28) }),
  z.object({ type: z.literal("id"), value: z.string().regex(/^\d{1,20}$/) }),
  z.object({ type: z.literal("hash"), value: z.string().regex(/^[0-9a-f]{64}$/) }),
]);

export const merchantSchema = z.object({
  name: z.string().min(1).max(120),
  /** Domain hosting stellar.toml with URI_REQUEST_SIGNING_KEY. */
  domain: z
    .string()
    .min(1)
    .max(253)
    .regex(/^[a-z0-9.-]+$/i),
});

/**
 * REQPAY/1 payment request. Field order in this schema is not significant;
 * canonical encoding sorts keys (see canonical.ts).
 */
export const paymentRequestSchema = z
  .object({
    v: z.literal(PROTOCOL_VERSION),
    /** Unique request id chosen by the issuer (ULID/UUID recommended). */
    id: z
      .string()
      .min(8)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/),
    /** Network passphrase. */
    network: z.string().min(1).max(200),
    destination: accountId,
    asset: assetKey,
    /** Omit for open-amount requests (tips, donations). */
    amount: amountString.optional(),
    memo: memoSchema.optional(),
    /** ISO-8601; after this the request must not be paid. */
    expires_at: z.string().datetime({ offset: true }).optional(),
    /** ISO-8601 creation time. */
    created_at: z.string().datetime({ offset: true }),
    description: z.string().max(280).optional(),
    merchant: merchantSchema.optional(),
    /** Issuer-side order/invoice reference. */
    reference: z.string().max(128).optional(),
    /** Where wallets can fetch live status (GET, application/reqpay+json). */
    status_url: z.string().url().max(2048).optional(),
    /** Where the payer is sent after paying (https only). */
    return_url: z.string().url().max(2048).startsWith("https://").optional(),
    /** Free-form, ≤ 2 KB when serialized. */
    metadata: z
      .record(z.string().max(64), z.union([z.string().max(512), z.number(), z.boolean()]))
      .optional(),
  })
  .strict()
  .refine((r) => !r.expires_at || Date.parse(r.expires_at) > Date.parse(r.created_at), {
    message: "expires_at must be after created_at",
  })
  .refine((r) => !r.metadata || JSON.stringify(r.metadata).length <= 2048, {
    message: "metadata exceeds 2048 bytes",
  })
  .refine((r) => !(r.asset.startsWith("contract:") && r.amount?.includes(".")), {
    message: "contract asset amounts must be integers in token units",
  });

export type PaymentRequest = z.infer<typeof paymentRequestSchema>;
export type PaymentRequestInput = z.input<typeof paymentRequestSchema>;

/** A request together with its issuer signature (base64) and the signing key. */
export const signedRequestSchema = z.object({
  request: paymentRequestSchema,
  /** Ed25519 signature over canonical JSON, base64. */
  signature: z.string().base64().optional(),
  /** G... key that produced the signature. Verify it against merchant.domain's stellar.toml. */
  signer: z
    .string()
    .regex(/^G[A-Z2-7]{55}$/)
    .optional(),
});
export type SignedRequest = z.infer<typeof signedRequestSchema>;

export const paymentStatusSchema = z.enum(["pending", "paid", "underpaid", "expired", "cancelled"]);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export const paymentRecordSchema = z.object({
  tx_hash: z.string().regex(/^[0-9a-f]{64}$/),
  ledger: z.number().int().nonnegative(),
  paid_at: z.string().datetime({ offset: true }),
  amount: z.string(),
  asset: assetKey,
  source: z.string(),
});
export type PaymentRecord = z.infer<typeof paymentRecordSchema>;

export const statusResponseSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  id: z.string(),
  status: paymentStatusSchema,
  /** Sum received so far (open-amount requests report the running total). */
  received: z.string(),
  payments: z.array(paymentRecordSchema),
  updated_at: z.string().datetime({ offset: true }),
});
export type StatusResponse = z.infer<typeof statusResponseSchema>;
