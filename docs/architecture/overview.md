# Architecture

```mermaid
sequenceDiagram
    participant M as Merchant
    participant S as reqpay server
    participant W as Wallet
    participant H as Horizon
    M->>S: POST /api/v1/requests
    S-->>M: view {request, signature, links}
    M->>W: QR (reqpay:// URI) or hosted link
    W->>S: GET /r/:id (application/reqpay+json)
    W->>W: verify signature, check expiry
    W->>Stellar: payment with memo
    loop watcher
        S->>H: payments for destination since cursor
        H-->>S: records
        S->>S: matchesRequest → recordPayment
    end
    W->>S: GET status_url
    S-->>W: {status: paid}
```

## Layers

- **SDK** — pure functions; no I/O except QR rendering.
- **Service** (`backend/src/service.ts`) — lifecycle rules: creation
  defaults, signature, status refresh, idempotent attribution.
- **Watcher** — polls a `PaymentSource` per destination with cursors.
  Horizon implementation provided; the interface allows RPC/indexer sources.
- **Repository** — in-memory or PostgreSQL.

## Status derivation

Status is derived, never set directly (except `cancelled`):
`deriveStatus(request, payments, {cancelled, now})`. Time-based transitions
(`pending → expired`) are applied lazily on read and persisted.
