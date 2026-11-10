-- 0003 · Perfis e papéis (docs 04 e 08, ADR-0018)
--
-- Os papéis são três: o PRD define `admin` e `editor`, e `reader` é quem tem
-- conta e nenhum acesso.
--
-- O Eventos divide o Auth com o CF Jobs (ADR-0018), e o token traz o claim
-- `user_role` que o hook do CF Jobs preenche com o papel de lá. Por isso o
-- papel daqui vem da tabela `eventos.profiles`, e o claim é ignorado: um admin
-- do CF Jobs não é admin do Eventos. Também não há trigger em `auth.users` nem
-- hook do Eventos: quem não tem linha em `eventos.profiles` não tem acesso, e
-- a linha é criada por um admin do Eventos.

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

-- ---------------------------------------------------------------------------
-- profiles
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

-- Cada pessoa vê só a própria linha, sem chamar função nenhuma: é por ela que
-- a `authorize` lê o papel, e uma policy que chamasse a `authorize` aqui
-- entraria em recursão. A lista de contas do admin usa a conexão do servidor.
create policy profiles_select_own on eventos.profiles
  for select to authenticated
  using (id = auth.uid());

-- A pessoa edita o próprio nome e avatar, nunca o próprio papel: a subconsulta
-- vê a linha de antes do update.
create policy profiles_update_own on eventos.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (
    role = (select p.role from eventos.profiles p where p.id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- authorize: o papel pela tabela, nunca pelo token
-- ---------------------------------------------------------------------------

-- Invoker de propósito: lê o papel pela policy da própria linha. Sem sessão
-- (`anon`) ou sem linha em `profiles`, é `false`.
create function eventos.authorize(min_role eventos.user_role)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select eventos.role_rank(p.role) from eventos.profiles p where p.id = auth.uid())
      >= eventos.role_rank(min_role),
    false
  );
$$;

-- Não há policy de admin sobre `profiles`: com a leitura limitada à própria
-- linha, ela não alcançaria ninguém. Troca de papel é pela conexão do servidor
-- (o SQL do runbook, até a tela de papéis do M11).
