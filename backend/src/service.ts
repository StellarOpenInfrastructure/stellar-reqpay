import { randomUUID } from "node:crypto";
import type { Keypair } from "@stellar/stellar-sdk";
import {
  deriveStatus,
  encodeUri,
  hostedLink,
  matchesRequest,
  parseRequest,
  signRequest,
  toPaymentRecord,
  toSep7,
  totalReceived,
  type ObservedPayment,
  type PaymentRequest,
  type PaymentRequestInput,
  type StatusResponse,
} from "@stellar-reqpay/sdk";
import { HttpError } from "./errors.js";
import type { Repository, StoredRequest } from "./repository/types.js";

export interface ServiceOptions {
  repo: Repository;
  publicBaseUrl: string;
  networkPassphrase: string;
  defaultExpirySeconds: number;
  signer?: Keypair;
  merchant?: { name: string; domain: string };
  now?: () => Date;
}

export type CreateInput = Omit<
  PaymentRequestInput,
  "v" | "id" | "network" | "created_at" | "status_url"
> & {
  id?: string;
  /** Seconds from now; ignored when expires_at is given. */
  expires_in?: number;
};

export interface RequestView {
  request: PaymentRequest;
  signature?: string;
  signer?: string;
  status: StatusResponse["status"];
  received: string;
  payments: StoredRequest["payments"];
  links: { uri: string; hosted: string; sep7?: string };
  updated_at: string;
}

/** Application logic shared by HTTP routes and the payment watcher. */
export class RequestService {
  private readonly now: () => Date;

  constructor(private readonly opts: ServiceOptions) {
    this.now = opts.now ?? (() => new Date());
  }

  async create(input: CreateInput): Promise<RequestView> {
    const now = this.now();
    const id = input.id ?? randomUUID();
    const { expires_in, ...rest } = input;
    const expires_at =
      rest.expires_at ??
      new Date(now.getTime() + (expires_in ?? this.opts.defaultExpirySeconds) * 1000).toISOString();
    const request = parseRequest({
      ...rest,
      v: "REQPAY/1",
      id,
      network: this.opts.networkPassphrase,
      created_at: now.toISOString(),
      expires_at,
      status_url: `${hostedLink(this.opts.publicBaseUrl, id)}/status`,
      ...((rest.merchant ?? this.opts.merchant)
        ? { merchant: rest.merchant ?? this.opts.merchant }
        : {}),
    });
    const stored: StoredRequest = {
      request,
      ...(this.opts.signer
        ? {
            signature: signRequest(request, this.opts.signer),
            signer: this.opts.signer.publicKey(),
          }
        : {}),
      status: "pending",
      cancelled: false,
      payments: [],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    if (await this.opts.repo.get(id))
      throw new HttpError(409, "REQUEST_EXISTS", `request ${id} already exists`);
    await this.opts.repo.create(stored);
    return this.view(stored);
  }

  async get(id: string): Promise<RequestView> {
    const stored = await this.requireStored(id);
    return this.view(await this.refreshStatus(stored));
  }

  async status(id: string): Promise<StatusResponse> {
    const stored = await this.refreshStatus(await this.requireStored(id));
    return {
      v: "REQPAY/1",
      id,
      status: stored.status,
      received: totalReceived(stored.request, stored.payments),
      payments: stored.payments,
      updated_at: stored.updatedAt,
    };
  }

  async cancel(id: string): Promise<RequestView> {
    const stored = await this.requireStored(id);
    if (stored.status === "paid")
      throw new HttpError(409, "ALREADY_PAID", "paid requests cannot be cancelled");
    if (stored.cancelled) return this.view(stored);
    const updated = await this.opts.repo.update(id, {
      status: "cancelled",
      cancelled: true,
      payments: stored.payments,
      updatedAt: this.now().toISOString(),
    });
    return this.view(updated!);
  }

  /**
   * Attribute an observed payment to a request. Returns the updated view, or null if
   * the payment does not match or was already recorded (idempotent).
   */
  async recordPayment(
    id: string,
    payment: ObservedPayment,
    opts: { allowLate?: boolean } = {},
  ): Promise<RequestView | null> {
    const stored = await this.requireStored(id);
    if (stored.cancelled) throw new HttpError(409, "REQUEST_CANCELLED", "request is cancelled");
    if (!matchesRequest(stored.request, payment, opts)) return null;
    if (
      stored.payments.some((p) => p.tx_hash === payment.txHash) ||
      (await this.opts.repo.hasPayment(payment.txHash))
    )
      return null;
    const payments = [...stored.payments, toPaymentRecord(payment)];
    const status = deriveStatus(stored.request, payments, { now: this.now() });
    const updated = await this.opts.repo.update(id, {
      status,
      cancelled: false,
      payments,
      updatedAt: this.now().toISOString(),
    });
    return this.view(updated!);
  }

  /** Re-derive time-based status (pending → expired) and persist if it changed. */
  private async refreshStatus(stored: StoredRequest): Promise<StoredRequest> {
    const status = deriveStatus(stored.request, stored.payments, {
      cancelled: stored.cancelled,
      now: this.now(),
    });
    if (status === stored.status) return stored;
    return (
      (await this.opts.repo.update(stored.request.id, {
        status,
        cancelled: stored.cancelled,
        payments: stored.payments,
        updatedAt: this.now().toISOString(),
      })) ?? stored
    );
  }

  private async requireStored(id: string): Promise<StoredRequest> {
    const stored = await this.opts.repo.get(id);
    if (!stored) throw new HttpError(404, "REQUEST_NOT_FOUND", `request ${id} not found`);
    return stored;
  }

  view(stored: StoredRequest): RequestView {
    const signed = {
      request: stored.request,
      ...(stored.signature ? { signature: stored.signature, signer: stored.signer } : {}),
    };
    let sep7: string | undefined;
    try {
      sep7 = toSep7(stored.request);
    } catch {
      sep7 = undefined; // contract assets have no SEP-7 form
    }
    return {
      request: stored.request,
      ...(stored.signature ? { signature: stored.signature, signer: stored.signer } : {}),
      status: stored.status,
      received: totalReceived(stored.request, stored.payments),
      payments: stored.payments,
      links: {
        uri: encodeUri(signed),
        hosted: hostedLink(this.opts.publicBaseUrl, stored.request.id),
        ...(sep7 ? { sep7 } : {}),
      },
      updated_at: stored.updatedAt,
    };
  }
}
