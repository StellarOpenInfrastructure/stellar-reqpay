# Merchant integration

```bash
curl -s localhost:4030/api/v1/requests -H 'content-type: application/json' -d '{
  "destination": "GAEB2QI5MVRGIBBJRSPYLQQ7WCLDFYFQ3Q2PRVMQBZQMEG3XF32OLBGA",
  "asset": "native", "amount": "12.5", "memo": {"type":"id","value":"42"},
  "description": "Order 42", "reference": "ORD-42", "expires_in": 600
}' | jq '{id: .request.id, uri: .links.uri, hosted: .links.hosted}'
```

Display `GET /api/v1/requests/{id}/qr.svg` at checkout, then poll
`GET /api/v1/requests/{id}/status` (or `status_url`) until `paid`.

Enable the watcher with `WATCH_INTERVAL_SECONDS=10` so payments are attributed
automatically, or push observed payments from your own indexer to
`POST /api/v1/requests/{id}/payments`.
