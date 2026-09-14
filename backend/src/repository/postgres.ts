import postgres from "postgres";
import type { PaymentRecord, PaymentRequest, PaymentStatus } from "@stellar-reqpay/sdk";
import type { Repository, StoredRequest } from "./types.js";

interface Row {
  id: string;
  request: PaymentRequest;
  signature: string | null;
  signer: string | null;
  status: string;
  cancelled: boolean;
  payments: PaymentRecord[];
  created_at: Date;
  updated_at: Date;
}

function rowToStored(r: Row): StoredRequest {
  return {
    request: r.request,
    ...(r.signature ? { signature: r.signature } : {}),
    ...(r.signer ? { signer: r.signer } : {}),
    status: r.status as PaymentStatus,
    cancelled: r.cancelled,
    payments: r.payments,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

/** Schema in database/migrations; applied by `pnpm run migrate`. */
export class PostgresRepository implements Repository {
  private readonly sql: ReturnType<typeof postgres>;

  constructor(databaseUrl: string) {
    this.sql = postgres(databaseUrl, { max: 10, transform: { undefined: null } });
  }

  async create(s: StoredRequest): Promise<void> {
    await this.sql`insert into payment_requests ${this.sql({
      id: s.request.id,
      request: this.sql.json(s.request as never),
      signature: s.signature ?? null,
      signer: s.signer ?? null,
      status: s.status,
      cancelled: s.cancelled,
      payments: this.sql.json(s.payments as never),
      created_at: new Date(s.createdAt),
      updated_at: new Date(s.updatedAt),
    })}`;
  }

  async get(id: string): Promise<StoredRequest | undefined> {
    const rows = await this.sql<Row[]>`select * from payment_requests where id = ${id}`;
    return rows[0] ? rowToStored(rows[0]) : undefined;
  }

  async update(
    id: string,
    patch: Pick<StoredRequest, "status" | "cancelled" | "payments" | "updatedAt">,
  ): Promise<StoredRequest | undefined> {
    const rows = await this.sql<Row[]>`
      update payment_requests set status = ${patch.status}, cancelled = ${patch.cancelled},
        payments = ${this.sql.json(patch.payments)}, updated_at = ${new Date(patch.updatedAt)}
      where id = ${id} returning *`;
    return rows[0] ? rowToStored(rows[0]) : undefined;
  }

  async listOpen(limit: number): Promise<StoredRequest[]> {
    const rows = await this.sql<Row[]>`
      select * from payment_requests where status in ('pending', 'underpaid') order by created_at asc limit ${limit}`;
    return rows.map(rowToStored);
  }

  async hasPayment(txHash: string): Promise<boolean> {
    const rows = await this.sql<{ exists: boolean }[]>`
      select exists(select 1 from payment_requests, jsonb_array_elements(payments) p where p->>'tx_hash' = ${txHash}) as exists`;
    return rows[0]?.exists ?? false;
  }

  async list(page: number, pageSize: number, status?: PaymentStatus) {
    const where = status ? this.sql`where status = ${status}` : this.sql``;
    const [count] = await this.sql<
      { count: string }[]
    >`select count(*)::text as count from payment_requests ${where}`;
    const rows = await this.sql<Row[]>`
      select * from payment_requests ${where} order by created_at desc limit ${pageSize} offset ${(page - 1) * pageSize}`;
    return { items: rows.map(rowToStored), total: Number(count?.count ?? 0) };
  }

  async ping(): Promise<void> {
    await this.sql`select 1`;
  }
  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }
}
