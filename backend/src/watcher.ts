import type { FastifyBaseLogger } from "fastify";
import { Horizon } from "@stellar/stellar-sdk";
import type { ObservedPayment } from "@stellar-reqpay/sdk";
import type { RequestService } from "./service.js";
import type { Repository } from "./repository/types.js";

/** Source of observed payments for a destination account, newest last. */
export interface PaymentSource {
  paymentsSince(
    destination: string,
    cursor: string | undefined,
  ): Promise<{ payments: ObservedPayment[]; cursor: string | undefined }>;
}

/**
 * Horizon-backed payment source. Horizon is used (rather than RPC) because
 * classic payments to an account are only indexed by Horizon; a Soroban
 * events source for contract assets is a roadmap item.
 */
export class HorizonPaymentSource implements PaymentSource {
  private readonly server: Horizon.Server;
  constructor(horizonUrl: string, allowHttp = false) {
    this.server = new Horizon.Server(horizonUrl, { allowHttp });
  }

  async paymentsSince(destination: string, cursor: string | undefined) {
    let builder = this.server
      .payments()
      .forAccount(destination)
      .order("asc")
      .limit(200)
      .join("transactions");
    if (cursor) builder = builder.cursor(cursor);
    const page = await builder.call();
    const payments: ObservedPayment[] = [];
    let next = cursor;
    for (const rec of page.records) {
      next = rec.paging_token;
      if (String(rec.type) !== "payment" || !rec.transaction_successful) continue;
      const r = rec as Horizon.ServerApi.PaymentOperationRecord & {
        transaction?: { memo?: string; memo_type?: string; ledger?: number };
      };
      if (r.to !== destination) continue;
      const memoType = r.transaction?.memo_type;
      const memo = r.transaction?.memo;
      payments.push({
        txHash: r.transaction_hash,
        ledger: r.transaction?.ledger ?? 0,
        timestamp: r.created_at,
        destination,
        source: r.from,
        asset: r.asset_type === "native" ? "native" : `${r.asset_code}:${r.asset_issuer}`,
        amount: r.amount,
        ...(memo && memoType && memoType !== "none"
          ? {
              memo: {
                type: memoType === "id" ? "id" : memoType === "hash" ? "hash" : "text",
                value: memo,
              },
            }
          : {}),
      });
    }
    return { payments, cursor: next };
  }
}

/**
 * Polls payment sources for every open request's destination and attributes
 * matching payments. One cursor per destination; safe to call repeatedly.
 */
export class PaymentWatcher {
  private readonly cursors = new Map<string, string | undefined>();
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly deps: {
      repo: Repository;
      service: RequestService;
      source: PaymentSource;
      log: FastifyBaseLogger;
    },
  ) {}

  /** One polling round. Returns the number of payments attributed. */
  async poll(): Promise<number> {
    const open = await this.deps.repo.listOpen(500);
    const byDestination = new Map<string, typeof open>();
    for (const s of open)
      byDestination.set(s.request.destination, [
        ...(byDestination.get(s.request.destination) ?? []),
        s,
      ]);
    let attributed = 0;
    for (const [destination, requests] of byDestination) {
      let result: Awaited<ReturnType<PaymentSource["paymentsSince"]>>;
      try {
        result = await this.deps.source.paymentsSince(destination, this.cursors.get(destination));
      } catch (err) {
        this.deps.log.warn({ err, destination }, "payment source unavailable");
        continue;
      }
      this.cursors.set(destination, result.cursor);
      for (const payment of result.payments) {
        for (const s of requests) {
          const view = await this.deps.service
            .recordPayment(s.request.id, payment)
            .catch(() => null);
          if (view) {
            attributed += 1;
            this.deps.log.info(
              { requestId: s.request.id, txHash: payment.txHash, status: view.status },
              "payment attributed",
            );
            break; // a payment belongs to at most one request
          }
        }
      }
    }
    return attributed;
  }

  start(intervalSeconds: number): void {
    if (intervalSeconds <= 0 || this.timer) return;
    const tick = () => {
      this.poll().catch((err: unknown) => this.deps.log.error({ err }, "watcher poll failed"));
    };
    this.timer = setInterval(tick, intervalSeconds * 1000);
    this.timer.unref();
    tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
