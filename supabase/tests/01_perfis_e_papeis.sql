-- Perfis, papéis e o claim que a RLS lê (docs 04 e 08).
--
-- O que este arquivo guarda: todo usuário novo nasce `reader`, que não
-- acessa nada; o papel chega ao JWT pelo hook e a RLS o lê de lá; ninguém
-- promove a si mesmo; e o hook só é executável pelo serviço de auth.

begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

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
-- authorize: hierarquia admin > editor > reader, lida do claim do JWT
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{}';
select is(eventos.authorize('reader'), false, 'sem claim, nem reader passa');

set local request.jwt.claims = '{"user_role":"reader"}';
select is(eventos.authorize('reader'), true, 'reader passa por reader');
select is(eventos.authorize('editor'), false, 'reader não passa por editor');

set local request.jwt.claims = '{"user_role":"editor"}';
select is(eventos.authorize('reader'), true, 'editor passa por reader');
select is(eventos.authorize('editor'), true, 'editor passa por editor');
select is(eventos.authorize('admin'), false, 'editor não passa por admin');

set local request.jwt.claims = '{"user_role":"admin"}';
select is(eventos.authorize('admin'), true, 'admin passa por admin');

set local request.jwt.claims = '{"user_role":"moderator"}';
select throws_ok(
  $$ select eventos.authorize('reader') $$,
  '22P02', null,
  'papel desconhecido no claim é erro, e não permissão silenciosa'
);

-- ---------------------------------------------------------------------------
-- Novo usuário nasce reader
-- ---------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111',
   'authenticated', 'authenticated', 'leitora@teste.local', 'x', now(), now(), now(),
   '{}', '{"full_name":"Pessoa Leitora"}'),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-8444-444444444444',
   'authenticated', 'authenticated', 'admin@teste.local', 'x', now(), now(), now(),
   '{}', '{}');

select is(
  (select role from eventos.profiles where id = '11111111-1111-4111-8111-111111111111'),
  'reader'::eventos.user_role,
  'cadastro novo nasce reader'
);
select is(
  (select display_name from eventos.profiles where id = '11111111-1111-4111-8111-111111111111'),
  'Pessoa Leitora',
  'o nome vem do metadado do provedor'
);
select is(
  (select display_name from eventos.profiles where id = '44444444-4444-4444-8444-444444444444'),
  'admin',
  'sem nome no metadado, cai na parte local do e-mail'
);

update eventos.profiles set role = 'admin' where id = '44444444-4444-4444-8444-444444444444';

-- ---------------------------------------------------------------------------
-- Hook de claim
-- ---------------------------------------------------------------------------

select is(
  eventos.custom_access_token(jsonb_build_object(
    'user_id', '11111111-1111-4111-8111-111111111111', 'claims', '{}'::jsonb
  )) -> 'claims' ->> 'user_role',
  'reader',
  'o hook injeta o papel do perfil'
);
select is(
  eventos.custom_access_token(jsonb_build_object(
    'user_id', '44444444-4444-4444-8444-444444444444', 'claims', '{}'::jsonb
  )) -> 'claims' ->> 'user_role',
  'admin',
  'o hook reflete a promoção'
);
select is(
  eventos.custom_access_token(jsonb_build_object(
    'user_id', '99999999-9999-4999-8999-999999999999', 'claims', '{}'::jsonb
  )) -> 'claims' ->> 'user_role',
  'reader',
  'usuário sem perfil recebe reader, nunca nada'
);
select ok(
  not has_function_privilege('anon', 'eventos.custom_access_token(jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'eventos.custom_access_token(jsonb)', 'execute'),
  'o hook não é endpoint público'
);
select ok(
  has_function_privilege('supabase_auth_admin', 'eventos.custom_access_token(jsonb)', 'execute'),
  'o serviço de auth executa o hook'
);

-- ---------------------------------------------------------------------------
-- RLS de profiles
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","user_role":"reader"}';

select is(
  (select count(*) from eventos.profiles), 1::bigint,
  'reader enxerga só o próprio perfil'
);

update eventos.profiles set display_name = 'Nome Novo'
 where id = '11111111-1111-4111-8111-111111111111';
select is(
  (select display_name from eventos.profiles where id = '11111111-1111-4111-8111-111111111111'),
  'Nome Novo',
  'reader edita o próprio nome'
);
select throws_ok(
  $$ update eventos.profiles set role = 'admin'
      where id = '11111111-1111-4111-8111-111111111111' $$,
  '42501', null,
  'reader não promove a si mesmo'
);

reset role;
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated","user_role":"admin"}';

select cmp_ok(
  (select count(*) from eventos.profiles), '>=', 2::bigint,
  'admin enxerga todos os perfis'
);

select * from finish();
rollback;
