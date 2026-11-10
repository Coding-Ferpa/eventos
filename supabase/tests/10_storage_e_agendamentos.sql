-- Buckets de Storage, suas policies e os agendamentos do pg_cron (doc 04).

-- Os tokens simulados levam `user_role: "admin"`, como o hook do CF Jobs pode
-- pôr no projeto dividido (ADR-0018): o papel que vale é o de eventos.profiles.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111',
   'authenticated', 'authenticated', 'reader@teste.local', 'x', now(), now(), now(), '{}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-4333-8333-333333333333',
   'authenticated', 'authenticated', 'editor@teste.local', 'x', now(), now(), now(), '{}', '{}');
-- Sem trigger em auth.users (ADR-0018): o perfil do Eventos é criado à parte.
insert into eventos.profiles (id, display_name, role) values
  ('11111111-1111-4111-8111-111111111111', 'Pessoa Leitora', 'reader'),
  ('33333333-3333-4333-8333-333333333333', 'Pessoa Editora', 'editor');

insert into storage.objects (bucket_id, name) values
  ('templates', 'arte-existente.pdf'),
  ('fonts', 'fonte-existente.ttf');

-- ---------------------------------------------------------------------------
-- Buckets
-- ---------------------------------------------------------------------------

select is(
  (select array_agg(id || ':' || public::text order by id) from storage.buckets
    where id in ('covers', 'previews', 'templates', 'fonts')),
  array['covers:true', 'fonts:false', 'previews:true', 'templates:false'],
  'capa e prévia são públicas; arte e fonte, privadas');
select is(
  (select array_agg(id || ':' || file_size_limit order by id) from storage.buckets
    where id in ('covers', 'previews', 'templates', 'fonts')),
  array['covers:5242880', 'fonts:2097152', 'previews:1048576', 'templates:10485760'],
  'os tetos de tamanho do doc 08 valem no próprio Storage');
select is(
  (select allowed_mime_types from storage.buckets where id = 'templates'),
  array['application/pdf', 'image/png', 'image/jpeg'],
  'a arte aceita PDF, PNG e JPG');
select is(
  (select allowed_mime_types from storage.buckets where id = 'previews'),
  array['image/webp'], 'a prévia é sempre WebP');

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('covers', 'anon.png') $$,
  '42501', null, 'anon não escreve em bucket nenhum');
select is((select count(*) from storage.objects where bucket_id in ('templates', 'fonts')),
  0::bigint, 'anon não lista arte nem fonte');

reset role;
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","user_role":"admin"}';
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('covers', 'reader.png') $$,
  '42501', null, 'reader não escreve');

reset role;
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","user_role":"admin"}';
select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values ('covers', 'editor.png') $$,
  'editor sobe capa');
select is((select count(*) from storage.objects where bucket_id = 'fonts' and name = 'fonte-existente.ttf'), 1::bigint,
  'editor lê fonte: o editor de modelo mede e desenha com ela no navegador');
select is((select count(*) from storage.objects where bucket_id = 'templates'), 0::bigint,
  'editor não lê a arte pelo Storage: quem lê é o servidor, na publicação');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('outro-bucket', 'x.png') $$,
  '42501', null, 'as policies só valem para os quatro buckets do projeto');

-- ---------------------------------------------------------------------------
-- Agendamentos
-- ---------------------------------------------------------------------------

reset role;

select is(
  (select array_agg(jobname || ' ' || schedule order by jobname) from cron.job
    where jobname like 'cf-eventos:%'),
  array[
    'cf-eventos:minimizar-participantes 0 5 1 * *',
    'cf-eventos:podar-observabilidade 15 4 * * 0',
    'cf-eventos:podar-rate-limit 45 4 * * *',
    'cf-eventos:podar-staging 0 4 * * *',
    'cf-eventos:rollup-estatisticas 30 3 * * *'
  ],
  'os cinco agendamentos, nos horários do doc 04');
select ok(
  (select bool_and(active) from cron.job where jobname like 'cf-eventos:%'),
  'todos ativos');
select ok(
  (select command like '%rollup_event_stats(((now() at time zone ''America/Sao_Paulo'')::date - 1))%'
     from cron.job where jobname = 'cf-eventos:rollup-estatisticas'),
  'o rollup das 03:30 UTC consolida o dia anterior de São Paulo');

select * from finish();
rollback;
