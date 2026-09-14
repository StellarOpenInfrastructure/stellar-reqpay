import type { PaymentStatus } from "@stellar-reqpay/sdk";
import type { Repository, StoredRequest } from "./types.js";

export class InMemoryRepository implements Repository {
  private readonly items = new Map<string, StoredRequest>();

  async create(stored: StoredRequest): Promise<void> {
    if (this.items.has(stored.request.id)) throw new Error("duplicate id");
    this.items.set(stored.request.id, structuredClone(stored));
  }
  async get(id: string): Promise<StoredRequest | undefined> {
    const s = this.items.get(id);
    return s ? structuredClone(s) : undefined;
  }
  async update(
    id: string,
    patch: Pick<StoredRequest, "status" | "cancelled" | "payments" | "updatedAt">,
  ): Promise<StoredRequest | undefined> {
    const s = this.items.get(id);
    if (!s) return undefined;
    const updated = { ...s, ...structuredClone(patch) };
    this.items.set(id, updated);
    return structuredClone(updated);
  }
  async listOpen(limit: number): Promise<StoredRequest[]> {
    return [...this.items.values()]
      .filter((s) => s.status === "pending" || s.status === "underpaid")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, limit)
      .map((s) => structuredClone(s));
  }
  async hasPayment(txHash: string): Promise<boolean> {
    for (const s of this.items.values())
      if (s.payments.some((p) => p.tx_hash === txHash)) return true;
    return false;
  }
  async list(page: number, pageSize: number, status?: PaymentStatus) {
    const all = [...this.items.values()]
      .filter((s) => !status || s.status === status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return {
      items: all.slice((page - 1) * pageSize, page * pageSize).map((s) => structuredClone(s)),
      total: all.length,
    };
  }
  async ping(): Promise<void> {}
  async close(): Promise<void> {}
}
