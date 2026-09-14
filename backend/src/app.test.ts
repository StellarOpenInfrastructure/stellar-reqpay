import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { decodeUri, verifyRequest, type ObservedPayment } from "@stellar-reqpay/sdk";
import { buildApp, type App } from "./app.js";
import { loadConfig } from "./config.js";
import { InMemoryRepository } from "./repository/memory.js";
import { PaymentWatcher, type PaymentSource } from "./watcher.js";

const DEST = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 1)).publicKey();
const PAYER = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 2)).publicKey();
const SIGNER = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 9));

describe("reqpay API", () => {
  let app: App;
  let clock = new Date("2026-03-01T10:00:00Z");

  beforeAll(async () => {
    const config = loadConfig({
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      PUBLIC_BASE_URL: "https://pay.example",
      REQPAY_SIGNING_SEED: SIGNER.secret(),
      MERCHANT_NAME: "Beanery",
      MERCHANT_DOMAIN: "beanery.example",
      DEFAULT_EXPIRY_SECONDS: "600",
    });
    app = await buildApp(config, { repo: new InMemoryRepository(), now: () => clock });
    await app.ready();
  });
  afterAll(async () => app.close());

  it("health/ready", async () => {
    expect((await app.inject({ url: "/health" })).json()).toMatchObject({ status: "ok" });
    expect((await app.inject({ url: "/ready" })).json()).toEqual({
      status: "ready",
      checks: { storage: "injected", watcher: "disabled" },
    });
  });

  let id: string;

  it("creates a signed request with links", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/requests",
      payload: {
        destination: DEST,
        asset: "native",
        amount: "12.5",
        memo: { type: "id", value: "42" },
        description: "Order 42",
        reference: "ORD-42",
      },
    });
    expect(res.statusCode).toBe(201);
    const view = res.json();
    id = view.request.id;
    expect(view.request).toMatchObject({
      v: "REQPAY/1",
      destination: DEST,
      amount: "12.5",
      expires_at: "2026-03-01T10:10:00.000Z",
      merchant: { domain: "beanery.example" },
    });
    expect(view.request.status_url).toBe(`https://pay.example/r/${id}/status`);
    expect(view.status).toBe("pending");
    expect(view.links.hosted).toBe(`https://pay.example/r/${id}`);
    expect(view.links.sep7).toContain("web+stellar:pay?destination=");
    const decoded = decodeUri(view.links.uri);
    expect(verifyRequest(decoded.request, decoded.signature!, SIGNER.publicKey())).toBe(true);
    expect(view.signer).toBe(SIGNER.publicKey());
  });

  it("rejects invalid input and duplicate ids", async () => {
    const bad = await app.inject({
      method: "POST",
      url: "/api/v1/requests",
      payload: { destination: "nope", asset: "native" },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe("VALIDATION_ERROR");
    const dup = await app.inject({
      method: "POST",
      url: "/api/v1/requests",
      payload: { id, destination: DEST, asset: "native" },
    });
    expect(dup.statusCode).toBe(409);
  });

  it("serves the hosted link with the REQPAY media type", async () => {
    const res = await app.inject({ url: `/r/${id}` });
    expect(res.headers["content-type"]).toContain("application/reqpay+json");
    expect(res.json().request.id).toBe(id);
    const status = await app.inject({ url: `/r/${id}/status` });
    expect(status.json()).toMatchObject({ v: "REQPAY/1", id, status: "pending", received: "0" });
  });

  it("renders a QR code", async () => {
    const res = await app.inject({ url: `/api/v1/requests/${id}/qr.svg` });
    expect(res.headers["content-type"]).toContain("image/svg+xml");
    expect(res.body).toContain("<svg");
  });

  it("attributes matching payments and ignores mismatches and duplicates", async () => {
    const payment = {
      txHash: "b".repeat(64),
      ledger: 10,
      timestamp: "2026-03-01T10:02:00Z",
      destination: DEST,
      source: PAYER,
      asset: "native",
      amount: "5",
      memo: { type: "id", value: "42" },
    };
    const under = await app.inject({
      method: "POST",
      url: `/api/v1/requests/${id}/payments`,
      payload: payment,
    });
    expect(under.json().status).toBe("underpaid");
    expect(under.json().received).toBe("5");

    const wrongMemo = await app.inject({
      method: "POST",
      url: `/api/v1/requests/${id}/payments`,
      payload: { ...payment, txHash: "c".repeat(64), memo: { type: "id", value: "43" } },
    });
    expect(wrongMemo.statusCode).toBe(202);

    const dup = await app.inject({
      method: "POST",
      url: `/api/v1/requests/${id}/payments`,
      payload: payment,
    });
    expect(dup.statusCode).toBe(202);

    const rest = await app.inject({
      method: "POST",
      url: `/api/v1/requests/${id}/payments`,
      payload: { ...payment, txHash: "d".repeat(64), amount: "7.5" },
    });
    expect(rest.json().status).toBe("paid");
    expect(rest.json().received).toBe("12.5");

    const cancel = await app.inject({ method: "POST", url: `/api/v1/requests/${id}/cancel` });
    expect(cancel.statusCode).toBe(409);
  });

  it("expires pending requests over time and supports cancel", async () => {
    const created = (
      await app.inject({
        method: "POST",
        url: "/api/v1/requests",
        payload: { destination: DEST, asset: "native", amount: "1", expires_in: 60 },
      })
    ).json();
    clock = new Date("2026-03-01T10:05:00Z");
    expect(
      (await app.inject({ url: `/api/v1/requests/${created.request.id}/status` })).json().status,
    ).toBe("expired");
    clock = new Date("2026-03-01T10:00:30Z");

    const open = (
      await app.inject({
        method: "POST",
        url: "/api/v1/requests",
        payload: { destination: DEST, asset: "native" },
      })
    ).json();
    expect(open.request.amount).toBeUndefined();
    const cancelled = await app.inject({
      method: "POST",
      url: `/api/v1/requests/${open.request.id}/cancel`,
    });
    expect(cancelled.json().status).toBe("cancelled");
    const late = await app.inject({
      method: "POST",
      url: `/api/v1/requests/${open.request.id}/payments`,
      payload: {
        txHash: "e".repeat(64),
        ledger: 1,
        timestamp: "2026-03-01T10:00:40Z",
        destination: DEST,
        source: PAYER,
        asset: "native",
        amount: "1",
      },
    });
    expect(late.statusCode).toBe(409);
  });

  it("lists with pagination and filters", async () => {
    const res = await app.inject({ url: "/api/v1/requests?status=paid&pageSize=10" });
    expect(res.json().total).toBe(1);
    expect(res.json().items[0].request.id).toBe(id);
    expect((await app.inject({ url: "/api/v1/requests/does-not-exist" })).statusCode).toBe(404);
  });

  it("serves OpenAPI", async () => {
    const doc = (await app.inject({ url: "/api/v1/openapi.json" })).json();
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining([
        "/api/v1/requests",
        "/api/v1/requests/{id}/status",
        "/api/v1/requests/{id}/payments",
      ]),
    );
  });
});

