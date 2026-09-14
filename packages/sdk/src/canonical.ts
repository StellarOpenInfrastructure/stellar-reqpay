import { Keypair } from "@stellar/stellar-sdk";
import type { PaymentRequest } from "./schema.js";

/**
 * Canonical JSON: keys sorted lexicographically at every level, no whitespace,
 * UTF-8, numbers as shortest round-trip. This is what gets signed.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(",")}}`;
}

const DOMAIN_SEPARATOR = "REQPAY/1 request\n";

function message(request: PaymentRequest): Buffer {
  return Buffer.from(DOMAIN_SEPARATOR + canonicalize(request), "utf8");
}

/** Sign a request with the issuer's Ed25519 key. Returns base64. */
export function signRequest(request: PaymentRequest, keypair: Keypair): string {
  if (!keypair.canSign()) throw new Error("keypair cannot sign");
  return Buffer.from(keypair.sign(message(request))).toString("base64");
}

/** Verify a base64 signature against a G... public key. Never throws on bad input. */
export function verifyRequest(request: PaymentRequest, signature: string, signer: string): boolean {
  try {
    return Keypair.fromPublicKey(signer).verify(message(request), Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}
