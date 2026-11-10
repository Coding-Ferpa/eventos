-- Staging da importação (docs 04 e 06). O arquivo CSV nunca é gravado; o
-- staging guarda linhas já normalizadas, com o CPF já em HMAC, e expira.

-- Os tokens simulados levam `user_role: "admin"`, como o hook do CF Jobs pode
-- pôr no projeto dividido (ADR-0018): o papel que vale é o de eventos.profiles.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

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

insert into eventos.events (id, slug, title, starts_at) values
  ('e0000000-0000-4000-8000-000000000001', 'evento-a', 'Evento A', now()),
  ('e0000000-0000-4000-8000-000000000002', 'evento-b', 'Evento B', now());
insert into eventos.participation_types (id, event_id, slug, label, default_hours) values
  ('70000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'participante', 'Participante', 8),
  ('70000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000002', 'participante', 'Participante', 8);

-- Três lotes: um recente, um esquecido há dois dias, um aplicado há dez.
insert into eventos.import_batches (id, event_id, participation_type_id, status, created_at, applied_at) values
  ('b0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001',
   '70000000-0000-4000-8000-000000000001', 'staged', now(), null),
  ('b0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001',
   null, 'staged', now() - interval '2 days', null),
  ('b0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000001',
   null, 'applied', now() - interval '11 days', now() - interval '10 days');

insert into eventos.import_rows (batch_id, row_number, full_name) values
  ('b0000000-0000-4000-8000-000000000001', 2, 'José Gonçalves de Assunção'),
  ('b0000000-0000-4000-8000-000000000002', 2, 'Linha Esquecida'),
  ('b0000000-0000-4000-8000-000000000003', 2, 'Linha Já Aplicada');

-- ---------------------------------------------------------------------------
-- Estrutura e integridade
-- ---------------------------------------------------------------------------

select ok((select relrowsecurity from pg_class where oid = 'eventos.import_batches'::regclass),
  'import_batches tem RLS habilitada');
select ok((select relrowsecurity from pg_class where oid = 'eventos.import_rows'::regclass),
  'import_rows tem RLS habilitada');

select is(
  (select full_name_normalized from eventos.import_rows
    where batch_id = 'b0000000-0000-4000-8000-000000000001' and row_number = 2),
  'jose goncalves assuncao',
  'o staging normaliza o nome pela mesma função de participants: o diff compara igual com igual');
select is(
  (select row(status, row_count)::text from eventos.import_batches
    where id = 'b0000000-0000-4000-8000-000000000001'),
  '(staged,0)', 'lote nasce em staging, sem linhas contadas');

select throws_ok(
  $$ insert into eventos.import_rows (batch_id, row_number, full_name, cpf_hash, cpf_last3)
     values ('b0000000-0000-4000-8000-000000000001', 3, 'Pessoa', '12345678901', '901') $$,
  '23514', null, 'CPF em claro não entra nem no staging');
select throws_ok(
  $$ insert into eventos.import_rows (batch_id, row_number, full_name)
     values ('b0000000-0000-4000-8000-000000000001', 1, 'Cabeçalho') $$,
  '23514', null, 'a linha 1 é o cabeçalho e nunca vira dado');
select throws_ok(
  $$ insert into eventos.import_rows (batch_id, row_number, full_name, match_rule)
     values ('b0000000-0000-4000-8000-000000000001', 3, 'Pessoa', 'soundex') $$,
  '23514', null, 'regra de conciliação fora da cascata do doc 06 é recusada');
select throws_ok(
  $$ insert into eventos.import_rows (batch_id, row_number, full_name, resolution)
     values ('b0000000-0000-4000-8000-000000000001', 3, 'Pessoa', 'talvez') $$,
  '23514', null, 'decisão de possível duplicata fora das três opções é recusada');
select throws_ok(
  $$ insert into eventos.import_batches (event_id, participation_type_id)
     values ('e0000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000002') $$,
  '23503', null, 'lote de um evento não usa tipo de outro evento');

-- Participante e certificado lembram de qual lote vieram (remoção por lote, ADR-0007).
insert into eventos.participants (id, event_id, full_name, created_by_batch_id)
values ('90000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001',
        'Pessoa do Lote', 'b0000000-0000-4000-8000-000000000003');
select throws_ok(
  $$ insert into eventos.participants (event_id, full_name, created_by_batch_id)
     values ('e0000000-0000-4000-8000-000000000001', 'Pessoa Órfã',
             'b0000000-0000-4000-8000-00000000dead') $$,
  '23503', null, 'participante só aponta para lote que existe');

-- ---------------------------------------------------------------------------
-- Poda do staging: dado pessoal não fica parado (doc 08)
-- ---------------------------------------------------------------------------

select is(eventos.prune_import_staging(), 2, 'a poda remove as linhas do lote esquecido e do aplicado há mais de 7 dias');
select is(
  (select status from eventos.import_batches where id = 'b0000000-0000-4000-8000-000000000002'),
  'expired'::eventos.import_status, 'lote esquecido por mais de 24 h expira');
select is(
  (select status from eventos.import_batches where id = 'b0000000-0000-4000-8000-000000000003'),
  'applied'::eventos.import_status, 'lote aplicado continua aplicado: só as linhas saem');
select is(
  (select count(*) from eventos.import_rows where batch_id = 'b0000000-0000-4000-8000-000000000001'),
  1::bigint, 'lote recente não é tocado');
select is(
  (select created_by_batch_id from eventos.participants where id = '90000000-0000-4000-8000-000000000001'),
  'b0000000-0000-4000-8000-000000000003'::uuid,
  'o participante continua sabendo de qual lote veio depois da poda');
select ok(
  not has_function_privilege('anon', 'eventos.prune_import_staging()', 'execute')
  and not has_function_privilege('authenticated', 'eventos.prune_import_staging()', 'execute'),
  'rotina de manutenção não é endpoint');

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is((select count(*) from eventos.import_batches) + (select count(*) from eventos.import_rows),
  0::bigint, 'anon não vê staging');

reset role;
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","user_role":"admin"}';
select is((select count(*) from eventos.import_batches) + (select count(*) from eventos.import_rows),
  0::bigint, 'reader não vê staging');

reset role;
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","user_role":"admin"}';
select lives_ok(
  $$ insert into eventos.import_rows (batch_id, row_number, full_name)
     values ('b0000000-0000-4000-8000-000000000001', 3, 'Nova Linha') $$,
  'editor grava no staging');
delete from eventos.import_rows where batch_id = 'b0000000-0000-4000-8000-000000000001';
select is((select count(*) from eventos.import_rows where batch_id = 'b0000000-0000-4000-8000-000000000001'),
  0::bigint, 'editor descarta linhas do staging');

select * from finish();
rollback;
