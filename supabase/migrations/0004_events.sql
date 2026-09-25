-- 0004 · Eventos e tipos de participação (doc 04)
--
-- `anon` enxerga evento fora de rascunho e nada mais, em nenhuma tabela deste
-- projeto: pessoa, certificado e tudo o que é de admin são lidos para o
-- público pelo servidor, depois do rate limit (ADR-0012).

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------

create table public.events (
  id uuid primary key default gen_random_uuid(),

  -- Editável só em rascunho (trigger abaixo): depois de publicado, o slug já
  -- está em QR de cartaz e em link de grupo (doc 02).
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 80),
  title text not null check (char_length(btrim(title)) between 3 and 160),
  description_md text not null default '',
  -- Caminho no bucket `covers`. Nulo cai na capa gerada, nunca em imagem quebrada.
  cover_path text,

  starts_at timestamptz not null,
  ends_at timestamptz check (ends_at >= starts_at),
  location_name text,
  city text,
  state char(2),
  external_url text check (external_url ~ '^https://'),

  status public.event_status not null default 'draft',

  -- Chaves independentes da busca pública (doc 08).
  search_by_cpf boolean not null default false,
  search_by_email boolean not null default false,
  search_by_name boolean not null default false,
  -- Data de nascimento nunca é chave sozinha (ADR-0009): em `any` ela é
  -- segundo fator do nome; em `all`, mais um campo exigido.
  search_birth_date boolean not null default false,
  search_mode public.search_mode not null default 'any',

  -- Sal do HMAC do CPF (ADR-0005). O default garante que nenhum caminho crie
  -- evento sem sal, e que o clone do M11 receba um novo. Nunca sai do
  -- servidor e nunca muda: trocar invalidaria a busca por CPF do evento.
  cpf_salt text not null default encode(extensions.gen_random_bytes(16), 'hex')
    check (cpf_salt ~ '^[0-9a-f]{32}$'),

  -- Canal exibido em "não encontrei" e destino da notificação de pedido de
  -- correção (doc 07).
  contact_email text,
  contact_url text,

  certificates_released_at timestamptz,
  cloned_from_event_id uuid references public.events (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Evento com certificados no ar precisa de pelo menos uma forma de busca.
  check (
    status <> 'certificates_available'
    or search_by_cpf or search_by_email or search_by_name
  )
);

create index events_status_starts_at_idx on public.events (status, starts_at desc);

create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

create function public.events_protect_slug()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.slug is distinct from old.slug and old.status <> 'draft' then
    raise exception 'O endereço do evento não muda depois que ele sai do rascunho.'
      using hint = 'Ele já pode estar em cartaz, QR ou link de grupo.';
  end if;
  return new;
end;
$$;

create trigger events_protect_slug
  before update of slug on public.events
  for each row execute function public.events_protect_slug();

alter table public.events enable row level security;

create policy events_select_public on public.events
  for select to anon, authenticated
  using (status <> 'draft' or public.authorize('editor'));

create policy events_insert_editor on public.events
  for insert to authenticated
  with check (public.authorize('editor'));

create policy events_update_editor on public.events
  for update to authenticated
  using (public.authorize('editor'))
  with check (public.authorize('editor'));

-- "Só rascunho sem certificados" (doc 04): o "sem certificados" é garantido
-- pela FK de `certificates.event_id` com `on delete restrict` (0006).
create policy events_delete_admin on public.events
  for delete to authenticated
  using (public.authorize('admin') and status = 'draft');

-- ---------------------------------------------------------------------------
-- participation_types
-- ---------------------------------------------------------------------------

create table public.participation_types (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  slug text not null
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 2 and 40),
  label text not null check (char_length(btrim(label)) between 2 and 60),
  -- Valores que a coluna de tipo do CSV pode trazer: `ouvinte`, `speaker`.
  aliases text[] not null default '{}',
  default_hours numeric(5, 1) not null check (default_hours >= 0),
  -- A FK para `certificate_templates` entra em 0005, com a tabela.
  certificate_template_id uuid,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, slug)
);

create trigger participation_types_set_updated_at
  before update on public.participation_types
  for each row execute function public.set_updated_at();

alter table public.participation_types enable row level security;

create policy participation_types_all_editor on public.participation_types
  for all to authenticated
  using (public.authorize('editor'))
  with check (public.authorize('editor'));
