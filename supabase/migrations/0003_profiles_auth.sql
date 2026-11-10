-- 0003 · Perfis, papéis e o claim que a RLS lê (docs 04 e 08)
--
-- Herdado do CF Jobs com uma diferença: aqui os papéis são três, e não
-- quatro. O PRD define `admin` e `editor`; `reader` existe só porque o login
-- com GitHub é aberto, e quem acabou de se cadastrar não acessa nada.

-- ---------------------------------------------------------------------------
-- Funções de apoio
-- ---------------------------------------------------------------------------

create function eventos.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create function eventos.role_rank(role eventos.user_role)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case role
    when 'admin' then 3
    when 'editor' then 2
    when 'reader' then 1
  end;
$$;

-- O papel vem do claim do JWT, e não de um join com `profiles`: a policy fica
-- barata e a aplicação lê o papel da sessão sem consulta. O preço, aceito no
-- CF Jobs e aqui, é que mudar de papel exige novo login.
--
-- Papel desconhecido no claim é erro de conversão de enum, e não `false`: a
-- falha fica visível em vez de virar negação silenciosa difícil de depurar.
create function eventos.authorize(min_role eventos.user_role)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    eventos.role_rank(
      nullif(auth.jwt() ->> 'user_role', '')::eventos.user_role
    ) >= eventos.role_rank(min_role),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- profiles (espelho de auth.users)
-- ---------------------------------------------------------------------------

create table eventos.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 120),
  avatar_url text,
  role eventos.user_role not null default 'reader',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on eventos.profiles
  for each row execute function eventos.set_updated_at();

alter table eventos.profiles enable row level security;

create policy profiles_select_own_or_admin on eventos.profiles
  for select to authenticated
  using (id = auth.uid() or eventos.authorize('admin'));

-- A pessoa edita o próprio nome e avatar, nunca o próprio papel. A comparação
-- é com o claim do JWT porque uma subconsulta na própria tabela causaria
-- recursão de policy.
create policy profiles_update_own on eventos.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (role::text = coalesce(auth.jwt() ->> 'user_role', 'reader'));

create policy profiles_update_admin on eventos.profiles
  for update to authenticated
  using (eventos.authorize('admin'))
  with check (eventos.authorize('admin'));

-- ---------------------------------------------------------------------------
-- Novo usuário ganha perfil `reader`
-- ---------------------------------------------------------------------------

create function eventos.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into eventos.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(new.raw_user_meta_data ->> 'user_name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Pessoa organizadora'
    ),
    nullif(new.raw_user_meta_data ->> 'avatar_url', '')
  );

  return new;
end;
$$;

-- Função `security definer` vira endpoint pelo PostgREST se ninguém revogar,
-- porque o Postgres concede `execute` a `public` em toda função nova (doc 08).
revoke execute on function eventos.handle_new_user() from anon, authenticated, public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function eventos.handle_new_user();

-- ---------------------------------------------------------------------------
-- Custom Access Token Hook: injeta `user_role` nos claims
-- ---------------------------------------------------------------------------

create function eventos.custom_access_token(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims jsonb;
  profile_role eventos.user_role;
begin
  select role into profile_role
    from eventos.profiles
   where id = (event ->> 'user_id')::uuid;

  claims := coalesce(event -> 'claims', '{}'::jsonb);
  claims := jsonb_set(
    claims,
    '{user_role}',
    to_jsonb(coalesce(profile_role, 'reader'::eventos.user_role))
  );

  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- O hook é chamado pelo serviço de auth, e por mais ninguém.
grant usage on schema eventos to supabase_auth_admin;
grant execute on function eventos.custom_access_token(jsonb) to supabase_auth_admin;
revoke execute on function eventos.custom_access_token(jsonb) from anon, authenticated, public;
