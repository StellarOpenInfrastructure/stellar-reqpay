import { describe, expect, it } from "vitest";
import { Keypair, Networks } from "@stellar/stellar-sdk";
import { canonicalize, signRequest, verifyRequest } from "./canonical.js";
import { DecodeError, decodeUri, encodeUri, hostedLink, parseRequest, toSep7 } from "./encoding.js";
import {
  deriveStatus,
  isExpired,
  matchesRequest,
  totalReceived,
  type ObservedPayment,
} from "./lifecycle.js";
import { toQrDataUrl, toQrSvg } from "./qr.js";
import { paymentRequestSchema, type PaymentRequest } from "./schema.js";

const DEST = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 1)).publicKey();
const ISSUER = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 2)).publicKey();
const SIGNER = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 3));

function req(overrides: Partial<PaymentRequest> = {}): PaymentRequest {
  return parseRequest({
    v: "REQPAY/1",
    id: "01J8ZK5R8V2Q6X4T9W7YB3N5MD",
    network: Networks.TESTNET,
    destination: DEST,
    asset: `USDC:${ISSUER}`,
    amount: "25.5",
    memo: { type: "text", value: "order-42" },
    created_at: "2026-03-01T10:00:00Z",
    expires_at: "2026-03-01T10:15:00Z",
    description: "Coffee beans",
    merchant: { name: "Beanery", domain: "beanery.example" },
    ...overrides,
  });
}

describe("schema", () => {
  it("rejects unknown fields, bad amounts and inverted expiry", () => {
    expect(paymentRequestSchema.safeParse({ ...req(), extra: 1 }).success).toBe(false);
    expect(paymentRequestSchema.safeParse({ ...req(), amount: "0" }).success).toBe(false);
    expect(paymentRequestSchema.safeParse({ ...req(), amount: "1.12345678" }).success).toBe(false);
    expect(
      paymentRequestSchema.safeParse({ ...req(), expires_at: "2026-03-01T09:00:00Z" }).success,
    ).toBe(false);
    expect(
      paymentRequestSchema.safeParse({ ...req(), return_url: "http://insecure" }).success,
    ).toBe(false);
  });
  it("requires integer amounts for contract assets", () => {
    const contract = `contract:${"C" + "A".repeat(55)}`;
    expect(
      paymentRequestSchema.safeParse({ ...req(), asset: contract, amount: "1.5" }).success,
    ).toBe(false);
  });
  it("accepts open-amount requests", () => {
    expect(req({ amount: undefined }).amount).toBeUndefined();
  });
});

describe("canonical + signatures", () => {
  it("canonicalizes deterministically", () => {
    expect(canonicalize({ b: 1, a: [{ d: 2, c: 1 }], u: undefined })).toBe(
      '{"a":[{"c":1,"d":2}],"b":1}',
    );
  });
  it("signs and verifies; tampering fails", () => {
    const r = req();
    const sig = signRequest(r, SIGNER);
    expect(verifyRequest(r, sig, SIGNER.publicKey())).toBe(true);
    expect(verifyRequest({ ...r, amount: "26" }, sig, SIGNER.publicKey())).toBe(false);
    expect(verifyRequest(r, sig, DEST)).toBe(false);
    expect(verifyRequest(r, "not-base64!!", SIGNER.publicKey())).toBe(false);
  });
});

describe("encoding", () => {
  it("round-trips a signed request through the URI", () => {
    const r = req();
    const signed = { request: r, signature: signRequest(r, SIGNER), signer: SIGNER.publicKey() };
    const uri = encodeUri(signed);
    expect(uri.startsWith("reqpay://v1/request?d=")).toBe(true);
    const decoded = decodeUri(uri);
    expect(decoded).toEqual(signed);
    expect(verifyRequest(decoded.request, decoded.signature!, decoded.signer!)).toBe(true);
  });
  it("rejects foreign or malformed URIs", () => {
    expect(() => decodeUri("https://example.com")).toThrow(DecodeError);
    expect(() => decodeUri("reqpay://v1/request?d=!!!")).toThrow(DecodeError);
    expect(() => decodeUri("reqpay://v2/request?d=e30")).toThrow(DecodeError);
  });
  it("builds hosted links and SEP-7 fallbacks", () => {
    expect(hostedLink("https://pay.example/", "abc")).toBe("https://pay.example/r/abc");
    const sep7 = toSep7(req());
    const url = new URL(sep7);
    expect(url.protocol).toBe("web+stellar:");
    expect(url.searchParams.get("destination")).toBe(DEST);
    expect(url.searchParams.get("asset_code")).toBe("USDC");
    expect(url.searchParams.get("memo_type")).toBe("MEMO_TEXT");
    expect(url.searchParams.get("origin_domain")).toBe("beanery.example");
    expect(() =>
      toSep7(req({ asset: `contract:${"C" + "A".repeat(55)}`, amount: "100" })),
    ).toThrow();
  });
});

describe("qr", () => {
  it("renders SVG and PNG data URLs", async () => {
    const uri = encodeUri({ request: req() });
    expect(await toQrSvg(uri)).toContain("<svg");
    expect(await toQrDataUrl(uri)).toMatch(/^data:image\/png;base64,/);
  });
});

describe("lifecycle", () => {
  const paid: ObservedPayment = {
    txHash: "a".repeat(64),
    ledger: 100,
    timestamp: "2026-03-01T10:05:00Z",
    destination: DEST,
    source: ISSUER,
    asset: `USDC:${ISSUER}`,
    amount: "25.5",
    memo: { type: "text", value: "order-42" },
  };

  it("matches payments by destination, asset, memo and time", () => {
    const r = req();
    expect(matchesRequest(r, paid)).toBe(true);
    expect(matchesRequest(r, { ...paid, memo: { type: "text", value: "other" } })).toBe(false);
    expect(matchesRequest(r, { ...paid, asset: "native" })).toBe(false);
    expect(matchesRequest(r, { ...paid, timestamp: "2026-03-01T11:00:00Z" })).toBe(false);
    expect(
      matchesRequest(r, { ...paid, timestamp: "2026-03-01T11:00:00Z" }, { allowLate: true }),
    ).toBe(true);
  });

  it("derives statuses", () => {
    const r = req();
    const rec = {
      tx_hash: paid.txHash,
      ledger: 100,
      paid_at: paid.timestamp,
      amount: "10",
      asset: paid.asset,
      source: ISSUER,
    };
    expect(deriveStatus(r, [], { now: new Date("2026-03-01T10:01:00Z") })).toBe("pending");
    expect(deriveStatus(r, [], { now: new Date("2026-03-01T10:16:00Z") })).toBe("expired");
    expect(deriveStatus(r, [rec])).toBe("underpaid");
    expect(deriveStatus(r, [rec, { ...rec, amount: "15.5" }])).toBe("paid");
    expect(deriveStatus(r, [rec], { cancelled: true })).toBe("cancelled");
    expect(totalReceived(r, [rec, { ...rec, asset: "native" }])).toBe("10");
    expect(deriveStatus(req({ amount: undefined }), [rec])).toBe("paid");
    expect(isExpired(r, new Date("2026-03-01T10:15:00Z"))).toBe(true);
  });
});
