-- 0000 · O schema do Eventos (ADR-0018)
--
-- O Eventos divide o projeto Supabase com o CF Jobs e mora inteiro neste
-- schema: o `public` é do CF Jobs e não recebe nada daqui.
--
-- O Supabase dá ao `public` uso e privilégios padrão para `anon`,
-- `authenticated` e `service_role`, e deixa a RLS decidir. As permissões
-- abaixo repetem isso para o `eventos`, para que a matriz de RLS do pgTAP
-- continue testando a política, e não a falta de permissão. O schema fica
-- fora dos expostos pela Data API: nada daqui vira endpoint do PostgREST.

create schema eventos;

grant usage on schema eventos to anon, authenticated, service_role;

alter default privileges for role postgres in schema eventos
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema eventos
  grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema eventos
  grant all on functions to anon, authenticated, service_role;

-- O histórico das migrations do Eventos, que o `pnpm db:migrar` lê e grava.
-- O da CLI do Supabase (`supabase_migrations`) é do projeto, e o CF Jobs o usa.
create table eventos.schema_migrations (
  version text primary key check (version ~ '^\d{4}$'),
  name text not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  applied_at timestamptz not null default now()
);

alter table eventos.schema_migrations enable row level security;
revoke all on eventos.schema_migrations from anon, authenticated;
