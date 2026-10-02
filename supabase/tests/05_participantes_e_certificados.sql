-- Participantes e certificados (docs 04 e 05). O que este arquivo guarda:
-- identidade normalizada pelo banco, um CPF por evento, código e sequência
-- imutáveis, versão que sobe quando o que o papel afirma muda, e nenhum
-- acesso público a pessoa (ADR-0012).

begin;
create extension if not exists pgtap with schema extensions;
select plan(40);

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
  ('e0000000-0000-4000-8000-000000000001', 'evento-a', 'Evento A', now(), 'completed', true),
  ('e0000000-0000-4000-8000-000000000002', 'evento-b', 'Evento B', now(), 'completed', true);

insert into public.participation_types (id, event_id, slug, label, default_hours) values
  ('70000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'participante', 'Participante', 8),
  ('70000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'palestrante', 'Palestrante', 2),
  ('70000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000002', 'participante', 'Participante', 4);

insert into public.participants (id, event_id, full_name, cpf_hash, cpf_last3, email) values
  ('90000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001',
   'José Gonçalves de Assunção', repeat('a', 64), '145', 'jose@example.com'),
  ('90000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001',
   'Ana Lima', null, null, null),
  ('90000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000002',
   'Pessoa do Evento B', repeat('a', 64), '145', null);

insert into public.certificates (id, event_id, participant_id, participation_type_id, hours) values
  ('c0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001',
   '90000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', 8);
insert into public.certificates (id, event_id, participant_id, participation_type_id) values
  ('c0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001',
   '90000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000002'),
  ('c0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000002',
   '90000000-0000-4000-8000-000000000003', '70000000-0000-4000-8000-000000000003');

-- ---------------------------------------------------------------------------
-- Identidade
-- ---------------------------------------------------------------------------

select ok((select relrowsecurity from pg_class where oid = 'public.participants'::regclass),
  'participants tem RLS habilitada');
select ok((select relrowsecurity from pg_class where oid = 'public.certificates'::regclass),
  'certificates tem RLS habilitada');

select is(
  (select full_name_normalized from public.participants where id = '90000000-0000-4000-8000-000000000001'),
  'jose goncalves assuncao',
  'o nome normalizado é gerado pelo banco, pela mesma função da busca');

select throws_ok(
  $$ insert into public.participants (event_id, full_name)
     values ('e0000000-0000-4000-8000-000000000001', 'Maria  Dupla') $$,
  '23514', null, 'nome com espaço duplo é recusado: a aplicação grava já colapsado');
select throws_ok(
  $$ insert into public.participants (event_id, full_name)
     values ('e0000000-0000-4000-8000-000000000001', 'de da do') $$,
  '23514', null, 'nome que normaliza para quase nada é recusado');
select throws_ok(
  $$ insert into public.participants (event_id, full_name, cpf_hash)
     values ('e0000000-0000-4000-8000-000000000001', 'Pessoa Nova', repeat('b', 64)) $$,
  '23514', null, 'hash do CPF sem os três últimos dígitos é recusado');
select throws_ok(
  $$ insert into public.participants (event_id, full_name, cpf_hash, cpf_last3)
     values ('e0000000-0000-4000-8000-000000000001', 'Pessoa Nova', '12345678901', '901') $$,
  '23514', null, 'CPF em claro no lugar do hash é recusado pelo formato');
select throws_ok(
  $$ insert into public.participants (event_id, full_name, email)
     values ('e0000000-0000-4000-8000-000000000001', 'Pessoa Nova', 'Maiuscula@Example.com') $$,
  '23514', null, 'e-mail fora de minúsculas é recusado');
select throws_ok(
  $$ insert into public.participants (event_id, full_name, birth_date)
     values ('e0000000-0000-4000-8000-000000000001', 'Pessoa Nova', '1899-12-31') $$,
  '23514', null, 'nascimento antes de 1900 é recusado');
select throws_ok(
  $$ insert into public.participants (event_id, full_name, cpf_hash, cpf_last3)
     values ('e0000000-0000-4000-8000-000000000001', 'Outra Pessoa', repeat('a', 64), '145') $$,
  '23505', null, 'o mesmo CPF não entra duas vezes no mesmo evento');
select is(
  (select count(*) from public.participants where cpf_hash = repeat('a', 64)),
  2::bigint, 'o mesmo hash em eventos diferentes é permitido (na vida real o sal difere)');

-- ---------------------------------------------------------------------------
-- Certificado: código, sequência, carga horária
-- ---------------------------------------------------------------------------

select is(
  (select count(*) from public.certificates where code !~ '^[0-9A-HJKMNP-TV-Z]{10}$'),
  0::bigint, 'todo certificado nasce com código Crockford');
select is(
  (select array_agg(sequence_number order by sequence_number) from public.certificates
    where event_id = 'e0000000-0000-4000-8000-000000000001'),
  array[1, 2], 'a sequência é contínua dentro do evento');
select is(
  (select sequence_number from public.certificates where id = 'c0000000-0000-4000-8000-000000000003'),
  1, 'cada evento começa a própria sequência');
select is(
  (select hours from public.certificates where id = 'c0000000-0000-4000-8000-000000000002'),
  2.0::numeric, 'sem carga horária informada, vale a padrão do tipo');
select is(
  (select row(version, status, download_count, data)::text from public.certificates
    where id = 'c0000000-0000-4000-8000-000000000001'),
  '(1,active,0,{})', 'certificado nasce ativo, versão 1, sem downloads e sem conteúdo');

select throws_ok(
  $$ insert into public.certificates (event_id, participant_id, participation_type_id)
     values ('e0000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000002',
             '70000000-0000-4000-8000-000000000003') $$,
  '23503', null, 'certificado não usa tipo de outro evento');
select throws_ok(
  $$ insert into public.certificates (event_id, participant_id, participation_type_id)
     values ('e0000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000001',
             '70000000-0000-4000-8000-000000000003') $$,
  '23503', null, 'certificado não aponta para pessoa de outro evento');
select throws_ok(
  $$ insert into public.certificates (event_id, participant_id, participation_type_id)
     values ('e0000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001',
             '70000000-0000-4000-8000-000000000001') $$,
  '23505', null, 'a mesma pessoa não tem dois certificados do mesmo tipo');
select is(
  (select count(*) from public.certificates where participant_id = '90000000-0000-4000-8000-000000000001'),
  2::bigint, 'a mesma pessoa tem dois certificados de tipos diferentes (ADR-0004)');

-- ---------------------------------------------------------------------------
-- O que está no papel continua valendo
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ update public.certificates set code = 'ABCDEFGHJK'
      where id = 'c0000000-0000-4000-8000-000000000001' $$,
  'P0001', null, 'o código é imutável: ele pode estar num papel');
select throws_ok(
  $$ update public.certificates set sequence_number = 99
      where id = 'c0000000-0000-4000-8000-000000000001' $$,
  'P0001', null, 'a sequência é imutável');

update public.certificates set data = '{"titulo_palestra": "Testes que valem"}'
 where id = 'c0000000-0000-4000-8000-000000000002';
select is((select version from public.certificates where id = 'c0000000-0000-4000-8000-000000000002'),
  2, 'mudar o conteúdo sobe a versão');
update public.certificates set hours = 3 where id = 'c0000000-0000-4000-8000-000000000002';
select is((select version from public.certificates where id = 'c0000000-0000-4000-8000-000000000002'),
  3, 'mudar a carga horária sobe a versão');
select isnt((select content_updated_at from public.certificates where id = 'c0000000-0000-4000-8000-000000000002'),
  null, 'subir a versão marca quando o conteúdo mudou ("dados atualizados em", doc 03)');
-- Uma data antiga conhecida, para ver que o download não a troca.
update public.certificates set content_updated_at = '2026-01-01T00:00:00Z'
 where id = 'c0000000-0000-4000-8000-000000000002';
update public.certificates set download_count = 5 where id = 'c0000000-0000-4000-8000-000000000002';
select is((select version from public.certificates where id = 'c0000000-0000-4000-8000-000000000002'),
  3, 'registrar download não mexe na versão');
select is((select content_updated_at from public.certificates where id = 'c0000000-0000-4000-8000-000000000002'),
  '2026-01-01T00:00:00Z'::timestamptz, 'nem na data do conteúdo, que o updated_at não serviria para dizer');

create temporary table codigo_antes on commit drop as
  select code from public.certificates where id = 'c0000000-0000-4000-8000-000000000001';
update public.participants set full_name = 'José Gonçalves de Assunção Filho'
 where id = '90000000-0000-4000-8000-000000000001';
select is(
  (select array_agg(version order by sequence_number) from public.certificates
    where participant_id = '90000000-0000-4000-8000-000000000001'),
  array[2, 4], 'corrigir o nome sobe a versão de todos os certificados da pessoa');
select isnt((select content_updated_at from public.certificates where id = 'c0000000-0000-4000-8000-000000000001'),
  null, 'e marca a data do conteúdo deles');
select is(
  (select code from public.certificates where id = 'c0000000-0000-4000-8000-000000000001'),
  (select code from codigo_antes), 'e o código continua o mesmo (armadilha 8)');

select throws_ok(
  $$ update public.certificates set status = 'revoked', revoked_at = now()
      where id = 'c0000000-0000-4000-8000-000000000003' $$,
  '23514', null, 'revogar exige motivo');
select lives_ok(
  $$ update public.certificates
        set status = 'revoked', revoked_at = now(), revoked_reason = 'Emitido para a pessoa errada.'
      where id = 'c0000000-0000-4000-8000-000000000003' $$,
  'com motivo, revoga');
select throws_ok(
  $$ update public.certificates set status = 'erased'
      where id = 'c0000000-0000-4000-8000-000000000001' $$,
  '23514', null, 'lápide sem desligar a pessoa é recusada: só a eliminação LGPD produz lápide');
select throws_ok(
  $$ delete from public.participants where id = '90000000-0000-4000-8000-000000000001' $$,
  '23514', null, 'apagar pessoa com certificado ativo é recusado');
-- Qualquer erro serve: a restrição de `certificates.event_id` e a cascata que
-- tenta desligar a pessoa de um certificado ativo barram por caminhos
-- diferentes, e a ordem entre elas é detalhe de implementação do Postgres.
select throws_ok(
  $$ delete from public.events where id = 'e0000000-0000-4000-8000-000000000001' $$,
  null, null, 'apagar evento com certificados é recusado');

-- ---------------------------------------------------------------------------
-- RLS: nenhum acesso público a pessoa (ADR-0012)
-- ---------------------------------------------------------------------------

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is((select count(*) from public.participants) + (select count(*) from public.certificates),
  0::bigint, 'anon não enxerga pessoa nem certificado');

reset role;
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","user_role":"reader"}';
select is((select count(*) from public.participants) + (select count(*) from public.certificates),
  0::bigint, 'reader não enxerga pessoa nem certificado');

reset role;
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","user_role":"editor"}';
select lives_ok(
  $$ insert into public.participants (event_id, full_name)
     values ('e0000000-0000-4000-8000-000000000002', 'Pessoa do Editor') $$,
  'editor cria participante');
delete from public.participants where id = '90000000-0000-4000-8000-000000000002';
select is((select count(*) from public.participants where id = '90000000-0000-4000-8000-000000000002'),
  1::bigint, 'editor não apaga participante');

reset role;
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated","user_role":"admin"}';
delete from public.participants where id = '90000000-0000-4000-8000-000000000002';
select is((select count(*) from public.participants where id = '90000000-0000-4000-8000-000000000002'),
  0::bigint, 'admin apaga participante sem certificado');

select * from finish();
rollback;
