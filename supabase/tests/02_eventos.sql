-- Eventos e tipos de participação (doc 04): regras de integridade e a matriz
-- de RLS. `anon` enxerga evento fora de rascunho e nada mais.

begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

-- ---------------------------------------------------------------------------
-- Fixtures: um usuário por papel
-- ---------------------------------------------------------------------------

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111',
   'authenticated', 'authenticated', 'reader@teste.local', 'x', now(), now(), now(), '{}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-4333-8333-333333333333',
   'authenticated', 'authenticated', 'editor@teste.local', 'x', now(), now(), now(), '{}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-8444-444444444444',
   'authenticated', 'authenticated', 'admin@teste.local', 'x', now(), now(), now(), '{}', '{}');
update eventos.profiles set role = 'editor' where id = '33333333-3333-4333-8333-333333333333';
update eventos.profiles set role = 'admin' where id = '44444444-4444-4444-8444-444444444444';

insert into eventos.events (id, slug, title, starts_at, status) values
  ('e0000000-0000-4000-8000-000000000001', 'evento-rascunho', 'Evento em rascunho', now(), 'draft'),
  ('e0000000-0000-4000-8000-000000000002', 'evento-publico', 'Evento público', now(), 'completed');

insert into eventos.participation_types (event_id, slug, label, default_hours)
values ('e0000000-0000-4000-8000-000000000002', 'participante', 'Participante', 8);

-- ---------------------------------------------------------------------------
-- Estrutura e integridade
-- ---------------------------------------------------------------------------

select ok((select relrowsecurity from pg_class where oid = 'eventos.events'::regclass),
  'events tem RLS habilitada');
select ok((select relrowsecurity from pg_class where oid = 'eventos.participation_types'::regclass),
  'participation_types tem RLS habilitada');

select matches(
  (select cpf_salt from eventos.events where slug = 'evento-publico'),
  '^[0-9a-f]{32}$',
  'todo evento nasce com sal de 16 bytes, sem depender de quem insere'
);
select isnt(
  (select cpf_salt from eventos.events where slug = 'evento-publico'),
  (select cpf_salt from eventos.events where slug = 'evento-rascunho'),
  'cada evento tem o próprio sal'
);

select throws_ok(
  $$ insert into eventos.events (slug, title, starts_at) values ('Com Maiuscula', 'Título', now()) $$,
  '23514', null, 'slug fora de kebab-case é recusado');
select throws_ok(
  $$ insert into eventos.events (slug, title, starts_at) values ('ab', 'Título', now()) $$,
  '23514', null, 'slug curto demais é recusado');
select throws_ok(
  $$ insert into eventos.events (slug, title, starts_at) values ('evento-x', 'T', now()) $$,
  '23514', null, 'título curto demais é recusado');
select throws_ok(
  $$ insert into eventos.events (slug, title, starts_at, ends_at)
     values ('evento-x', 'Título', now(), now() - interval '1 day') $$,
  '23514', null, 'fim antes do início é recusado');
select throws_ok(
  $$ insert into eventos.events (slug, title, starts_at, cpf_salt)
     values ('evento-x', 'Título', now(), 'curto') $$,
  '23514', null, 'sal fora do formato é recusado');
select throws_ok(
  $$ insert into eventos.events (slug, title, starts_at, external_url)
     values ('evento-x', 'Título', now(), 'http://inseguro.example') $$,
  '23514', null, 'link externo precisa ser https');
select throws_ok(
  $$ insert into eventos.events (slug, title, starts_at, status)
     values ('evento-x', 'Título', now(), 'certificates_available') $$,
  '23514', null, 'liberar certificados exige ao menos uma chave de busca');
select lives_ok(
  $$ insert into eventos.events (slug, title, starts_at, status, search_by_name)
     values ('evento-liberado', 'Título', now(), 'certificates_available', true) $$,
  'com uma chave de busca, liberar passa');

select lives_ok(
  $$ update eventos.events set slug = 'rascunho-renomeado' where slug = 'evento-rascunho' $$,
  'em rascunho o slug ainda muda');
select throws_ok(
  $$ update eventos.events set slug = 'outro-slug' where slug = 'evento-publico' $$,
  'P0001', null, 'fora de rascunho o slug é imutável: ele já está em cartaz e em grupo');

select throws_ok(
  $$ insert into eventos.participation_types (event_id, slug, label, default_hours)
     values ('e0000000-0000-4000-8000-000000000002', 'participante', 'Repetido', 4) $$,
  '23505', null, 'o slug do tipo é único dentro do evento');
select throws_ok(
  $$ insert into eventos.participation_types (event_id, slug, label, default_hours)
     values ('e0000000-0000-4000-8000-000000000002', 'monitor', 'Monitor', -1) $$,
  '23514', null, 'carga horária negativa é recusada');

-- ---------------------------------------------------------------------------
-- anon: evento fora de rascunho, e nada de tipos
-- ---------------------------------------------------------------------------

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select is((select count(*) from eventos.events where id = 'e0000000-0000-4000-8000-000000000001'),
  0::bigint, 'anon não vê rascunho');
select is((select count(*) from eventos.events where id = 'e0000000-0000-4000-8000-000000000002'),
  1::bigint, 'anon vê evento publicado');
select is((select count(*) from eventos.participation_types), 0::bigint, 'anon não vê tipos');
select throws_ok(
  $$ insert into eventos.events (slug, title, starts_at) values ('evento-anon', 'Título', now()) $$,
  '42501', null, 'anon não cria evento');

-- ---------------------------------------------------------------------------
-- reader: igual a anon
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","user_role":"reader"}';

select is((select count(*) from eventos.events where id = 'e0000000-0000-4000-8000-000000000001'),
  0::bigint, 'reader não vê rascunho');
select is((select count(*) from eventos.participation_types), 0::bigint, 'reader não vê tipos');

-- ---------------------------------------------------------------------------
-- editor: tudo, menos apagar evento
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","user_role":"editor"}';

select is((select count(*) from eventos.events where id = 'e0000000-0000-4000-8000-000000000001'),
  1::bigint, 'editor vê rascunho');
select lives_ok(
  $$ insert into eventos.events (slug, title, starts_at) values ('evento-do-editor', 'Título', now()) $$,
  'editor cria evento');
select lives_ok(
  $$ insert into eventos.participation_types (event_id, slug, label, default_hours)
     values ('e0000000-0000-4000-8000-000000000002', 'palestrante', 'Palestrante', 2) $$,
  'editor cria tipo de participação');
select is((select count(*) from eventos.participation_types
            where event_id = 'e0000000-0000-4000-8000-000000000002'),
  2::bigint, 'editor vê os tipos');

delete from eventos.events where id = 'e0000000-0000-4000-8000-000000000001';
select is((select count(*) from eventos.events where id = 'e0000000-0000-4000-8000-000000000001'),
  1::bigint, 'editor não apaga evento');

-- ---------------------------------------------------------------------------
-- admin: apaga só rascunho
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated","user_role":"admin"}';

delete from eventos.events where id = 'e0000000-0000-4000-8000-000000000002';
select is((select count(*) from eventos.events where id = 'e0000000-0000-4000-8000-000000000002'),
  1::bigint, 'admin não apaga evento fora de rascunho');

delete from eventos.events where id = 'e0000000-0000-4000-8000-000000000001';
select is((select count(*) from eventos.events where id = 'e0000000-0000-4000-8000-000000000001'),
  0::bigint, 'admin apaga rascunho');

select * from finish();
rollback;
