# Security overview

## Assets

- Correctness of "paid" status (merchants release goods on it).
- Issuer signing key (`REQPAY_SIGNING_SEED`).

## Controls

| Area              | Control                                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------- |
| Request integrity | Ed25519 over canonical JSON with domain separator `"REQPAY/1 request\n"`; strict schema rejects unknown fields |
| Signing key       | read from env only; never logged (pino redaction); unsigned mode when absent                                   |
| Payment truth     | watcher reads Horizon; `POST …/payments` is a trusted-caller endpoint until auth lands                         |
| Double counting   | tx hash unique across all requests                                                                             |
| Time              | expiry checked at read time and at attribution (`allowLate` explicit)                                          |
| Input             | body limit 64 KB, Zod validation, metadata ≤ 2 KB                                                              |
| Links             | hosted responses `Cache-Control: no-store`; `return_url` HTTPS only                                            |

## Known gaps

- No authentication on the API (roadmap: API keys).
- `POST …/payments` trusts the caller; deploy it behind a private network.
- Horizon is trusted for payment data.
- No rate limiting.
