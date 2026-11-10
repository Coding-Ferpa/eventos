-- Guardas que valem para o banco inteiro, e não para uma tabela (docs 04, 08
-- e 11). Rodam primeiro, pela ordem alfabética: se um destes cai, o resto da
-- matriz perde o sentido.
--
-- As duas afirmações são sobre o que ainda não existe. A próxima tabela, ou a
-- próxima função `security definer`, que alguém esquecer de proteger quebra o
-- CI aqui, sem precisar lembrar de escrever um teste para ela.

begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

-- Tabela sem RLS com a `anon key` pública é tabela aberta, se alguém religar a
-- Data API (ADR-0012).
select is(
  (select coalesce(array_agg(c.relname::text order by c.relname), '{}')
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'eventos'
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity),
  '{}'::text[],
  'toda tabela do schema eventos tem RLS habilitada');

-- O Postgres concede `execute` a `public` em toda função nova, e função
-- `security definer` executável por `anon` vira endpoint pelo PostgREST,
-- rodando com os privilégios da dona (doc 08). A exceção documentada é
-- `check_rate_limit`.
select is(
  (select coalesce(array_agg(p.oid::regprocedure::text order by 1), '{}')
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'eventos'
      and p.prosecdef
      and p.proname <> 'check_rate_limit'
      and (has_function_privilege('anon', p.oid, 'execute')
           or has_function_privilege('authenticated', p.oid, 'execute'))),
  '{}'::text[],
  'nenhuma função security definer é executável por anon ou authenticated, fora check_rate_limit');

-- Toda função `security definer` fixa o search_path: sem isso, quem a chama
-- escolhe onde a função procura as tabelas.
select is(
  (select coalesce(array_agg(p.oid::regprocedure::text order by 1), '{}')
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'eventos'
      and p.prosecdef
      and not exists (
        select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%'
      )),
  '{}'::text[],
  'toda função security definer fixa o search_path');

select * from finish();
rollback;
