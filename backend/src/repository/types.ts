import type { PaymentRecord, PaymentRequest, PaymentStatus } from "@stellar-reqpay/sdk";

export interface StoredRequest {
  request: PaymentRequest;
  signature?: string;
  signer?: string;
  status: PaymentStatus;
  cancelled: boolean;
  payments: PaymentRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface Repository {
  create(stored: StoredRequest): Promise<void>;
  get(id: string): Promise<StoredRequest | undefined>;
  /** Persist payments/status/cancelled; returns the updated record. */
  update(
    id: string,
    patch: Pick<StoredRequest, "status" | "cancelled" | "payments" | "updatedAt">,
  ): Promise<StoredRequest | undefined>;
  /** Pending/underpaid requests for the watcher, oldest first. */
  listOpen(limit: number): Promise<StoredRequest[]>;
  /** Has this tx hash already been attributed to any request? */
  hasPayment(txHash: string): Promise<boolean>;
  list(
    page: number,
    pageSize: number,
    status?: PaymentStatus,
  ): Promise<{ items: StoredRequest[]; total: number }>;
  ping(): Promise<void>;
  close(): Promise<void>;
}
