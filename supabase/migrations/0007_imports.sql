-- 0007 · Staging da importação de CSV (docs 04 e 06)
--
-- O arquivo CSV nunca é persistido (ADR-0011). O staging guarda linhas já
-- validadas e normalizadas, com o CPF já em HMAC, e expira.
--
-- `compute_import_diff` e `apply_import` entram nesta mesma migration no M7,
-- com os testes CSV-I1 a CSV-I9. Até lá elas não existem, de propósito: uma
-- função que só lança "não implementado" seria código morto com cara de
-- pronto. Editar a migration antes do primeiro deploy é seguro, porque ainda
-- não existe banco em produção com quem manter compatibilidade.

-- ---------------------------------------------------------------------------
-- import_batches
-- ---------------------------------------------------------------------------

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  -- Nulo quando a planilha traz uma coluna de tipo e cada linha é roteada
  -- para o modelo do próprio tipo (doc 06).
  participation_type_id uuid,
  status public.import_status not null default 'staged',

  -- O único rastro do arquivo: nome e hash, nunca o conteúdo.
  file_name text check (char_length(file_name) <= 255),
  file_sha256 text check (file_sha256 ~ '^[0-9a-f]{64}$'),
  encoding text,
  delimiter text,
  row_count integer not null default 0 check (row_count >= 0),

  mapping jsonb not null default '{}' check (jsonb_typeof(mapping) = 'object'),
  -- Contadores da prévia, e só contadores: nunca nomes (doc 07).
  summary jsonb not null default '{}' check (jsonb_typeof(summary) = 'object'),
  -- sha256 do plano que o admin viu. A aplicação recalcula o diff e aborta se
  -- ele não bater (ADR-0011).
  preview_digest text check (preview_digest ~ '^[0-9a-f]{64}$'),
  error_message text,

  created_by uuid references public.profiles (id) on delete set null,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  foreign key (participation_type_id, event_id)
    references public.participation_types (id, event_id)
    on delete cascade,
  check ((status = 'applied') = (applied_at is not null))
);

create index import_batches_event_idx on public.import_batches (event_id, created_at desc);

create trigger import_batches_set_updated_at
  before update on public.import_batches
  for each row execute function public.set_updated_at();

alter table public.import_batches enable row level security;

create policy import_batches_all_editor on public.import_batches
  for all to authenticated
  using (public.authorize('editor'))
  with check (public.authorize('editor'));

-- Participante e certificado lembram de qual lote vieram: é o filtro da
-- remoção manual por lote (ADR-0007). Apagar o lote não apaga ninguém.
alter table public.participants
  add constraint participants_created_by_batch_fk
  foreign key (created_by_batch_id) references public.import_batches (id) on delete set null;

alter table public.certificates
  add constraint certificates_created_by_batch_fk
  foreign key (created_by_batch_id) references public.import_batches (id) on delete set null;

-- ---------------------------------------------------------------------------
-- import_rows
-- ---------------------------------------------------------------------------

-- Linha do arquivo já validada. Linha com erro também fica aqui, para a prévia
-- mostrar número da linha e motivo, por isso os campos de identidade não têm
-- as restrições de `participants`: o que é recusado é recusado na prévia, e
-- não aqui. A exceção é o CPF, que nunca entra em claro nem no staging.
create table public.import_rows (
  batch_id uuid not null references public.import_batches (id) on delete cascade,
  -- Linha do arquivo. A 1 é o cabeçalho e nunca vira dado.
  row_number integer not null check (row_number >= 2),
  participation_type_id uuid references public.participation_types (id) on delete cascade,

  full_name text,
  full_name_normalized text generated always as (public.normalize_person_name(full_name)) stored,
  cpf_hash text check (cpf_hash ~ '^[0-9a-f]{64}$'),
  cpf_last3 text check (cpf_last3 ~ '^[0-9]{3}$'),
  birth_date date,
  email text,
  hours numeric(5, 1),
  data jsonb not null default '{}' check (jsonb_typeof(data) = 'object'),

  -- [{ code, severity, field?, detail? }] (doc 06).
  issues jsonb not null default '[]' check (jsonb_typeof(issues) = 'array'),
  -- Nulo até o diff ser calculado.
  action public.import_row_action,
  matched_participant_id uuid,
  matched_certificate_id uuid,
  match_rule text check (match_rule in ('cpf', 'name_birth', 'name_email', 'name')),
  -- Decisão do admin sobre uma possível duplicata (doc 06).
  resolution text check (resolution in ('same_person', 'different_person', 'skip')),

  primary key (batch_id, row_number),
  check ((cpf_hash is null) = (cpf_last3 is null))
);

create index import_rows_batch_action_idx on public.import_rows (batch_id, action);

alter table public.import_rows enable row level security;

create policy import_rows_all_editor on public.import_rows
  for all to authenticated
  using (public.authorize('editor'))
  with check (public.authorize('editor'));

-- ---------------------------------------------------------------------------
-- Poda do staging (agendada em 0013)
-- ---------------------------------------------------------------------------

-- O staging tem nome e e-mail, então não fica parado (doc 08): lote esquecido
-- expira em 24 horas, e lote aplicado perde as linhas em 7 dias. O descarte
-- apaga na hora, pela action; a poda cobre o que escapou. Devolve quantas
-- linhas saíram.
create function public.prune_import_staging()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  removidas integer;
begin
  update public.import_batches
     set status = 'expired'
   where status in ('staged', 'failed')
     and created_at < now() - interval '24 hours';

  delete from public.import_rows r
   using public.import_batches b
   where r.batch_id = b.id
     and (
       b.status in ('expired', 'discarded')
       or (b.status = 'applied' and b.applied_at < now() - interval '7 days')
     );
  get diagnostics removidas = row_count;

  return removidas;
end;
$$;

-- Rotina de manutenção roda pelo `pg_cron`, e por mais ninguém.
revoke execute on function public.prune_import_staging() from anon, authenticated, public;
