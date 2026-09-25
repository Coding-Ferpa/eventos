-- Pedidos de correção, logs de observabilidade, auditoria e as views do
-- dashboard (docs 04, 08 e 10). Nenhum log guarda o que foi buscado, e a
-- auditoria só cresce.

begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111',
   'authenticated', 'authenticated', 'reader@teste.local', 'x', now(), now(), now(), '{}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-4333-8333-333333333333',
   'authenticated', 'authenticated', 'editor@teste.local', 'x', now(), now(), now(), '{}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-8444-444444444444',
   'authenticated', 'authenticated', 'admin@teste.local', 'x', now(), now(), now(), '{}', '{}');
update public.profiles set role = 'editor' where id = '33333333-3333-4333-8333-333333333333';
update public.profiles set role = 'admin' where id = '44444444-4444-4444-8444-444444444444';

insert into public.events (id, slug, title, starts_at, status, search_by_name) values
  ('e0000000-0000-4000-8000-000000000001', 'evento-a', 'Evento A', now(), 'certificates_available', true);
insert into public.participation_types (id, event_id, slug, label, default_hours) values
  ('70000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'participante', 'Participante', 8);
insert into public.participants (id, event_id, full_name, email) values
  ('90000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'Pessoa Um', 'um@example.com'),
  ('90000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'Pessoa Dois', 'dois@example.com');
insert into public.certificates (id, event_id, participant_id, participation_type_id, issued_at, first_downloaded_at) values
  ('c0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001',
   '90000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', now(), now()),
  ('c0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001',
   '90000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000001', now(), null);

-- O dia do painel é o dia de São Paulo: o rollup roda às 03:30 UTC, que é
-- 00:30 local, logo depois do fim do dia de quem organiza o evento.
create temporary table dia on commit drop as
  select (now() at time zone 'America/Sao_Paulo')::date as hoje;

-- ---------------------------------------------------------------------------
-- Pedidos de correção
-- ---------------------------------------------------------------------------

insert into public.name_correction_requests (certificate_id, current_name, requested_name, contact)
values ('c0000000-0000-4000-8000-000000000001', 'Pessoa Um', 'Pessoa Um da Silva', 'um@example.com');

select ok((select relrowsecurity from pg_class where oid = 'public.name_correction_requests'::regclass),
  'name_correction_requests tem RLS habilitada');
select is((select status from public.name_correction_requests limit 1),
  'pending'::public.correction_status, 'pedido nasce pendente');
select throws_ok(
  $$ insert into public.name_correction_requests (certificate_id, current_name, requested_name, contact)
     values ('c0000000-0000-4000-8000-000000000001', 'Pessoa Um', 'Outro Nome', 'um@example.com') $$,
  '23505', null, 'um pedido aberto por certificado');
select throws_ok(
  $$ insert into public.name_correction_requests (certificate_id, current_name, requested_name, contact)
     values ('c0000000-0000-4000-8000-000000000002', 'Pessoa Dois', 'X', 'dois@example.com') $$,
  '23514', null, 'nome pedido curto demais é recusado');
select throws_ok(
  $$ insert into public.name_correction_requests (certificate_id, current_name, requested_name, contact)
     values ('c0000000-0000-4000-8000-000000000002', 'Pessoa Dois', 'Pessoa Dois Souza', '123') $$,
  '23514', null, 'contato curto demais é recusado');
update public.name_correction_requests set status = 'approved', reviewed_at = now()
 where certificate_id = 'c0000000-0000-4000-8000-000000000001';
select lives_ok(
  $$ insert into public.name_correction_requests (certificate_id, current_name, requested_name, contact)
     values ('c0000000-0000-4000-8000-000000000001', 'Pessoa Um da Silva', 'Pessoa Um da Silva Neto', 'um@example.com') $$,
  'resolvido o pedido anterior, outro pode ser aberto');

-- ---------------------------------------------------------------------------
-- Logs: sem PII, sem o valor buscado
-- ---------------------------------------------------------------------------

select hasnt_column('public', 'search_attempts', 'query',
  'search_attempts não tem onde guardar o que foi buscado');
select is(
  (select array_agg(column_name::text order by column_name) from information_schema.columns
    where table_schema = 'public' and table_name = 'search_attempts'),
  array['device_hash', 'event_id', 'id', 'ip_hash', 'method', 'occurred_at', 'outcome'],
  'search_attempts tem só método, desfecho e hashes diários');

insert into public.search_attempts (event_id, method, outcome, ip_hash, device_hash) values
  ('e0000000-0000-4000-8000-000000000001', 'name', 'found', 'ip-1', 'dev-1'),
  ('e0000000-0000-4000-8000-000000000001', 'name', 'not_found', 'ip-1', 'dev-1'),
  ('e0000000-0000-4000-8000-000000000001', 'cpf', 'ambiguous', 'ip-1', 'dev-2');
insert into public.certificate_downloads (certificate_id, event_id, source, certificate_version, device_hash)
values ('c0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'search', 1, 'dev-1');
insert into public.validation_checks (certificate_id, outcome, ip_hash)
values ('c0000000-0000-4000-8000-000000000001', 'valid', 'ip-9');
insert into public.event_visits (event_id, device_hash, day)
values ('e0000000-0000-4000-8000-000000000001', 'dev-1', (select hoje from dia));

select throws_ok(
  $$ insert into public.event_visits (event_id, device_hash, day)
     values ('e0000000-0000-4000-8000-000000000001', 'dev-1', (select hoje from dia)) $$,
  '23505', null, 'uma visita por dispositivo e dia: é o que dá a mediana de tempo até o download');

-- ---------------------------------------------------------------------------
-- Auditoria: só cresce
-- ---------------------------------------------------------------------------

insert into public.audit_logs (actor_id, action, entity, entity_id, diff)
values ('33333333-3333-4333-8333-333333333333', 'event.create', 'events',
        'e0000000-0000-4000-8000-000000000001', '{"title": [null, "Evento A"]}');
select throws_ok(
  $$ insert into public.audit_logs (action, entity) values ('Criou evento', 'events') $$,
  '23514', null, 'ação da auditoria segue o formato entidade.acao');

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------

select is(
  (select row(participants, certificates_active, certificates_issued, certificates_downloaded,
              pending_corrections)::text
     from public.v_event_summary where event_id = 'e0000000-0000-4000-8000-000000000001'),
  '(2,2,2,1,1)', 'v_event_summary conta participantes, emitidos, retirados e correções pendentes');
select is(
  (select download_rate from public.v_event_summary where event_id = 'e0000000-0000-4000-8000-000000000001'),
  0.5::numeric, 'taxa de retirada: retirados sobre emitidos');
select is(
  (select array_agg(certificate_id) from public.v_pending_downloads),
  array['c0000000-0000-4000-8000-000000000002'::uuid], 'v_pending_downloads lista quem ainda não baixou');
select ok(
  (select bool_and(coalesce(reloptions::text like '%security_invoker=true%', false))
     from pg_class where relname in ('v_event_summary', 'v_pending_downloads', 'v_admin_overview')),
  'as três views respeitam a RLS de quem consulta');

-- ---------------------------------------------------------------------------
-- Rollup e poda
-- ---------------------------------------------------------------------------

select is(public.rollup_event_stats((select hoje from dia)), 1, 'o rollup grava uma linha por evento com atividade');
select is(
  (select row(visits, searches, searches_not_found, first_downloads, downloads, validations, correction_requests)::text
     from public.event_stats_daily where event_id = 'e0000000-0000-4000-8000-000000000001' and day = (select hoje from dia)),
  '(1,3,2,1,1,1,2)', 'busca ambígua conta como sem resultado; o rollup soma o dia');
select is(public.rollup_event_stats((select hoje from dia)), 1, 'rodar de novo não duplica: reescreve o dia');

update public.search_attempts set occurred_at = now() - interval '100 days';
select is(public.prune_observability(), 0, 'log antigo de dia sem agregado não é podado');
insert into public.event_stats_daily (event_id, day)
  select 'e0000000-0000-4000-8000-000000000001',
         ((now() - interval '100 days') at time zone 'America/Sao_Paulo')::date;
select is(public.prune_observability(), 3, 'log antigo de dia já agregado é podado');
select ok(
  not has_function_privilege('authenticated', 'public.rollup_event_stats(date)', 'execute')
  and not has_function_privilege('authenticated', 'public.prune_observability()', 'execute'),
  'rollup e poda não são endpoint');

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is(
  (select count(*) from public.name_correction_requests) + (select count(*) from public.search_attempts)
  + (select count(*) from public.audit_logs),
  0::bigint, 'anon não vê pedido, log nem auditoria');
select ok(
  not has_table_privilege('anon', 'public.v_event_summary', 'select')
  and not has_table_privilege('anon', 'public.v_admin_overview', 'select')
  and not has_table_privilege('anon', 'public.v_pending_downloads', 'select'),
  'anon nem consulta as views do dashboard');

reset role;
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","user_role":"reader"}';
select is(
  (select count(*) from public.name_correction_requests) + (select count(*) from public.audit_logs)
  + (select count(*) from public.v_pending_downloads)
  + (select coalesce(sum(participants + certificates_active), 0) from public.v_event_summary)::bigint,
  0::bigint, 'reader não vê pedido nem auditoria, e as views chegam zeradas para ele');

reset role;
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","user_role":"editor"}';
select cmp_ok((select count(*) from public.audit_logs), '>=', 1::bigint, 'editor lê a auditoria');
select cmp_ok((select count(*) from public.v_event_summary), '>=', 1::bigint,
  'editor lê o resumo do evento');

update public.audit_logs set action = 'event.forged';
select is((select count(*) from public.audit_logs where action = 'event.forged'), 0::bigint,
  'ninguém reescreve a auditoria');
delete from public.audit_logs;
select cmp_ok((select count(*) from public.audit_logs), '>=', 1::bigint, 'ninguém apaga a auditoria');

select * from finish();
rollback;
