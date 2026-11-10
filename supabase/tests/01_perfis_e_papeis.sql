-- Perfis e papéis (docs 04 e 08, ADR-0018).
--
-- O que este arquivo guarda: o papel vem de `eventos.profiles`, e nunca do
-- claim `user_role`, que no projeto dividido traz o papel do CF Jobs; quem
-- não tem linha em `profiles` não acessa nada; o Eventos não põe trigger em
-- `auth.users` nem hook no Auth; e ninguém promove a si mesmo.

begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- ---------------------------------------------------------------------------
-- Estrutura
-- ---------------------------------------------------------------------------

select has_table('eventos', 'profiles', 'a tabela profiles existe');
select enum_has_labels(
  'eventos', 'user_role', array['admin', 'editor', 'reader'],
  'os papéis são exatamente admin, editor e reader'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'eventos.profiles'::regclass),
  'profiles tem RLS habilitada'
);

-- ---------------------------------------------------------------------------
-- Contas: três com perfil e uma só do Auth, como quem veio do CF Jobs
-- ---------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111',
   'authenticated', 'authenticated', 'leitora@teste.local', 'x', now(), now(), now(), '{}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-4333-8333-333333333333',
   'authenticated', 'authenticated', 'editora@teste.local', 'x', now(), now(), now(), '{}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-8444-444444444444',
   'authenticated', 'authenticated', 'admin@teste.local', 'x', now(), now(), now(), '{}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '55555555-5555-4555-8555-555555555555',
   'authenticated', 'authenticated', 'so-do-cfjobs@teste.local', 'x', now(), now(), now(), '{}', '{}');

select is(
  (select count(*) from eventos.profiles where id = '55555555-5555-4555-8555-555555555555'),
  0::bigint,
  'conta nova no Auth não ganha perfil no Eventos sozinha'
);
select is(
  (select count(*) from pg_trigger t
     join pg_proc p on p.oid = t.tgfoid
    where t.tgrelid = 'auth.users'::regclass
      and p.pronamespace = 'eventos'::regnamespace),
  0::bigint,
  'o Eventos não tem trigger em auth.users'
);
select hasnt_function('eventos', 'custom_access_token', 'o Eventos não tem hook de token');

insert into eventos.profiles (id, display_name, role) values
  ('11111111-1111-4111-8111-111111111111', 'Pessoa Leitora', 'reader'),
  ('33333333-3333-4333-8333-333333333333', 'Pessoa Editora', 'editor'),
  ('44444444-4444-4444-8444-444444444444', 'Pessoa Admin', 'admin');

-- ---------------------------------------------------------------------------
-- authorize: hierarquia admin > editor > reader, lida da tabela
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{}';
select is(eventos.authorize('reader'), false, 'sem sessão, nem reader passa');

set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
select is(eventos.authorize('reader'), true, 'reader passa por reader');
select is(eventos.authorize('editor'), false, 'reader não passa por editor');

set local request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333"}';
select is(eventos.authorize('editor'), true, 'editor passa por editor');
select is(eventos.authorize('admin'), false, 'editor não passa por admin');

set local request.jwt.claims = '{"sub":"44444444-4444-4444-8444-444444444444"}';
select is(eventos.authorize('admin'), true, 'admin passa por admin');

-- ---------------------------------------------------------------------------
-- O claim do CF Jobs não abre nada
-- ---------------------------------------------------------------------------

set local request.jwt.claims =
  '{"sub":"11111111-1111-4111-8111-111111111111","user_role":"admin"}';
select is(
  eventos.authorize('editor'), false,
  'reader no Eventos com user_role admin no token continua reader'
);

set local request.jwt.claims =
  '{"sub":"55555555-5555-4555-8555-555555555555","user_role":"admin"}';
select is(
  eventos.authorize('reader'), false,
  'conta sem perfil no Eventos, com user_role admin no token, não passa nem por reader'
);

-- ---------------------------------------------------------------------------
-- RLS de profiles
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","user_role":"admin"}';

select is(
  (select count(*) from eventos.profiles), 1::bigint,
  'cada pessoa enxerga só o próprio perfil'
);

update eventos.profiles set display_name = 'Nome Novo'
 where id = '11111111-1111-4111-8111-111111111111';
select is(
  (select display_name from eventos.profiles where id = '11111111-1111-4111-8111-111111111111'),
  'Nome Novo',
  'a pessoa edita o próprio nome'
);
select throws_ok(
  $$ update eventos.profiles set role = 'admin'
      where id = '11111111-1111-4111-8111-111111111111' $$,
  '42501', null,
  'ninguém promove a si mesmo'
);

reset role;
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';

select is(
  (select count(*) from eventos.profiles), 1::bigint,
  'nem o admin enxerga os perfis dos outros pela RLS: a lista vai pela conexão do servidor'
);
update eventos.profiles set role = 'admin'
 where id = '33333333-3333-4333-8333-333333333333';
reset role;
select is(
  (select role from eventos.profiles where id = '33333333-3333-4333-8333-333333333333'),
  'editor'::eventos.user_role,
  'nem o admin troca papel pela RLS'
);

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is((select count(*) from eventos.profiles), 0::bigint, 'anon não enxerga perfil nenhum');
reset role;

select * from finish();
rollback;
