-- Fontes enviadas e modelos de certificado (docs 04 e 05). O modelo é todo
-- de admin: `anon` e `reader` não enxergam nada.

-- Os tokens simulados levam `user_role: "admin"`, como o hook do CF Jobs pode
-- pôr no projeto dividido (ADR-0018): o papel que vale é o de eventos.profiles.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111',
   'authenticated', 'authenticated', 'reader@teste.local', 'x', now(), now(), now(), '{}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-4333-8333-333333333333',
   'authenticated', 'authenticated', 'editor@teste.local', 'x', now(), now(), now(), '{}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-8444-444444444444',
   'authenticated', 'authenticated', 'admin@teste.local', 'x', now(), now(), now(), '{}', '{}');
-- Sem trigger em auth.users (ADR-0018): o perfil do Eventos é criado à parte.
insert into eventos.profiles (id, display_name, role) values
  ('11111111-1111-4111-8111-111111111111', 'Pessoa Leitora', 'reader'),
  ('33333333-3333-4333-8333-333333333333', 'Pessoa Editora', 'editor'),
  ('44444444-4444-4444-8444-444444444444', 'Pessoa Admin', 'admin');

insert into eventos.events (id, slug, title, starts_at) values
  ('e0000000-0000-4000-8000-000000000001', 'evento-a', 'Evento A', now()),
  ('e0000000-0000-4000-8000-000000000002', 'evento-b', 'Evento B', now());

