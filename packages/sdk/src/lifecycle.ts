import type { PaymentRecord, PaymentRequest, PaymentStatus } from "./schema.js";

const SCALE = 10_000_000n;

export function toUnits(amount: string, asset: string): bigint {
  if (asset.startsWith("contract:")) return BigInt(amount);
  const [whole = "0", frac = ""] = amount.split(".");
  return BigInt(whole) * SCALE + BigInt(frac.padEnd(7, "0").slice(0, 7));
}

export function fromUnits(units: bigint, asset: string): string {
  if (asset.startsWith("contract:")) return units.toString();
  const whole = units / SCALE;
  const frac = (units % SCALE).toString().padStart(7, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

export function isExpired(request: PaymentRequest, now: Date = new Date()): boolean {
  return request.expires_at !== undefined && Date.parse(request.expires_at) <= now.getTime();
}

export function secondsUntilExpiry(request: PaymentRequest, now: Date = new Date()): number | null {
  if (!request.expires_at) return null;
  return Math.max(0, Math.floor((Date.parse(request.expires_at) - now.getTime()) / 1000));
}

/** Total received in the request's asset. Payments in other assets are ignored. */
export function totalReceived(request: PaymentRequest, payments: PaymentRecord[]): string {
  const total = payments
    .filter((p) => p.asset === request.asset)
    .reduce((s, p) => s + toUnits(p.amount, request.asset), 0n);
  return fromUnits(total, request.asset);
}

/**
 * Derive status from payments and time. `cancelled` is sticky and must be passed in.
 * Open-amount requests are `paid` after any payment.
 */
export function deriveStatus(
  request: PaymentRequest,
  payments: PaymentRecord[],
  opts: { cancelled?: boolean; now?: Date } = {},
): PaymentStatus {
  if (opts.cancelled) return "cancelled";
  const received = toUnits(totalReceived(request, payments), request.asset);
  if (request.amount === undefined) {
    return received > 0n ? "paid" : isExpired(request, opts.now) ? "expired" : "pending";
  }
  const expected = toUnits(request.amount, request.asset);
  if (received >= expected) return "paid";
  if (received > 0n) return "underpaid";
  return isExpired(request, opts.now) ? "expired" : "pending";
}

/** An observed on-chain payment, provider-agnostic. */
export interface ObservedPayment {
  txHash: string;
  ledger: number;
  timestamp: string;
  destination: string;
  source: string;
  asset: string;
  amount: string;
  memo?: { type: "text" | "id" | "hash"; value: string };
}

/**
 * Does an observed payment belong to this request?
 * Match rules: destination, asset, memo (when the request specifies one) and,
 * unless `allowLate`, not after expiry.
 */
export function matchesRequest(
  request: PaymentRequest,
  payment: ObservedPayment,
  opts: { allowLate?: boolean } = {},
): boolean {
  if (payment.destination !== request.destination) return false;
  if (payment.asset !== request.asset) return false;
  if (request.memo) {
    if (
      !payment.memo ||
      payment.memo.type !== request.memo.type ||
      payment.memo.value !== request.memo.value
    )
      return false;
  }
  if (
    !opts.allowLate &&
    request.expires_at &&
    Date.parse(payment.timestamp) > Date.parse(request.expires_at)
  )
    return false;
  return true;
}

export function toPaymentRecord(payment: ObservedPayment): PaymentRecord {
  return {
    tx_hash: payment.txHash,
    ledger: payment.ledger,
    paid_at: payment.timestamp,
    amount: payment.amount,
    asset: payment.asset,
    source: payment.source,
  };
}
