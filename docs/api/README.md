# API reference

See [`openapi.json`](openapi.json) (served at `/api/v1/openapi.json`, UI at `/docs`).

Errors: `{ error: { code, message, requestId, details? } }` with codes
`VALIDATION_ERROR`, `INVALID_REQUEST`, `REQUEST_NOT_FOUND`, `REQUEST_EXISTS`,
`ALREADY_PAID`, `REQUEST_CANCELLED`, `INTERNAL`.

## Create

```http
POST /api/v1/requests
{ "destination": "G…", "asset": "native", "amount": "12.5", "memo": {"type":"id","value":"42"}, "expires_in": 600, "description": "Order 42" }
```

Response `201` view:

```json
{ "request": { … }, "signature": "…", "signer": "G…", "status": "pending", "received": "0", "payments": [],
  "links": { "uri": "reqpay://v1/request?d=…", "hosted": "https://pay.example/r/…", "sep7": "web+stellar:pay?…" }, "updated_at": "…" }
```

## Attribute a payment

```http
POST /api/v1/requests/{id}/payments
{ "txHash": "…", "ledger": 123, "timestamp": "…", "destination": "G…", "source": "G…", "asset": "native", "amount": "5", "memo": {"type":"id","value":"42"} }
```

`200` with the updated view, or `202 { attributed: false }` when the payment
does not match or was already recorded.
