# Wallet integration

1. Register the `reqpay://` scheme (and keep `web+stellar:` for SEP-7).
2. On scan: `decodeUri(text)`; on hosted link: `GET` with
   `Accept: application/reqpay+json` and `signedRequestSchema.parse`.
3. If `signature` is present, fetch `https://<merchant.domain>/.well-known/stellar.toml`,
   read `URI_REQUEST_SIGNING_KEY`, confirm it equals `signer`, then
   `verifyRequest(request, signature, signer)`. Show "verified merchant" only on success.
4. Refuse if `isExpired(request)`; poll `status_url` and refuse if status is
   `paid` or `cancelled`.
5. Build the payment: `destination`, `amount` (or ask the user for open-amount),
   `memo` verbatim. For `contract:` assets call SEP-41 `transfer`.
6. After submission, poll `status_url` until `paid`, then open `return_url`.