insert into eventos.certificate_templates (id, event_id, name) values
  ('a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'Participante A'),
  ('a0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000002', 'Participante B');

insert into eventos.participation_types (event_id, slug, label, default_hours, certificate_template_id)
values ('e0000000-0000-4000-8000-000000000001', 'participante', 'Participante', 8,
        'a0000000-0000-4000-8000-000000000001');

-- ---------------------------------------------------------------------------
-- Estrutura e integridade
-- ---------------------------------------------------------------------------

select ok((select relrowsecurity from pg_class where oid = 'eventos.certificate_templates'::regclass),
  'certificate_templates tem RLS habilitada');
select ok((select relrowsecurity from pg_class where oid = 'eventos.custom_fonts'::regclass),
  'custom_fonts tem RLS habilitada');

select is(
  (select row(status, version, schema_version, data_fields, layout_fields, column_mapping)::text
     from eventos.certificate_templates where id = 'a0000000-0000-4000-8000-000000000001'),
  '(draft,0,1,[],[],{})',
  'modelo nasce rascunho, versão 0, schema 1 e listas vazias'
);

select throws_ok(
  $$ update eventos.certificate_templates
        set base_pdf_path = 'x.pdf', base_pdf_sha256 = 'abc', base_pdf_size_bytes = 3145729
      where id = 'a0000000-0000-4000-8000-000000000001' $$,
  '23514', null, 'base.pdf acima de 3 MB é recusado: o PDF final precisa caber em 4,5 MB');
select throws_ok(
  $$ update eventos.certificate_templates set base_pdf_path = 'x.pdf'
      where id = 'a0000000-0000-4000-8000-000000000001' $$,
  '23514', null, 'caminho, hash e tamanho do base.pdf andam juntos');
select throws_ok(
  $$ update eventos.certificate_templates
        set pages = '[{"width_pt":1},{"width_pt":2},{"width_pt":3}]'
      where id = 'a0000000-0000-4000-8000-000000000001' $$,
  '23514', null, 'modelo tem no máximo duas páginas: frente e verso');
select throws_ok(
  $$ update eventos.certificate_templates set data_fields = '{}'
      where id = 'a0000000-0000-4000-8000-000000000001' $$,
  '23514', null, 'data_fields é sempre lista');
select throws_ok(
  $$ update eventos.certificate_templates set status = 'published'
      where id = 'a0000000-0000-4000-8000-000000000001' $$,
  '23514', null, 'publicado sem snapshot é recusado: o motor só lê o snapshot');
select lives_ok(
  $$ update eventos.certificate_templates
        set status = 'published', published_snapshot = '{"version":1}', published_at = now(), version = 1
      where id = 'a0000000-0000-4000-8000-000000000001' $$,
  'publicado com snapshot passa');

select throws_ok(
  $$ insert into eventos.participation_types (event_id, slug, label, default_hours, certificate_template_id)
     values ('e0000000-0000-4000-8000-000000000001', 'monitor', 'Monitor', 4,
             'a0000000-0000-4000-8000-000000000002') $$,
  '23503', null, 'tipo de um evento não aponta para modelo de outro evento');
select throws_ok(
  $$ delete from eventos.certificate_templates where id = 'a0000000-0000-4000-8000-000000000001' $$,
  '23503', null, 'modelo com tipo apontando não é apagado');

-- Evento descartável, com modelo e tipo apontando: a cascata precisa passar.
insert into eventos.events (id, slug, title, starts_at)
values ('e0000000-0000-4000-8000-000000000009', 'evento-descartavel', 'Evento descartável', now());
insert into eventos.certificate_templates (id, event_id, name)
values ('a0000000-0000-4000-8000-000000000009', 'e0000000-0000-4000-8000-000000000009', 'Modelo');
insert into eventos.participation_types (event_id, slug, label, default_hours, certificate_template_id)
values ('e0000000-0000-4000-8000-000000000009', 'participante', 'Participante', 4,
        'a0000000-0000-4000-8000-000000000009');
select lives_ok(
  $$ delete from eventos.events where id = 'e0000000-0000-4000-8000-000000000009' $$,
  'apagar o evento leva modelos e tipos junto, na mesma cascata');

select throws_ok(
  $$ insert into eventos.custom_fonts (family, weight, storage_path, sha256, subset_ok, glyph_coverage_ok)
     values ('Fonte', 450, 'f.ttf', 'h1', true, true) $$,
  '23514', null, 'peso de fonte vai de 100 em 100');
insert into eventos.custom_fonts (family, weight, storage_path, sha256, subset_ok, glyph_coverage_ok)
values ('Fonte da Casa', 400, 'fonts/casa-400.ttf', 'hash-da-fonte', true, true);
select throws_ok(
  $$ insert into eventos.custom_fonts (family, weight, storage_path, sha256, subset_ok, glyph_coverage_ok)
     values ('Outra', 700, 'fonts/outra.ttf', 'hash-da-fonte', true, true) $$,
  '23505', null, 'a mesma fonte não entra duas vezes');

-- ---------------------------------------------------------------------------
-- anon e reader: nada
-- ---------------------------------------------------------------------------

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is((select count(*) from eventos.certificate_templates), 0::bigint, 'anon não vê modelo');
select is((select count(*) from eventos.custom_fonts), 0::bigint, 'anon não vê fonte');

reset role;
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","user_role":"admin"}';
select is((select count(*) from eventos.certificate_templates), 0::bigint, 'reader não vê modelo');
select is((select count(*) from eventos.custom_fonts), 0::bigint, 'reader não vê fonte');

-- ---------------------------------------------------------------------------
-- editor: cria e edita, não apaga
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","user_role":"admin"}';

select is((select count(*) from eventos.certificate_templates
            where event_id in ('e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002')),
  2::bigint, 'editor vê os modelos');
select lives_ok(
  $$ insert into eventos.certificate_templates (event_id, name)
     values ('e0000000-0000-4000-8000-000000000002', 'Palestrante B') $$,
  'editor cria modelo');
select lives_ok(
  $$ update eventos.certificate_templates set name = 'Participante B (novo)'
      where id = 'a0000000-0000-4000-8000-000000000002' $$,
  'editor edita modelo');
select lives_ok(
  $$ insert into eventos.custom_fonts (family, weight, storage_path, sha256, subset_ok, glyph_coverage_ok)
     values ('Fonte do Editor', 700, 'fonts/editor-700.ttf', 'hash-do-editor', false, true) $$,
  'editor sobe fonte');

delete from eventos.certificate_templates where id = 'a0000000-0000-4000-8000-000000000002';
select is((select count(*) from eventos.certificate_templates where id = 'a0000000-0000-4000-8000-000000000002'),
  1::bigint, 'editor não apaga modelo');

-- ---------------------------------------------------------------------------
-- admin: apaga só rascunho
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated","user_role":"admin"}';

-- O modelo A está publicado e tem tipo apontando; o B é rascunho sem tipo.
delete from eventos.certificate_templates where id = 'a0000000-0000-4000-8000-000000000001';
select is((select count(*) from eventos.certificate_templates where id = 'a0000000-0000-4000-8000-000000000001'),
  1::bigint, 'admin não apaga modelo publicado');
delete from eventos.certificate_templates where id = 'a0000000-0000-4000-8000-000000000002';
select is((select count(*) from eventos.certificate_templates where id = 'a0000000-0000-4000-8000-000000000002'),
  0::bigint, 'admin apaga rascunho');

select * from finish();
rollback;
