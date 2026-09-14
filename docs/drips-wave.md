# Drips Wave issue roadmap — stellar-reqpay

REQPAY/1 is a draft. This backlog moves the protocol toward ecosystem review
and the reference server toward production readiness.

## How to use this file

Maintainers copy an entry below into a GitHub issue using the **Drips Wave task** template, apply the `wave` label plus the complexity label, and add the `area:*` label. Contributors claim an issue by commenting on it. Every entry is independently actionable: none depends on another entry being finished first unless stated in _Technical notes_.

| Complexity | Label          | Expected points | Typical effort        |
| ---------- | -------------- | --------------- | --------------------- |
| Trivial    | `wave-trivial` | 2               | a few hours           |
| Medium     | `wave-medium`  | 5               | 1–3 days              |
| High       | `wave-high`    | 10              | up to one sprint week |

Totals: **11 trivial**, **10 medium**, **5 high**.

## Index

### Trivial

1. [Protocol test vectors](#1-protocol-test-vectors) — `area:docs`
2. [SDK helper to fetch and verify `URI_REQUEST_SIGNING_KEY` from stellar.toml](#2-sdk-helper-to-fetch-and-verify-urirequestsigningkey-from-stellartoml) — `area:sdk`
3. [Add `Location` header on request creation](#3-add-location-header-on-request-creation) — `area:backend`
4. [PNG QR endpoint](#4-png-qr-endpoint) — `area:backend`
5. [Document memo type handling for hash memos](#5-document-memo-type-handling-for-hash-memos) — `area:docs`
6. [Expose `expires_in` seconds on views](#6-expose-expiresin-seconds-on-views) — `area:backend`
7. [Unit tests for HorizonPaymentSource with mocked Horizon](#7-unit-tests-for-horizonpaymentsource-with-mocked-horizon) — `area:backend`
8. [Add `make check` and pre-push hook example](#8-add-make-check-and-pre-push-hook-example) — `area:devops`
9. [Example: Node merchant script that creates a request and waits for payment](#9-example-node-merchant-script-that-creates-a-request-and-waits-for-payment) — `area:docs`
10. [Validate `merchant.domain` is a valid hostname and lowercase it](#10-validate-merchantdomain-is-a-valid-hostname-and-lowercase-it) — `area:sdk`
11. [Seed script and sample data for local development](#11-seed-script-and-sample-data-for-local-development) — `area:devops`

### Medium

12. [Soroban token payment source via RPC events](#12-soroban-token-payment-source-via-rpc-events) — `area:backend`
13. [Webhooks on status change with HMAC signatures](#13-webhooks-on-status-change-with-hmac-signatures) — `area:backend`
14. [API-key authentication for management endpoints](#14-api-key-authentication-for-management-endpoints) — `area:security`
15. [Hosted checkout page](#15-hosted-checkout-page) — `area:frontend`
16. [Muxed account destinations and per-request muxed ids](#16-muxed-account-destinations-and-per-request-muxed-ids) — `area:sdk`
17. [Idempotency keys for request creation](#17-idempotency-keys-for-request-creation) — `area:backend`
18. [Rate limiting and abuse controls on hosted endpoints](#18-rate-limiting-and-abuse-controls-on-hosted-endpoints) — `area:security`
19. [Prometheus metrics](#19-prometheus-metrics) — `area:devops`
20. [Partial payments policy and overpayment handling](#20-partial-payments-policy-and-overpayment-handling) — `area:sdk`
21. [Multi-language SDK: Rust crate for REQPAY encoding and verification](#21-multi-language-sdk-rust-crate-for-reqpay-encoding-and-verification) — `area:sdk`

### High

22. [Reference wallet implementation (web) supporting reqpay:// and SEP-7](#22-reference-wallet-implementation-web-supporting-reqpay-and-sep-7) — `area:frontend`
23. [Submit REQPAY/1 as a Stellar Ecosystem Proposal](#23-submit-reqpay1-as-a-stellar-ecosystem-proposal) — `area:docs`
24. [Multi-tenant issuer accounts with per-merchant signing keys](#24-multi-tenant-issuer-accounts-with-per-merchant-signing-keys) — `area:security`
25. [Recurring requests (subscriptions) and request templates](#25-recurring-requests-subscriptions-and-request-templates) — `area:backend`
26. [Payment channel / Soroban settlement adapter](#26-payment-channel--soroban-settlement-adapter) — `area:backend`

## Trivial issues

### 1. Protocol test vectors

- **Complexity:** Trivial (`wave-trivial`)
- **Expected points:** 2
- **Area:** `area:docs`

**Problem**

Implementers in other languages have no canonical inputs/outputs to check against.

**Scope**

Add `docs/protocol/test-vectors.json` with at least 10 requests, their canonical JSON, signatures from a documented test key, and encoded URIs; add a test that regenerates and compares them.

**Acceptance criteria**

- [ ] Vectors cover open-amount, contract asset, memo types, metadata
- [ ] SDK test asserts vectors match
- [ ] Spec links the file

**Technical notes**

Use a fixed test seed documented as test-only.

**Files likely affected**

- `docs/protocol/test-vectors.json`
- `packages/sdk/src/vectors.test.ts`
- `docs/protocol/REQPAY-1.md`

**Tests required**

Vector test.

**Documentation required**

Spec §4 references.

**Definition of done**

- [ ] All acceptance criteria met
- [ ] Tests added and passing in CI (`make test`, `make lint`, `make build`)
- [ ] Documentation updated as listed above
- [ ] No secrets or credentials introduced
- [ ] PR reviewed and squash-merged

### 2. SDK helper to fetch and verify `URI_REQUEST_SIGNING_KEY` from stellar.toml

- **Complexity:** Trivial (`wave-trivial`)
- **Expected points:** 2
- **Area:** `area:sdk`

**Problem**

Wallets must hand-roll toml fetching to verify merchants.

**Scope**

Add `fetchSigningKey(domain, fetch?)` parsing `stellar.toml` and `verifySignedRequest(signed, {fetch})` combining fetch + verify.

**Acceptance criteria**

- [ ] Works with an injected fetch in tests
- [ ] Rejects non-HTTPS and mismatched signer
- [ ] Timeout and size cap

**Technical notes**

Parse TOML minimally (single key) to avoid a dependency, or use `@iarna/toml`.

**Files likely affected**

- `packages/sdk/src/toml.ts`
- `packages/sdk/src/toml.test.ts`
- `docs/guides/wallet-integration.md`

**Tests required**

Unit tests with fetch mocks.

**Documentation required**

Wallet guide.

**Definition of done**

- [ ] All acceptance criteria met
- [ ] Tests added and passing in CI (`make test`, `make lint`, `make build`)
- [ ] Documentation updated as listed above
- [ ] No secrets or credentials introduced
- [ ] PR reviewed and squash-merged

### 3. Add `Location` header on request creation

- **Complexity:** Trivial (`wave-trivial`)
- **Expected points:** 2
- **Area:** `area:backend`

**Problem**

`POST /requests` returns 201 without `Location`.

**Scope**

Set `Location: /api/v1/requests/:id`.

**Acceptance criteria**

- [ ] Header present and tested

**Technical notes**

One line in the route.

**Files likely affected**

- `backend/src/routes/requests.ts`
- `backend/src/app.test.ts`

**Tests required**

API test.

**Documentation required**

None.

**Definition of done**

- [ ] All acceptance criteria met
- [ ] Tests added and passing in CI (`make test`, `make lint`, `make build`)
- [ ] Documentation updated as listed above
- [ ] No secrets or credentials introduced
- [ ] PR reviewed and squash-merged

### 4. PNG QR endpoint

- **Complexity:** Trivial (`wave-trivial`)
- **Expected points:** 2
- **Area:** `area:backend`

**Problem**

Some POS integrations need PNG rather than SVG.

**Scope**

Add `GET /api/v1/requests/:id/qr.png` using `toQrDataUrl` decoded to bytes; support `?size=`.

**Acceptance criteria**

- [ ] PNG bytes returned with `image/png`
- [ ] Size validated 128–1024

**Technical notes**

Decode the data URL base64 to a Buffer.

**Files likely affected**

- `backend/src/routes/requests.ts`
- `backend/src/app.test.ts`
- `docs/api/README.md`

**Tests required**

API test.

**Documentation required**

API reference.

**Definition of done**

- [ ] All acceptance criteria met
- [ ] Tests added and passing in CI (`make test`, `make lint`, `make build`)
- [ ] Documentation updated as listed above
- [ ] No secrets or credentials introduced
- [ ] PR reviewed and squash-merged

### 5. Document memo type handling for hash memos

- **Complexity:** Trivial (`wave-trivial`)
- **Expected points:** 2
- **Area:** `area:docs`

**Problem**

Wallets are unsure how to encode `hash` memos (hex vs base64) across REQPAY, SEP-7 and Horizon.

**Scope**

Add a section to the spec and wallet guide with explicit examples and the mapping used by the watcher.

**Acceptance criteria**

- [ ] Spec §3 clarifies hex encoding for hash memos
- [ ] Watcher normalises Horizon base64 hash memos to hex with a test

**Technical notes**

Horizon returns hash memos base64-encoded.

**Files likely affected**

- `docs/protocol/REQPAY-1.md`
- `backend/src/watcher.ts`
- `backend/src/app.test.ts`

**Tests required**

Watcher unit test.

**Documentation required**

Spec and wallet guide.

**Definition of done**

- [ ] All acceptance criteria met
- [ ] Tests added and passing in CI (`make test`, `make lint`, `make build`)
- [ ] Documentation updated as listed above
- [ ] No secrets or credentials introduced
- [ ] PR reviewed and squash-merged

### 6. Expose `expires_in` seconds on views

- **Complexity:** Trivial (`wave-trivial`)
- **Expected points:** 2
- **Area:** `area:backend`

**Problem**

Clients recompute remaining time from `expires_at`; a `seconds_remaining` field simplifies countdown UIs.

**Scope**

Add `secondsUntilExpiry` output to the view and status endpoints.

**Acceptance criteria**

- [ ] Field present and documented
- [ ] Test with a fixed clock

**Technical notes**

SDK already has `secondsUntilExpiry`.

**Files likely affected**

- `backend/src/service.ts`
- `backend/src/routes/requests.ts`
- `docs/api/README.md`

**Tests required**

API test.

**Documentation required**

API reference.

**Definition of done**

- [ ] All acceptance criteria met
- [ ] Tests added and passing in CI (`make test`, `make lint`, `make build`)
- [ ] Documentation updated as listed above
- [ ] No secrets or credentials introduced
- [ ] PR reviewed and squash-merged

### 7. Unit tests for HorizonPaymentSource with mocked Horizon

- **Complexity:** Trivial (`wave-trivial`)
- **Expected points:** 2
- **Area:** `area:backend`

**Problem**

The Horizon adapter has no tests.

**Scope**

Mock `Horizon.Server` and assert mapping of payment records, memo types, asset keys and cursor progression.

**Acceptance criteria**

- [ ] Covers native and issued assets, text/id/hash memos, non-payment ops skipped

**Technical notes**

Use `vi.mock('@stellar/stellar-sdk')` partial mocks.

**Files likely affected**

- `backend/src/watcher.test.ts`

**Tests required**

The tests.

**Documentation required**

None.

**Definition of done**

- [ ] All acceptance criteria met
- [ ] Tests added and passing in CI (`make test`, `make lint`, `make build`)
- [ ] Documentation updated as listed above
- [ ] No secrets or credentials introduced
- [ ] PR reviewed and squash-merged

### 8. Add `make check` and pre-push hook example

- **Complexity:** Trivial (`wave-trivial`)
- **Expected points:** 2
- **Area:** `area:devops`

**Problem**

Contributors forget to run all checks.

**Scope**

Add `check` target running lint, typecheck, test, build; document an opt-in pre-push hook.

**Acceptance criteria**

- [ ] `make check` works
- [ ] CONTRIBUTING.md updated

**Technical notes**

Do not auto-install hooks.

**Files likely affected**

- `Makefile`
- `scripts/git-hooks/pre-push`
- `CONTRIBUTING.md`

**Tests required**

None.

**Documentation required**

CONTRIBUTING.md.

**Definition of done**

- [ ] All acceptance criteria met
- [ ] Tests added and passing in CI (`make test`, `make lint`, `make build`)
- [ ] Documentation updated as listed above
- [ ] No secrets or credentials introduced
- [ ] PR reviewed and squash-merged

### 9. Example: Node merchant script that creates a request and waits for payment

- **Complexity:** Trivial (`wave-trivial`)
- **Expected points:** 2
- **Area:** `area:docs`

**Problem**

There is no end-to-end example for merchants.

**Scope**

Write `examples/merchant-wait.ts` that creates a request via the API, prints the QR to the terminal (`qrcode` terminal output), and polls status until paid or expired.

**Acceptance criteria**

- [ ] Runs against a local server
- [ ] Exit code reflects outcome

**Technical notes**

Use `QRCode.toString(uri, { type: 'terminal' })`.

**Files likely affected**

- `examples/merchant-wait.ts`
- `docs/guides/merchant-integration.md`

**Tests required**

None.

**Documentation required**

Merchant guide.

**Definition of done**

- [ ] All acceptance criteria met
- [ ] Tests added and passing in CI (`make test`, `make lint`, `make build`)
- [ ] Documentation updated as listed above
- [ ] No secrets or credentials introduced
- [ ] PR reviewed and squash-merged

### 10. Validate `merchant.domain` is a valid hostname and lowercase it

- **Complexity:** Trivial (`wave-trivial`)
- **Expected points:** 2
- **Area:** `area:sdk`

**Problem**

Mixed-case or malformed domains break toml lookups and signature comparisons.

**Scope**

Normalise to lowercase and validate with a hostname regex (RFC 1123).

**Acceptance criteria**

- [ ] Uppercase input canonicalises to lowercase before signing
- [ ] Invalid hostnames rejected

**Technical notes**

Do the normalisation in a Zod `transform`.

**Files likely affected**

- `packages/sdk/src/schema.ts`
- `packages/sdk/src/sdk.test.ts`

**Tests required**

Unit tests.

**Documentation required**

Spec §3.

**Definition of done**

- [ ] All acceptance criteria met
- [ ] Tests added and passing in CI (`make test`, `make lint`, `make build`)
- [ ] Documentation updated as listed above
- [ ] No secrets or credentials introduced
- [ ] PR reviewed and squash-merged

### 11. Seed script and sample data for local development

- **Complexity:** Trivial (`wave-trivial`)
- **Expected points:** 2
- **Area:** `area:devops`

**Problem**

`database/seeds` is empty.

**Scope**

Add a seed SQL with three requests in different statuses and a `make seed` target.

**Acceptance criteria**

- [ ] `make seed` idempotent
- [ ] README mentions it

**Technical notes**

Mirror stellar-reconcile's approach.

**Files likely affected**

- `database/seeds/0001_sample.sql`
- `scripts/seed.ts`
- `Makefile`

**Tests required**

None.

**Documentation required**

README.

**Definition of done**

- [ ] All acceptance criteria met
- [ ] Tests added and passing in CI (`make test`, `make lint`, `make build`)
- [ ] Documentation updated as listed above
- [ ] No secrets or credentials introduced
- [ ] PR reviewed and squash-merged

## Medium issues

### 12. Soroban token payment source via RPC events

- **Complexity:** Medium (`wave-medium`)
- **Expected points:** 5
- **Area:** `area:backend`

**Problem**

Requests for `contract:` assets are never marked paid automatically.

**Scope**

Implement `RpcEventsPaymentSource` using Stellar RPC `getEvents` filtered on SEP-41 `transfer` topics with the destination, mapping to `ObservedPayment` (integer amounts). Select the source per request asset.

**Acceptance criteria**

- [ ] Handles RPC retention window and paging
- [ ] Unit tests with fixture events
- [ ] Watcher picks the right source per asset

**Technical notes**

Memo is not available for contract transfers; match on destination + asset + amount + time, and document the limitation.

**Files likely affected**

- `backend/src/watcher.ts`
- `backend/src/rpc-source.ts`
- `docs/protocol/REQPAY-1.md`

**Tests required**

Unit tests.

**Documentation required**

Spec §7 note on contract assets.

**Definition of done**

- [ ] All acceptance criteria met
- [ ] Tests added and passing in CI (`make test`, `make lint`, `make build`)
- [ ] Documentation updated as listed above
- [ ] No secrets or credentials introduced
- [ ] PR reviewed and squash-merged

### 13. Webhooks on status change with HMAC signatures

- **Complexity:** Medium (`wave-medium`)
- **Expected points:** 5
- **Area:** `area:backend`

**Problem**

Merchants must poll for status.

**Scope**

Add `webhook_url` (HTTPS) at creation; on status transition POST the status document with `X-Reqpay-Signature: sha256=…` (HMAC over body with a per-deployment secret), retries with backoff, delivery log table.

**Acceptance criteria**

- [ ] Signature documented and verifiable with an SDK helper
- [ ] Retries bounded; failures visible via API
- [ ] Migration added

**Technical notes**

Store deliveries in `webhook_deliveries`.

**Files likely affected**

- `backend/src/webhooks.ts`
- `backend/src/service.ts`
- `database/migrations/0002_webhooks.sql`
- `packages/sdk/src/webhooks.ts`
- `docs/guides/webhooks.md`

**Tests required**

Unit tests for signature and retry; API test for delivery log.

**Documentation required**

New guide.

**Definition of done**

- [ ] All acceptance criteria met
- [ ] Tests added and passing in CI (`make test`, `make lint`, `make build`)
- [ ] Documentation updated as listed above
- [ ] No secrets or credentials introduced
- [ ] PR reviewed and squash-merged

### 14. API-key authentication for management endpoints

- **Complexity:** Medium (`wave-medium`)
- **Expected points:** 5
- **Area:** `area:security`

**Problem**

Anyone reaching the server can create, cancel or attribute payments.

**Scope**

Bearer API keys (hashed in env) required for `/api/v1/*`; hosted `/r/*` stays public. Constant-time comparison; keys never logged.

**Acceptance criteria**

- [ ] 401/403 envelopes
- [ ] Docs updated
- [ ] Health endpoints public

**Technical notes**

Follow the pattern proposed in stellar-txguard.

**Files likely affected**

- `backend/src/auth.ts`
- `backend/src/app.ts`
- `backend/src/config.ts`
- `docs/security/overview.md`

**Tests required**

API tests.

**Documentation required**

Security overview.

**Definition of done**

- [ ] All acceptance criteria met
- [ ] Tests added and passing in CI (`make test`, `make lint`, `make build`)
- [ ] Documentation updated as listed above
- [ ] No secrets or credentials introduced
- [ ] PR reviewed and squash-merged

### 15. Hosted checkout page

- **Complexity:** Medium (`wave-medium`)
- **Expected points:** 5
- **Area:** `area:frontend`

**Problem**

Wallets without REQPAY support and desktop users need a human-readable page for `/r/:id`.

**Scope**

Serve an HTML page at `/r/:id` when `Accept` prefers `text/html`: shows merchant, amount, description, countdown, QR, SEP-7 button, and live status via polling. Minimal, accessible, no framework (server-rendered template).

**Acceptance criteria**

- [ ] Content negotiation tested
- [ ] Page works without JavaScript (status via refresh)
- [ ] No inline secrets

**Technical notes**

Keep it dependency-light; a Next.js app is a separate high issue.

**Files likely affected**

- `backend/src/routes/checkout.ts`
- `backend/src/templates/checkout.html`
- `backend/src/app.test.ts`

**Tests required**

API tests for negotiation and rendering.

**Documentation required**

Merchant guide.

**Definition of done**

- [ ] All acceptance criteria met
- [ ] Tests added and passing in CI (`make test`, `make lint`, `make build`)
- [ ] Documentation updated as listed above
- [ ] No secrets or credentials introduced
- [ ] PR reviewed and squash-merged

### 16. Muxed account destinations and per-request muxed ids

- **Complexity:** Medium (`wave-medium`)
- **Expected points:** 5
- **Area:** `area:sdk`

**Problem**

Merchants using one account for many customers rely on memos; muxed accounts (`M…`) are the modern alternative.

**Scope**

Support generating a muxed destination per request (`destination: M…`) and matching payments delivered to the muxed address.

**Acceptance criteria**

- [ ] SDK helper to derive `M…` from `G…` + id
- [ ] Watcher matches on muxed destination via Horizon `to_muxed`
- [ ] Spec updated

**Technical notes**

Use `MuxedAccount` from the SDK.

**Files likely affected**

- `packages/sdk/src/muxed.ts`
- `backend/src/watcher.ts`
- `docs/protocol/REQPAY-1.md`

**Tests required**

Unit tests.

**Documentation required**

Spec §3 and wallet guide.

**Definition of done**

- [ ] All acceptance criteria met
- [ ] Tests added and passing in CI (`make test`, `make lint`, `make build`)
- [ ] Documentation updated as listed above
- [ ] No secrets or credentials introduced
- [ ] PR reviewed and squash-merged

### 17. Idempotency keys for request creation

- **Complexity:** Medium (`wave-medium`)
- **Expected points:** 5
- **Area:** `area:backend`

**Problem**

Retried POSTs create duplicate requests.

**Scope**

Support `Idempotency-Key` header: same key + same body returns the original; different body returns 422.

**Acceptance criteria**

- [ ] Stored for 24h
- [ ] Tested for replay and conflict

**Technical notes**

Add an `idempotency_keys` table or reuse the request id when the client provides it.

**Files likely affected**

- `backend/src/routes/requests.ts`
- `backend/src/repository/**`
- `database/migrations/0003_idempotency.sql`

**Tests required**

API tests.

**Documentation required**

API reference.

**Definition of done**

- [ ] All acceptance criteria met
- [ ] Tests added and passing in CI (`make test`, `make lint`, `make build`)
- [ ] Documentation updated as listed above
- [ ] No secrets or credentials introduced
- [ ] PR reviewed and squash-merged

### 18. Rate limiting and abuse controls on hosted endpoints

- **Complexity:** Medium (`wave-medium`)
- **Expected points:** 5
- **Area:** `area:security`

**Problem**

Public `/r/:id` endpoints can be scraped or hammered.

**Scope**

Add `@fastify/rate-limit` per IP for `/r/*` and `/api/v1/*/qr.*`, configurable, with 429 envelopes.

**Acceptance criteria**

- [ ] Limits configurable
- [ ] Health exempt
- [ ] Documented

**Technical notes**

In-memory store by default.

**Files likely affected**

- `backend/src/app.ts`
- `backend/src/config.ts`
- `docs/security/overview.md`

**Tests required**

API test exceeding the limit.

**Documentation required**

Security overview.

**Definition of done**

- [ ] All acceptance criteria met
- [ ] Tests added and passing in CI (`make test`, `make lint`, `make build`)
- [ ] Documentation updated as listed above
- [ ] No secrets or credentials introduced
- [ ] PR reviewed and squash-merged

### 19. Prometheus metrics

- **Complexity:** Medium (`wave-medium`)
- **Expected points:** 5
- **Area:** `area:devops`

**Problem**

No operational visibility into request volumes or watcher lag.

**Scope**

Add `/metrics` with counters (requests by status transition), watcher lag gauge (seconds since last successful poll per destination), and HTTP latency histograms.

**Acceptance criteria**

- [ ] No high-cardinality labels
- [ ] Optional via env

**Technical notes**

Use `prom-client`.

**Files likely affected**

- `backend/src/metrics.ts`
- `backend/src/watcher.ts`
- `backend/src/app.ts`

**Tests required**

Integration test scraping the endpoint.

**Documentation required**

README Deployment.

**Definition of done**

- [ ] All acceptance criteria met
- [ ] Tests added and passing in CI (`make test`, `make lint`, `make build`)
- [ ] Documentation updated as listed above
- [ ] No secrets or credentials introduced
- [ ] PR reviewed and squash-merged

### 20. Partial payments policy and overpayment handling

- **Complexity:** Medium (`wave-medium`)
- **Expected points:** 5
- **Area:** `area:sdk`

**Problem**

Overpayments are reported as `paid` with `received > amount`; some merchants need `overpaid` or refunds.

**Scope**

Add `overpaid` status and a per-request `partial_payments: allow|reject` policy affecting matching; document refund guidance.

**Acceptance criteria**

- [ ] Status enum extended (spec bump to include in REQPAY/1 draft)
- [ ] Tests for exact, under, over

**Technical notes**

Coordinate with the spec: this is a draft-phase change.

**Files likely affected**

- `packages/sdk/src/schema.ts`
- `packages/sdk/src/lifecycle.ts`
- `docs/protocol/REQPAY-1.md`

**Tests required**

Unit tests.

**Documentation required**

Spec §6.

**Definition of done**

- [ ] All acceptance criteria met
- [ ] Tests added and passing in CI (`make test`, `make lint`, `make build`)
- [ ] Documentation updated as listed above
- [ ] No secrets or credentials introduced
- [ ] PR reviewed and squash-merged

### 21. Multi-language SDK: Rust crate for REQPAY encoding and verification

- **Complexity:** Medium (`wave-medium`)
- **Expected points:** 5
- **Area:** `area:sdk`

**Problem**

Wallets written in Rust cannot reuse the TypeScript SDK.

**Scope**

Create `rust/reqpay` with schema structs (serde), canonical JSON, Ed25519 verify (ed25519-dalek), URI decode; validate against the test vectors.

**Acceptance criteria**

- [ ] Vectors pass in Rust
- [ ] Crate builds in CI

**Technical notes**

Verification only in the first iteration.

**Files likely affected**

- `rust/reqpay/**`
- `.github/workflows/ci.yml`
- `docs/protocol/test-vectors.json`

**Tests required**

Rust tests against vectors.

**Documentation required**

README.

**Definition of done**

- [ ] All acceptance criteria met
- [ ] Tests added and passing in CI (`make test`, `make lint`, `make build`)
- [ ] Documentation updated as listed above
- [ ] No secrets or credentials introduced
- [ ] PR reviewed and squash-merged

## High issues

### 22. Reference wallet implementation (web) supporting reqpay:// and SEP-7

- **Complexity:** High (`wave-high`)
- **Expected points:** 10
- **Area:** `area:frontend`

**Problem**

No wallet speaks REQPAY yet; the protocol needs a working reference.

**Scope**

Build `frontend/` (Next.js) that scans/pastes a REQPAY URI or hosted link, verifies the merchant, shows request details and countdown, pays via Freighter, and tracks status. Minimal, accessible design with real empty/loading states.

**Acceptance criteria**

- [ ] Full flow on testnet
- [ ] Signature verification with toml
- [ ] CI lint/typecheck/build

**Technical notes**

Depends on the toml helper (trivial issue).

**Files likely affected**

- `frontend/**`
- `pnpm-workspace.yaml`
- `.github/workflows/ci.yml`

**Tests required**

Component tests and a Playwright smoke test.

**Documentation required**

docs/guides/reference-wallet.md.

**Definition of done**

- [ ] All acceptance criteria met
- [ ] Tests added and passing in CI (`make test`, `make lint`, `make build`)
- [ ] Documentation updated as listed above
- [ ] No secrets or credentials introduced
- [ ] PR reviewed and squash-merged

### 23. Submit REQPAY/1 as a Stellar Ecosystem Proposal

- **Complexity:** High (`wave-high`)
- **Expected points:** 10
- **Area:** `area:docs`

**Problem**

Adoption requires ecosystem review.

**Scope**

Prepare a SEP-format draft (abstract, motivation, spec, security, backwards compatibility with SEP-7, test vectors), open the discussion, and track feedback into spec revisions.

**Acceptance criteria**

- [ ] SEP draft PR opened against stellar-protocol
- [ ] Feedback tracked as issues here
- [ ] Spec revision log maintained

**Technical notes**

Coordinate wording with SEP-7 maintainers.

**Files likely affected**

- `docs/protocol/SEP-draft.md`
- `docs/protocol/REQPAY-1.md`
- `docs/protocol/CHANGELOG.md`

**Tests required**

None.

**Documentation required**

The draft.

**Definition of done**

- [ ] All acceptance criteria met
- [ ] Tests added and passing in CI (`make test`, `make lint`, `make build`)
- [ ] Documentation updated as listed above
- [ ] No secrets or credentials introduced
- [ ] PR reviewed and squash-merged

### 24. Multi-tenant issuer accounts with per-merchant signing keys

- **Complexity:** High (`wave-high`)
- **Expected points:** 10
- **Area:** `area:security`

**Problem**

A hosted provider serving many merchants cannot share one signing key.

**Scope**

Introduce merchants as first-class records with their own signing keys stored encrypted (KMS interface with a local AES-GCM implementation), API keys per merchant, and per-merchant `stellar.toml` guidance.

**Acceptance criteria**

- [ ] Keys encrypted at rest; never logged
- [ ] Merchant-scoped queries everywhere
- [ ] Migration path documented

**Technical notes**

Depends on API-key auth.

**Files likely affected**

- `database/migrations/0004_merchants.sql`
- `backend/src/merchants.ts`
- `backend/src/kms.ts`
- `backend/src/routes/**`

**Tests required**

Authorization matrix tests; encryption round-trip tests.

**Documentation required**

Security overview and deployment guide.

**Definition of done**

- [ ] All acceptance criteria met
- [ ] Tests added and passing in CI (`make test`, `make lint`, `make build`)
- [ ] Documentation updated as listed above
- [ ] No secrets or credentials introduced
- [ ] PR reviewed and squash-merged

### 25. Recurring requests (subscriptions) and request templates

- **Complexity:** High (`wave-high`)
- **Expected points:** 10
- **Area:** `area:backend`

**Problem**

Subscriptions require issuing a new request each period.

**Scope**

Add templates and schedules that issue requests automatically (cron-like), notify via webhooks, and link generated requests to the schedule.

**Acceptance criteria**

- [ ] Schedules CRUD
- [ ] Generated requests reference their schedule
- [ ] Timezone-safe scheduling tested

**Technical notes**

Use Postgres advisory locks to avoid duplicate issuance across instances.

**Files likely affected**

- `backend/src/schedules.ts`
- `backend/src/routes/schedules.ts`
- `database/migrations/0005_schedules.sql`

**Tests required**

Unit tests for schedule evaluation; integration test for single issuance.

**Documentation required**

docs/guides/subscriptions.md.

**Definition of done**

- [ ] All acceptance criteria met
- [ ] Tests added and passing in CI (`make test`, `make lint`, `make build`)
- [ ] Documentation updated as listed above
- [ ] No secrets or credentials introduced
- [ ] PR reviewed and squash-merged

### 26. Payment channel / Soroban settlement adapter

- **Complexity:** High (`wave-high`)
- **Expected points:** 10
- **Area:** `area:backend`

**Problem**

High-frequency merchants want requests settled through a Soroban contract that batches transfers.

**Scope**

Design and implement an optional settlement adapter: requests can specify `settlement: {contract: C…}`; payments to the contract with the request id as an argument are matched via events; provide a minimal Soroban receiver contract in `contracts/`.

**Acceptance criteria**

- [ ] Receiver contract with tests
- [ ] Adapter matches events by request id
- [ ] Threat model for the contract

**Technical notes**

Introduces a `contracts/` directory with the standard Rust workspace and CI job.

**Files likely affected**

- `contracts/receiver/**`
- `backend/src/settlement.ts`
- `docs/security/threat-model.md`
- `.github/workflows/ci.yml`

**Tests required**

Contract tests and adapter unit tests.

**Documentation required**

Architecture and threat model.

**Definition of done**

- [ ] All acceptance criteria met
- [ ] Tests added and passing in CI (`make test`, `make lint`, `make build`)
- [ ] Documentation updated as listed above
- [ ] No secrets or credentials introduced
- [ ] PR reviewed and squash-merged
