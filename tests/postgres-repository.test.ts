/** Runs only when DATABASE_URL is set (CI provides a Postgres service container). */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { PostgresRepository } from "../backend/src/repository/postgres.js";

const url = process.env.DATABASE_URL;
const DEST = "GAEB2QI5MVRGIBBJRSPYLQQ7WCLDFYFQ3Q2PRVMQBZQMEG3XF32OLBGA";

describe.skipIf(!url)("PostgresRepository", () => {
  let repo: PostgresRepository;
  beforeAll(() => {
    execFileSync("pnpm", ["exec", "tsx", "scripts/migrate.ts"], {
      env: { ...process.env, DATABASE_URL: url },
      stdio: "inherit",
    });
    repo = new PostgresRepository(url!);
  });
  afterAll(async () => repo?.close());

  it("stores, updates, lists and finds payments", async () => {
    const id = `pg-${Date.now()}`;
    const now = new Date().toISOString();
    await repo.create({
      request: {
        v: "REQPAY/1",
        id,
        network: "Test SDF Network ; September 2015",
        destination: DEST,
        asset: "native",
        amount: "1",
        created_at: now,
      },
      status: "pending",
      cancelled: false,
      payments: [],
      createdAt: now,
      updatedAt: now,
    });
    expect((await repo.get(id))?.status).toBe("pending");
    expect((await repo.listOpen(1000)).some((s) => s.request.id === id)).toBe(true);
    const tx = "1".repeat(64);
    await repo.update(id, {
      status: "paid",
      cancelled: false,
      payments: [
        { tx_hash: tx, ledger: 1, paid_at: now, amount: "1", asset: "native", source: DEST },
      ],
      updatedAt: now,
    });
    expect(await repo.hasPayment(tx)).toBe(true);
    expect(await repo.hasPayment("2".repeat(64))).toBe(false);
    const page = await repo.list(1, 10, "paid");
    expect(page.items.some((s) => s.request.id === id)).toBe(true);
  });
});
