create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now());

create table if not exists payment_requests (
  id          text primary key,
  request     jsonb not null,
  signature   text,
  signer      text,
  status      text not null check (status in ('pending','underpaid','paid','expired','cancelled')),
  cancelled   boolean not null default false,
  payments    jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists payment_requests_status_idx on payment_requests (status, created_at);
create index if not exists payment_requests_destination_idx on payment_requests ((request->>'destination'));
