# REQPAY/1 — Open Request-to-Pay protocol for Stellar

- Version: `REQPAY/1`
- Status: Draft (initial scaffold)
- Editors: Stellar Open Infrastructure contributors

## 1. Purpose

REQPAY defines how a **payee** (merchant, application, individual) expresses a
request for a Stellar payment so that any **wallet** can display it, validate
it, pay it and report status — with expiration, metadata, signatures and live
status that [SEP-7](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0007.md)
URIs do not provide. REQPAY is complementary to SEP-7: every REQPAY request can
be downgraded to a SEP-7 `pay` URI for wallets that do not support REQPAY.

## 2. Terminology

| Term            | Meaning                                          |
| --------------- | ------------------------------------------------ |
| Request         | A REQPAY/1 JSON document (§3)                    |
| Issuer          | The server that created and signs the request    |
| Wallet          | Software that presents and pays a request        |
| Status document | JSON describing the request's payment state (§6) |

MUST / SHOULD / MAY are used per RFC 2119.

## 3. Request document

```json
{
  "v": "REQPAY/1",
  "id": "01J8ZK5R8V2Q6X4T9W7YB3N5MD",
  "network": "Test SDF Network ; September 2015",
  "destination": "GAEB2QI5MVRGIBBJRSPYLQQ7WCLDFYFQ3Q2PRVMQBZQMEG3XF32OLBGA",
  "asset": "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  "amount": "25.5",
  "memo": { "type": "text", "value": "order-42" },
  "created_at": "2026-03-01T10:00:00Z",
  "expires_at": "2026-03-01T10:15:00Z",
  "description": "Coffee beans",
  "merchant": { "name": "Beanery", "domain": "beanery.example" },
  "reference": "ORD-42",
  "status_url": "https://pay.beanery.example/r/01J8ZK5R8V2Q6X4T9W7YB3N5MD/status",
  "return_url": "https://beanery.example/thanks",
  "metadata": { "table": "7" }
}
```

| Field         | Req. | Rules                                                                                         |
| ------------- | ---- | --------------------------------------------------------------------------------------------- |
| `v`           | MUST | literal `"REQPAY/1"`                                                                          |
| `id`          | MUST | 8–64 chars `[A-Za-z0-9_-]`; unique per issuer                                                 |
| `network`     | MUST | network passphrase                                                                            |
| `destination` | MUST | `G…` or muxed `M…` account                                                                    |
| `asset`       | MUST | `native`, `CODE:ISSUER`, or `contract:C…` (SEP-41 token)                                      |
| `amount`      | MAY  | positive decimal, ≤ 7 fractional digits; integer for `contract:` assets; absent = open amount |
| `memo`        | MAY  | `{type: text\|id\|hash, value}`; wallets MUST include it verbatim                             |
| `created_at`  | MUST | ISO-8601                                                                                      |
| `expires_at`  | MAY  | ISO-8601 after `created_at`; wallets MUST refuse to pay after it                              |
| `description` | MAY  | ≤ 280 chars, shown to the payer                                                               |
| `merchant`    | MAY  | `name`, `domain` (hosts `stellar.toml`)                                                       |
| `reference`   | MAY  | issuer-side reference, ≤ 128 chars                                                            |
| `status_url`  | MAY  | HTTPS URL returning a status document                                                         |
| `return_url`  | MAY  | HTTPS URL to open after payment                                                               |
| `metadata`    | MAY  | flat object of strings/numbers/booleans, ≤ 2048 bytes serialized                              |

Unknown fields MUST be rejected (strict schema) to keep signatures meaningful.

## 4. Canonical encoding and signatures

The canonical form is JSON with keys sorted lexicographically at every level,
no insignificant whitespace, UTF-8. The signed message is:

```
"REQPAY/1 request\n" || canonical_json(request)
```

signed with Ed25519 by the issuer's key. Signature and signer travel next to
the request:

```json
{ "request": { … }, "signature": "<base64>", "signer": "G…" }
```

Wallets SHOULD verify `signer` against `merchant.domain`'s `stellar.toml`
`URI_REQUEST_SIGNING_KEY` (the same key SEP-7 uses) and display the merchant
as verified only on success. Unsigned requests MUST be displayed as
unverified.

## 5. Transports

### 5.1 Self-contained URI (QR, NFC, deep link)

```
reqpay://v1/request?d=<base64url(canonical_json)>[&s=<base64url(signature)>&k=<signer>]
```

### 5.2 Hosted link

`https://<host>/r/<id>` — the wallet sends `GET` with
`Accept: application/reqpay+json` and receives the signed request document.
Issuers MUST set `Cache-Control: no-store`.

### 5.3 SEP-7 downgrade

`web+stellar:pay?destination=…&amount=…&asset_code=…&asset_issuer=…&memo=…&memo_type=…&msg=…&origin_domain=…&network_passphrase=…`

Expiration, status and metadata are lost; `contract:` assets cannot be
expressed. Issuers SHOULD offer the SEP-7 form only as a fallback.

## 6. Status document

`GET status_url` returns:

```json
{
  "v": "REQPAY/1",
  "id": "…",
  "status": "pending",
  "received": "0",
  "payments": [],
  "updated_at": "…"
}
```

| Status      | Meaning                                                       |
| ----------- | ------------------------------------------------------------- |
| `pending`   | no payment observed, not expired                              |
| `underpaid` | some payment observed, below `amount`                         |
| `paid`      | `received ≥ amount` (or any payment for open-amount requests) |
| `expired`   | `expires_at` passed without full payment                      |
| `cancelled` | issuer cancelled; wallets MUST NOT pay                        |

`payments[]` entries: `tx_hash`, `ledger`, `paid_at`, `amount`, `asset`, `source`.

## 7. Payment matching

A payment matches a request when destination and asset are equal, the memo
(if requested) is identical, and the ledger close time is not after
`expires_at` (issuers MAY accept late payments explicitly). A transaction hash
is attributed to at most one request.

## 8. Wallet requirements

1. Validate the document strictly; refuse unknown versions.
2. Refuse to pay after `expires_at` and when status is `cancelled` or `paid`.
3. Include `memo` verbatim; use `amount` unless open-amount.
4. For `contract:` assets, invoke SEP-41 `transfer` with the integer amount.
5. After submission, wallets SHOULD poll `status_url` and open `return_url`.

## 9. Security considerations

- Signatures bind all fields; a modified destination invalidates them.
- `return_url` MUST be HTTPS to prevent open-redirect abuse.
- Hosted links MUST not be cacheable; ids SHOULD be unguessable.
- Issuers MUST treat wallet-supplied data (webhooks) as untrusted and verify
  payments against the ledger.

## 10. Versioning

Breaking changes produce `REQPAY/2`. Additive optional fields are not allowed
within a version because the schema is strict; they require a new version.
