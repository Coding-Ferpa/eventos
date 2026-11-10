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
