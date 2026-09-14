# Schema

One table, `payment_requests`, stores the immutable request document (JSONB),
its signature, the derived status and attributed payments. Indexes support the
watcher (`status`) and per-destination lookups.

Migrations are append-only SQL applied by `scripts/migrate.ts`.
