-- 0006 · Participantes e certificados (docs 04 e 05)
--
-- Pessoa e documento são coisas diferentes (ADR-0004): `participants` guarda
-- quem a pessoa é, `certificates` guarda o que aquele documento afirma.

-- ---------------------------------------------------------------------------
-- Normalização de nome: a fonte única da comparação
-- ---------------------------------------------------------------------------

-- Coluna gerada em `participants` e em `import_rows`, e a busca pública chama
-- esta mesma função sobre o que a pessoa digitou. O TypeScript nunca
-- reimplementa esta regra, e por isso as duas pontas não têm como divergir.
--
-- O mapa de `translate` cobre maiúsculas porque `lower()` em caractere fora do
-- ASCII depende do locale do cluster; traduzir antes de baixar a caixa torna o
-- resultado igual em qualquer banco. As partículas saem porque o aluno digita
-- "Maria Eduarda Santos" para quem está na planilha como "Maria Eduarda dos
-- Santos", e isso não afrouxa o casamento por inteiro: "maria" continua não
-- encontrando ninguém (doc 08).
create function public.normalize_person_name(raw text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(regexp_replace(
    regexp_replace(
      regexp_replace(
        lower(translate(
          -- 0. acento decomposto (NFD) vira composto, senão o mapa não o vê
          -- 1. apóstrofo some sem virar espaço: Sant'Ana e Santana casam
          replace(replace(normalize(raw, NFC), '''', ''), '’', ''),
          'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñÝýÿ',
          'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNnYyy')),
        -- 2. pontuação e hífen viram espaço
        '[^a-z0-9]+', ' ', 'g'),
      -- 3. partículas saem, só como palavra inteira
      '\m(de|da|do|das|dos|e)\M', ' ', 'g'),
    -- 4. espaços colapsam
    '\s+', ' ', 'g'))
$$;

-- ---------------------------------------------------------------------------
-- Código de validação
-- ---------------------------------------------------------------------------

-- 10 símbolos Crockford Base32, sem I, L, O e U, que se confundem ao ditar
-- (doc 05). São 50 bits do gerador criptográfico: sete bytes sorteados, dos
-- quais usamos os 50 mais baixos, cinco bits por símbolo.
--
-- Não há laço de nova tentativa: com 50 bits a chance de colisão em 100 mil
-- certificados é da ordem de 1 em 200 mil, e a unicidade da coluna transforma
-- a colisão em erro, que desfaz a transação inteira e é refeito por quem
-- chamou. Um laço aqui esconderia justamente o que o teste CSV-I4 precisa
-- provocar.
create function public.generate_certificate_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alfabeto constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  sorteio bytea := extensions.gen_random_bytes(7);
  bits bigint := 0;
  codigo text := '';
begin
  for i in 0..6 loop
    bits := (bits << 8) | get_byte(sorteio, i);
  end loop;

  for i in 1..10 loop
    codigo := substr(alfabeto, (bits & 31)::integer + 1, 1) || codigo;
    bits := bits >> 5;
  end loop;

  return codigo;
end;
$$;

-- ---------------------------------------------------------------------------
-- participants: quem a pessoa é
-- ---------------------------------------------------------------------------

-- Os únicos campos de identidade do sistema (ADR-0004): são os que a busca e
-- a conciliação usam, e o admin não cria outros. CPF nunca existe em claro,
-- só o HMAC e os três últimos dígitos (ADR-0005).
create table public.participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,

  -- A aplicação grava o nome já sem espaço nas pontas e sem espaço duplo.
  full_name text not null check (
    full_name = btrim(regexp_replace(full_name, '\s+', ' ', 'g'))
    and char_length(full_name) between 3 and 120
  ),
  full_name_normalized text generated always as (public.normalize_person_name(full_name))
    stored check (char_length(full_name_normalized) >= 3),

  cpf_hash text check (cpf_hash ~ '^[0-9a-f]{64}$'),
  cpf_last3 text check (cpf_last3 ~ '^[0-9]{3}$'),
  -- `current_date` num check não costuma ser boa ideia, porque o check não é
  -- reavaliado. Aqui é seguro: uma data que já passou continua no passado.
  birth_date date check (birth_date between '1900-01-01' and current_date),
  email text check (email = lower(btrim(email)) and char_length(email) <= 254),

  -- A FK para `import_batches` entra em 0007, com a tabela.
  created_by_batch_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Alvo da FK composta de `certificates`: certificado e pessoa sempre do
  -- mesmo evento.
  unique (id, event_id),
  check ((cpf_hash is null) = (cpf_last3 is null))
);

-- Um CPF por evento, e o caminho da busca e da conciliação por CPF.
create unique index participants_event_cpf_hash_key
  on public.participants (event_id, cpf_hash) where cpf_hash is not null;
create index participants_event_name_idx
  on public.participants (event_id, full_name_normalized);
create index participants_event_email_idx
  on public.participants (event_id, email) where email is not null;
-- Só para a "possível duplicata" da importação e a busca do admin (doc 06).
-- A busca pública nunca usa trigrama (doc 08).
create index participants_name_trgm_idx
  on public.participants using gin (full_name_normalized extensions.gin_trgm_ops);

create trigger participants_set_updated_at
  before update on public.participants
  for each row execute function public.set_updated_at();

alter table public.participants enable row level security;

create policy participants_select_editor on public.participants
  for select to authenticated using (public.authorize('editor'));
create policy participants_insert_editor on public.participants
  for insert to authenticated with check (public.authorize('editor'));
create policy participants_update_editor on public.participants
  for update to authenticated
  using (public.authorize('editor')) with check (public.authorize('editor'));
create policy participants_delete_admin on public.participants
  for delete to authenticated using (public.authorize('admin'));

-- ---------------------------------------------------------------------------
-- certificates: o que o documento afirma
-- ---------------------------------------------------------------------------

-- Alvo da FK composta abaixo: o certificado usa tipo do próprio evento.
alter table public.participation_types
  add constraint participation_types_id_event_key unique (id, event_id);

create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  -- `restrict` garante o "só apaga evento sem certificados" (doc 04).
  event_id uuid not null references public.events (id) on delete restrict,
  -- Nulo só na lápide da eliminação LGPD (check abaixo).
  participant_id uuid,
  participation_type_id uuid not null,

  -- Imutável (trigger abaixo): o papel já impresso continua validando depois
  -- de qualquer correção (armadilha 8).
  code text not null unique default public.generate_certificate_code()
    check (code ~ '^[0-9A-HJKMNP-TV-Z]{10}$'),
  -- Preenchida pelo trigger de inserção; imutável depois.
  sequence_number integer not null check (sequence_number > 0),

  -- Coluna, e não conteúdo: validação, JSON-LD, LinkedIn e dashboard dependem
  -- dela (ADR-0004). Sem valor informado, vale a padrão do tipo.
  hours numeric(5, 1) not null check (hours >= 0),
  -- Conteúdo declarado pelo modelo, validado contra as `data_fields` na
  -- escrita (doc 05).
  data jsonb not null default '{}' check (jsonb_typeof(data) = 'object'),
  version integer not null default 1 check (version >= 1),

  status public.certificate_status not null default 'active',
  issued_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text check (char_length(btrim(revoked_reason)) between 10 and 500),
  revoked_by uuid references public.profiles (id) on delete set null,

  first_downloaded_at timestamptz,
  last_downloaded_at timestamptz,
  download_count integer not null default 0 check (download_count >= 0),

  -- A FK para `import_batches` entra em 0007, com a tabela.
  created_by_batch_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (event_id, sequence_number),
  unique (participant_id, participation_type_id),

  -- Com a pessoa apagada, a coluna vira nula. Como o check abaixo só aceita
  -- nulo na lápide, apagar a pessoa de um certificado ativo falha: o único
  -- caminho até a lápide é `erase_participant` (0011).
  foreign key (participant_id, event_id)
    references public.participants (id, event_id)
    on delete set null (participant_id),
  foreign key (participation_type_id, event_id)
    references public.participation_types (id, event_id)
    on delete restrict,

  check ((status = 'erased') = (participant_id is null)),
  check ((status = 'revoked') = (revoked_at is not null)),
  check (status <> 'revoked' or revoked_reason is not null)
);

create index certificates_event_status_idx on public.certificates (event_id, status);
create index certificates_participant_idx on public.certificates (participant_id);
create index certificates_batch_idx on public.certificates (created_by_batch_id);
-- "Quem ainda não baixou" (doc 10).
create index certificates_pending_download_idx
  on public.certificates (event_id)
  where first_downloaded_at is null and status = 'active';

-- Sequência contínua por evento e carga horária padrão do tipo.
--
-- O advisory lock serializa as inserções do mesmo evento, e por isso o
-- `max + 1` não produz número repetido sob concorrência; a unicidade de
-- `(event_id, sequence_number)` fica como rede de segurança. Numa importação
-- de 500 linhas a mesma transação toma este lock 500 vezes e não espera por
-- si mesma: advisory lock é reentrante dentro da sessão.
create function public.certificates_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('certificate_sequence:' || new.event_id::text));

  select coalesce(max(sequence_number), 0) + 1
    into new.sequence_number
    from public.certificates
   where event_id = new.event_id;

  if new.hours is null then
    select default_hours into new.hours
      from public.participation_types
     where id = new.participation_type_id;
  end if;

  return new;
end;
$$;

create trigger certificates_before_insert
  before insert on public.certificates
  for each row execute function public.certificates_before_insert();

-- Código e sequência não mudam, e a versão sobe quando o que o papel afirma
-- muda (carga horária ou conteúdo). Download e revogação não são "o que o
-- papel afirma" e não mexem na versão.
create function public.certificates_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.code is distinct from old.code then
    raise exception 'O código de validação de um certificado nunca muda.'
      using hint = 'Ele pode estar impresso num papel que já foi entregue.';
  end if;

  if new.sequence_number is distinct from old.sequence_number then
    raise exception 'A numeração de um certificado nunca muda.';
  end if;

  if new.hours is distinct from old.hours or new.data is distinct from old.data then
    new.version := old.version + 1;
  end if;

  return new;
end;
$$;

create trigger certificates_before_update
  before update on public.certificates
  for each row execute function public.certificates_before_update();

create trigger certificates_set_updated_at
  before update on public.certificates
  for each row execute function public.set_updated_at();

-- Corrigir o nome muda o que todos os certificados ativos da pessoa afirmam.
-- O código fica; a versão sobe, e a página de validação mostra sempre o dado
-- atual (doc 05).
create function public.participants_bump_certificates()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.certificates
     set version = version + 1
   where participant_id = new.id
     and status = 'active';

  return new;
end;
$$;

create trigger participants_bump_certificates
  after update of full_name on public.participants
  for each row
  when (new.full_name is distinct from old.full_name)
  execute function public.participants_bump_certificates();

alter table public.certificates enable row level security;

create policy certificates_select_editor on public.certificates
  for select to authenticated using (public.authorize('editor'));
create policy certificates_insert_editor on public.certificates
  for insert to authenticated with check (public.authorize('editor'));
create policy certificates_update_editor on public.certificates
  for update to authenticated
  using (public.authorize('editor')) with check (public.authorize('editor'));
create policy certificates_delete_admin on public.certificates
  for delete to authenticated using (public.authorize('admin'));