describe("PaymentWatcher", () => {
  it("polls a source per destination and attributes payments once", async () => {
    const repo = new InMemoryRepository();
    const config = loadConfig({
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      PUBLIC_BASE_URL: "https://pay.example",
    });
    const app = await buildApp(config, { repo, now: () => new Date("2026-03-01T10:00:00Z") });
    const created = await app.service.create({
      destination: DEST,
      asset: "native",
      amount: "3",
      memo: { type: "text", value: "w-1" },
    });
    const payments: ObservedPayment[] = [
      {
        txHash: "f".repeat(64),
        ledger: 5,
        timestamp: "2026-03-01T10:01:00Z",
        destination: DEST,
        source: PAYER,
        asset: "native",
        amount: "3",
        memo: { type: "text", value: "w-1" },
      },
    ];
    const calls: (string | undefined)[] = [];
    const source: PaymentSource = {
      async paymentsSince(_destination, cursor) {
        calls.push(cursor);
        return cursor ? { payments: [], cursor } : { payments, cursor: "c1" };
      },
    };
    const watcher = new PaymentWatcher({ repo, service: app.service, source, log: app.log });
    expect(await watcher.poll()).toBe(1);
    expect((await app.service.get(created.request.id)).status).toBe("paid");
    expect(await watcher.poll()).toBe(0); // request no longer open; nothing polled
    expect(calls).toEqual([undefined]);
    await app.close();
  });
});
