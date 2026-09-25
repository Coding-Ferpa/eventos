-- Rate limit em Postgres (docs 04 e 08, ADR-0006). A função é a do CF Jobs
-- com um parâmetro a mais: `increment = 0` consulta sem consumir, que é o que
-- permite o balde de IP contar só falhas (consulta antes, consome depois, só
-- se falhou).

begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- ---------------------------------------------------------------------------
-- Consumo: o critério de aceite do PRD
-- ---------------------------------------------------------------------------

select ok(
  (select bool_and((public.check_rate_limit('dev:a', 5, interval '1 minute')).allowed)
     from generate_series(1, 5)),
  'cinco tentativas no minuto passam');
select is(
  (public.check_rate_limit('dev:a', 5, interval '1 minute')).allowed,
  false, 'a sexta no mesmo minuto é barrada (R2 do PRD)');
select is(
  (public.check_rate_limit('dev:a', 5, interval '1 minute')).remaining,
  0, 'barrado, não sobra nada');

select is(
  (public.check_rate_limit('dev:b', 5, interval '1 minute')).remaining,
  4, 'a primeira consome uma e sobram quatro');
select is(
  (public.check_rate_limit('dev:c', 5, interval '1 minute')).allowed,
  true, 'chaves diferentes não dividem a cota: cada dispositivo tem a sua');
select cmp_ok(
  (public.check_rate_limit('dev:b', 5, interval '1 minute')).reset_at,
  '>', now(), 'a janela volta a abrir no futuro');

-- ---------------------------------------------------------------------------
-- Consulta: não consome
-- ---------------------------------------------------------------------------

select is(
  (public.check_rate_limit('ip:x', 20, interval '1 minute', 0)).remaining,
  20, 'consultar chave nova mostra a cota inteira');
select is(
  (select count(*) from public.rate_limits where key = 'ip:x'),
  0::bigint, 'e não cria linha');

do $$ begin perform public.check_rate_limit('ip:x', 20, interval '1 minute') from generate_series(1, 19); end $$;
select ok(
  (select bool_and((public.check_rate_limit('ip:x', 20, interval '1 minute', 0)).allowed)
     from generate_series(1, 10)),
  'com 19 falhas, consultar dez vezes continua dizendo que cabe mais uma');
select is(
  (select sum(request_count) from public.rate_limits where key = 'ip:x'),
  19::bigint, 'as consultas não consumiram nada');

do $$ begin perform public.check_rate_limit('ip:x', 20, interval '1 minute'); end $$;
select is(
  (public.check_rate_limit('ip:x', 20, interval '1 minute', 0)).allowed,
  false, 'com 20 falhas, a consulta já diz que não cabe: a 21ª tentativa nem roda');

select throws_ok(
  $$ select public.check_rate_limit('ip:x', 20, interval '1 minute', 5) $$,
  '22023', null, 'incremento só pode ser 0 ou 1');

-- ---------------------------------------------------------------------------
-- Janela deslizante e limpeza
-- ---------------------------------------------------------------------------

insert into public.rate_limits (key, window_start, request_count)
values ('dev:velho', now() - interval '2 minutes', 50);
select is(
  (public.check_rate_limit('dev:velho', 5, interval '1 minute')).allowed,
  true, 'tentativa fora da janela não conta');

insert into public.rate_limits (key, window_start, request_count) values
  ('dev:abandonada', now() - interval '3 days', 1),
  ('dev:recente', now() - interval '1 hour', 1);
select is(public.prune_rate_limits(), 2,
  'a poda remove baldes com mais de dois dias, inclusive de chave que nunca mais voltou');
select is(
  (select count(*) from public.rate_limits where key = 'dev:recente'),
  1::bigint, 'balde recente fica: a maior janela é de um dia');

-- ---------------------------------------------------------------------------
-- Acesso
-- ---------------------------------------------------------------------------

select ok((select relrowsecurity from pg_class where oid = 'public.rate_limits'::regclass),
  'rate_limits tem RLS habilitada e nenhuma policy: só a função lê o contador');
select ok(
  (select prosecdef from pg_proc where oid = 'public.check_rate_limit(text, integer, interval, integer)'::regprocedure)
  and has_function_privilege('anon', 'public.check_rate_limit(text, integer, interval, integer)', 'execute'),
  'check_rate_limit é a exceção documentada: security definer executável por anon (doc 04)');
select ok(
  not has_function_privilege('anon', 'public.prune_rate_limits()', 'execute'),
  'a poda não é endpoint');

select * from finish();
rollback;
