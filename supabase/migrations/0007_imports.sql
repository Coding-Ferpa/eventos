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

create table eventos.import_batches (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references eventos.events (id) on delete cascade,
  -- Nulo quando a planilha traz uma coluna de tipo e cada linha é roteada
  -- para o modelo do próprio tipo (doc 06).
  participation_type_id uuid,
  status eventos.import_status not null default 'staged',

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

  created_by uuid references eventos.profiles (id) on delete set null,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  foreign key (participation_type_id, event_id)
    references eventos.participation_types (id, event_id)
    on delete cascade,
  check ((status = 'applied') = (applied_at is not null))
);

create index import_batches_event_idx on eventos.import_batches (event_id, created_at desc);

create trigger import_batches_set_updated_at
  before update on eventos.import_batches
  for each row execute function eventos.set_updated_at();

alter table eventos.import_batches enable row level security;

create policy import_batches_all_editor on eventos.import_batches
  for all to authenticated
  using (eventos.authorize('editor'))
  with check (eventos.authorize('editor'));

-- Participante e certificado lembram de qual lote vieram: é o filtro da
-- remoção manual por lote (ADR-0007). Apagar o lote não apaga ninguém.
alter table eventos.participants
  add constraint participants_created_by_batch_fk
  foreign key (created_by_batch_id) references eventos.import_batches (id) on delete set null;

alter table eventos.certificates
  add constraint certificates_created_by_batch_fk
  foreign key (created_by_batch_id) references eventos.import_batches (id) on delete set null;

-- ---------------------------------------------------------------------------
-- import_rows
-- ---------------------------------------------------------------------------

-- Linha do arquivo já validada. Linha com erro também fica aqui, para a prévia
-- mostrar número da linha e motivo, por isso os campos de identidade não têm
-- as restrições de `participants`: o que é recusado é recusado na prévia, e
-- não aqui. A exceção é o CPF, que nunca entra em claro nem no staging.
create table eventos.import_rows (
  batch_id uuid not null references eventos.import_batches (id) on delete cascade,
  -- Linha do arquivo. A 1 é o cabeçalho e nunca vira dado.
  row_number integer not null check (row_number >= 2),
  participation_type_id uuid references eventos.participation_types (id) on delete cascade,

  full_name text,
  full_name_normalized text generated always as (eventos.normalize_person_name(full_name)) stored,
  cpf_hash text check (cpf_hash ~ '^[0-9a-f]{64}$'),
  cpf_last3 text check (cpf_last3 ~ '^[0-9]{3}$'),
  birth_date date,
  email text,
  hours numeric(5, 1),
  -- Só o que veio preenchido na planilha. O padrão do modelo fica à parte,
  -- porque vale só para o certificado novo: na atualização, célula vazia e
  -- coluna não mapeada não tocam em nada (doc 06).
  data jsonb not null default '{}' check (jsonb_typeof(data) = 'object'),
  data_defaults jsonb not null default '{}' check (jsonb_typeof(data_defaults) = 'object'),

  -- [{ code, severity, field?, detail? }] (doc 06). `issues` vem da validação
  -- em TypeScript e não muda; `computed_issues` é do diff e é refeito a cada
  -- cálculo.
  issues jsonb not null default '[]' check (jsonb_typeof(issues) = 'array'),
  computed_issues jsonb not null default '[]' check (jsonb_typeof(computed_issues) = 'array'),
  -- Primeira linha do arquivo que é a mesma pessoa (no modo vários tipos, uma
  -- pessoa nova aparece em mais de uma linha e vira um participante só).
  person_row integer,
  -- Nulo até o diff ser calculado.
  action eventos.import_row_action,
  matched_participant_id uuid,
  matched_certificate_id uuid,
  match_rule text check (match_rule in ('cpf', 'name_birth', 'name_email', 'name')),
  -- Decisão do admin sobre uma possível duplicata (doc 06).
  resolution text check (resolution in ('same_person', 'different_person', 'skip')),

  primary key (batch_id, row_number),
  check ((cpf_hash is null) = (cpf_last3 is null))
);

create index import_rows_batch_action_idx on eventos.import_rows (batch_id, action);
-- O agrupamento dentro do arquivo só compara linhas com o mesmo nome ou o
-- mesmo CPF: sem estes, 5.000 linhas seriam 12 milhões de pares.
create index import_rows_batch_name_idx on eventos.import_rows (batch_id, full_name_normalized);
create index import_rows_batch_cpf_idx on eventos.import_rows (batch_id, cpf_hash) where cpf_hash is not null;

alter table eventos.import_rows enable row level security;

create policy import_rows_all_editor on eventos.import_rows
  for all to authenticated
  using (eventos.authorize('editor'))
  with check (eventos.authorize('editor'));

-- ---------------------------------------------------------------------------
-- Conciliação (doc 06, ADR-0011)
-- ---------------------------------------------------------------------------

-- Linha com erro, venha ele da validação em TypeScript ou do diff.
create function eventos.import_row_has_error(issues jsonb, computed jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select exists (
    select 1 from jsonb_array_elements(issues || computed) p where p->>'severity' = 'error'
  )
$$;

-- A cascata do doc 06 entre duas fichas (linha e participante, ou duas linhas
-- do mesmo arquivo). Devolve a regra que casou, ou nulo. Dois CPFs diferentes
-- são duas pessoas, por definição, mesmo com nome e nascimento iguais.
create function eventos.import_same_person(
  a_nome text, a_cpf text, a_nascimento date, a_email text,
  b_nome text, b_cpf text, b_nascimento date, b_email text
)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when a_cpf is not null and b_cpf is not null then
      case when a_cpf = b_cpf then 'cpf' end
    when a_nome is null or a_nome <> b_nome then null
    when a_nascimento = b_nascimento then 'name_birth'
    when a_email = b_email then 'name_email'
    when a_cpf is null and b_cpf is null
     and a_nascimento is null and b_nascimento is null
     and a_email is null and b_email is null then 'name'
  end
$$;

-- Calcula o plano do lote contra o estado atual do evento e grava, em cada
-- linha, a ação, quem casou e por qual regra; no lote, o resumo e o digest.
-- Roda na prévia e de novo dentro do `apply_import`. Refazer do zero é
-- seguro: só a decisão do admin (`resolution`) sobrevive entre um cálculo e
-- outro.
create function eventos.compute_import_diff(p_batch uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  lote eventos.import_batches%rowtype;
  mudou integer;
  resumo jsonb;
begin
  select * into lote from eventos.import_batches where id = p_batch;
  if not found then
    raise exception 'Lote % não encontrado.', p_batch using errcode = 'P0002';
  end if;

  -- As linhas acabaram de entrar, na mesma transação, e o planejador não sabe
  -- quantas são. Medido com 5.000 linhas: sem estatística, só a cascata do
  -- passo 2 passou de 36 s, num plano quadrático; com ela, o diff inteiro
  -- levou 0,6 s. O ANALYZE enxerga as linhas da própria transação.
  analyze eventos.import_rows;

  update eventos.import_rows
     set action = null, matched_participant_id = null, matched_certificate_id = null,
         match_rule = null, person_row = row_number, computed_issues = '[]'
   where batch_id = p_batch;

  -- 1. O que depende do nome normalizado pelo banco. Uma aproximação em
  -- TypeScript deixaria passar o nome que o check de participants recusa.
  update eventos.import_rows
     set computed_issues = computed_issues || jsonb_build_array(jsonb_build_object(
           'code', 'NAME_TOO_SHORT', 'severity', 'error',
           'detail', 'O nome precisa de pelo menos 3 letras além de de, da, do, das, dos e e.'))
   where batch_id = p_batch
     and full_name is not null
     and (char_length(full_name) < 3 or char_length(full_name_normalized) < 3);
  update eventos.import_rows
     set computed_issues = computed_issues || jsonb_build_array(jsonb_build_object(
           'code', 'NAME_SINGLE_WORD', 'severity', 'warning',
           'detail', 'Nome de uma palavra só: a busca por nome exige o nome completo.'))
   where batch_id = p_batch
     and char_length(full_name_normalized) >= 3
     and position(' ' in full_name_normalized) = 0;

  -- 2. Cascata contra quem já está no evento: a primeira regra que casar.
  -- Nas regras por nome, mais de um candidato é ambíguo e não casa.
  update eventos.import_rows r
     set matched_participant_id = m.participante, match_rule = m.regra
    from (
      select r2.row_number,
             coalesce(c1.id, c2.id, c3.id, c4.id) as participante,
             case when c1.id is not null then 'cpf'
                  when c2.id is not null then 'name_birth'
                  when c3.id is not null then 'name_email'
                  when c4.id is not null then 'name' end as regra
        from eventos.import_rows r2
        left join lateral (
          select p.id from eventos.participants p
           where p.event_id = lote.event_id and p.cpf_hash = r2.cpf_hash
        ) c1 on true
        left join lateral (
          select (array_agg(p.id))[1] as id from eventos.participants p
           where p.event_id = lote.event_id
             and p.full_name_normalized = r2.full_name_normalized
             and p.birth_date = r2.birth_date
             and (p.cpf_hash is null or r2.cpf_hash is null)
          having count(*) = 1
        ) c2 on true
        left join lateral (
          select (array_agg(p.id))[1] as id from eventos.participants p
           where p.event_id = lote.event_id
             and p.full_name_normalized = r2.full_name_normalized
             and p.email = r2.email
             and (p.cpf_hash is null or r2.cpf_hash is null)
          having count(*) = 1
        ) c3 on true
        left join lateral (
          select (array_agg(p.id))[1] as id from eventos.participants p
           where p.event_id = lote.event_id
             and p.full_name_normalized = r2.full_name_normalized
             and r2.cpf_hash is null and r2.birth_date is null and r2.email is null
          having count(*) = 1
             and bool_and(p.cpf_hash is null and p.birth_date is null and p.email is null)
        ) c4 on true
       where r2.batch_id = p_batch
         and not eventos.import_row_has_error(r2.issues, r2.computed_issues)
    ) m
   where r.batch_id = p_batch and r.row_number = m.row_number and m.participante is not null;

  -- 3. A mesma pessoa em mais de uma linha (modo vários tipos): componentes
  -- conexos pela cascata, rotulados pela menor linha. Converge em poucas
  -- voltas, porque a cadeia mais longa é rara.
  loop
    update eventos.import_rows r
       set person_row = v.menor
      from (
        select b.row_number, min(a.person_row) as menor
          from eventos.import_rows a
          join eventos.import_rows b
            on b.batch_id = a.batch_id
           and b.row_number <> a.row_number
           and (b.full_name_normalized = a.full_name_normalized or b.cpf_hash = a.cpf_hash)
         where a.batch_id = p_batch
           and not eventos.import_row_has_error(a.issues, a.computed_issues)
           and not eventos.import_row_has_error(b.issues, b.computed_issues)
           and eventos.import_same_person(
                 a.full_name_normalized, a.cpf_hash, a.birth_date, a.email,
                 b.full_name_normalized, b.cpf_hash, b.birth_date, b.email) is not null
         group by b.row_number
      ) v
     where r.batch_id = p_batch and r.row_number = v.row_number and v.menor < r.person_row;
    get diagnostics mudou = row_count;
    exit when mudou = 0;
  end loop;

  -- 4. Linha do grupo que não casou sozinha herda o participante do grupo,
  -- se ele for um só.
  update eventos.import_rows r
     set matched_participant_id = g.participante, match_rule = g.regra
    from (
      select person_row,
             (array_agg(matched_participant_id order by row_number)
               filter (where matched_participant_id is not null))[1] as participante,
             (array_agg(match_rule order by row_number)
               filter (where matched_participant_id is not null))[1] as regra
        from eventos.import_rows
       where batch_id = p_batch and not eventos.import_row_has_error(issues, computed_issues)
       group by person_row
      having count(distinct matched_participant_id) = 1
    ) g
   where r.batch_id = p_batch and r.person_row = g.person_row
     and r.matched_participant_id is null
     and not eventos.import_row_has_error(r.issues, r.computed_issues);

  -- 5. Possível duplicata de quem seria criado: (a) mesmo e-mail, (b) mesmo
  -- nascimento e nome parecido, (c) mesmo nome e CPF diferente. A decisão é
  -- por pessoa: vale a da primeira linha do grupo.
  with candidatos as (
    select r.row_number, r.person_row, cand.id as candidato
      from eventos.import_rows r
      cross join lateral (
        select p.id from eventos.participants p
         where p.event_id = lote.event_id
           and ((r.email is not null and p.email = r.email)
             or (r.birth_date is not null and p.birth_date = r.birth_date
                 and extensions.similarity(p.full_name_normalized, r.full_name_normalized) >= 0.6)
             or (r.cpf_hash is not null and p.cpf_hash is not null and p.cpf_hash <> r.cpf_hash
                 and p.full_name_normalized = r.full_name_normalized))
         order by (p.email = r.email) desc nulls last,
                  extensions.similarity(p.full_name_normalized, r.full_name_normalized) desc,
                  p.id
         limit 1
      ) cand
     where r.batch_id = p_batch
       and r.matched_participant_id is null
       and not eventos.import_row_has_error(r.issues, r.computed_issues)
  ), grupos as (
    select person_row, (array_agg(candidato order by row_number))[1] as candidato
      from candidatos group by person_row
  )
  update eventos.import_rows r
     set matched_participant_id = case when raiz.resolution in ('same_person', 'skip') or raiz.resolution is null
                                       then g.candidato end,
         action = case raiz.resolution
                    when 'skip' then 'skipped'
                    when 'same_person' then null
                    when 'different_person' then null
                    else 'needs_decision' end::eventos.import_row_action,
         computed_issues = r.computed_issues || case when raiz.resolution is null then
           jsonb_build_array(jsonb_build_object(
             'code', 'POSSIBLE_DUPLICATE', 'severity', 'decision',
             'detail', case when r.row_number = g.person_row
                            then 'Pode ser alguém que já está no evento.'
                            else format('Segue a decisão da linha %s.', g.person_row) end))
           else '[]'::jsonb end
    from grupos g
    join eventos.import_rows raiz on raiz.batch_id = p_batch and raiz.row_number = g.person_row
   where r.batch_id = p_batch and r.person_row = g.person_row
     and r.matched_participant_id is null
     and not eventos.import_row_has_error(r.issues, r.computed_issues);

  -- 6. A mesma pessoa e o mesmo tipo de uma linha anterior: a primeira vale.
  update eventos.import_rows r
     set computed_issues = r.computed_issues || jsonb_build_array(jsonb_build_object(
           'code', 'DUPLICATE_IN_FILE', 'severity', 'error',
           'detail', format('Repete a linha %s.', d.primeira)))
    from (
      select row_number,
             first_value(row_number) over (
               partition by participation_type_id,
                            coalesce(matched_participant_id::text, 'linha:' || person_row)
               order by row_number) as primeira
        from eventos.import_rows
       where batch_id = p_batch and action is null
         and not eventos.import_row_has_error(issues, computed_issues)
    ) d
   where r.batch_id = p_batch and r.row_number = d.row_number and d.primeira <> d.row_number;

  -- 7. O certificado da pessoa naquele tipo, e a ação. Só o que veio
  -- preenchido é comparado: célula vazia é "sem informação".
  update eventos.import_rows r
     set matched_certificate_id = c.id
    from eventos.certificates c
   where r.batch_id = p_batch and r.action is null
     and c.participant_id = r.matched_participant_id
     and c.participation_type_id = r.participation_type_id;

  update eventos.import_rows r
     set action = x.acao::eventos.import_row_action
    from (
      select r2.row_number,
             case
               when eventos.import_row_has_error(r2.issues, r2.computed_issues) then 'error'
               when r2.matched_certificate_id is null then 'create'
               when c.status <> 'active' then 'skipped'
               when r2.full_name is distinct from p.full_name
                 or (r2.cpf_hash is not null and r2.cpf_hash is distinct from p.cpf_hash)
                 or (r2.birth_date is not null and r2.birth_date is distinct from p.birth_date)
                 or (r2.email is not null and r2.email is distinct from p.email)
                 or (r2.hours is not null and r2.hours is distinct from c.hours)
                 or exists (select 1 from jsonb_each(r2.data) d where c.data -> d.key is distinct from d.value)
               then 'update'
               else 'unchanged'
             end as acao
        from eventos.import_rows r2
        left join eventos.participants p on p.id = r2.matched_participant_id
        left join eventos.certificates c on c.id = r2.matched_certificate_id
       where r2.batch_id = p_batch and r2.action is null
    ) x
   where r.batch_id = p_batch and r.row_number = x.row_number;

  update eventos.import_rows
     set computed_issues = computed_issues || jsonb_build_array(jsonb_build_object(
           'code', 'CERTIFICATE_REVOKED', 'severity', 'warning',
           'detail', 'O certificado desta pessoa foi revogado: a linha não muda nada.'))
   where batch_id = p_batch and action = 'skipped' and matched_certificate_id is not null;

  -- 8. Homônimo: outra pessoa do evento, ou do próprio arquivo, com o mesmo
  -- nome normalizado. A busca só por nome não acharia nenhuma das duas.
  update eventos.import_rows r
     set computed_issues = r.computed_issues || jsonb_build_array(jsonb_build_object(
           'code', 'HOMONYM_IN_EVENT', 'severity', 'warning',
           'detail', 'Outra pessoa do evento tem o mesmo nome: a busca só por nome não encontra nenhuma das duas.'))
   where r.batch_id = p_batch
     and r.action in ('create', 'update', 'unchanged')
     and (exists (
            select 1 from eventos.participants p
             where p.event_id = lote.event_id
               and p.full_name_normalized = r.full_name_normalized
               and p.id is distinct from r.matched_participant_id)
       or exists (
            select 1 from eventos.import_rows o
             where o.batch_id = p_batch
               and o.action in ('create', 'update', 'unchanged')
               and o.full_name_normalized = r.full_name_normalized
               and coalesce(o.matched_participant_id::text, 'linha:' || o.person_row)
                   <> coalesce(r.matched_participant_id::text, 'linha:' || r.person_row)));

  -- 9. Resumo, em certificados, e o digest do plano: o que o admin vê é o que
  -- a aplicação confere.
  select jsonb_build_object(
           'create', count(*) filter (where action = 'create'),
           'update', count(*) filter (where action = 'update'),
           'unchanged', count(*) filter (where action = 'unchanged'),
           'error', count(*) filter (where action = 'error'),
           'needs_decision', count(*) filter (where action = 'needs_decision'),
           'skipped', count(*) filter (where action = 'skipped'),
           'new_people', count(distinct person_row)
                           filter (where action = 'create' and matched_participant_id is null),
           'total', count(*),
           'absent', case when lote.participation_type_id is null then 0 else (
             select count(*) from eventos.certificates c
              where c.event_id = lote.event_id
                and c.participation_type_id = lote.participation_type_id
                and c.status = 'active'
                and not exists (
                  select 1 from eventos.import_rows o
                   where o.batch_id = p_batch and o.matched_participant_id = c.participant_id)
           ) end,
           'warnings', (
             select coalesce(jsonb_object_agg(codigo, n), '{}') from (
               select p->>'code' as codigo, count(*) as n
                 from eventos.import_rows, jsonb_array_elements(issues || computed_issues) p
                -- Aviso em linha com erro não conta: ela nem vai para o banco.
                where batch_id = p_batch and p->>'severity' = 'warning' and action <> 'error'
                group by 1) avisos))
    into resumo
    from eventos.import_rows
   where batch_id = p_batch;

  update eventos.import_batches
     set summary = resumo,
         preview_digest = (
           select encode(sha256(convert_to(coalesce(string_agg(
                    format('%s:%s:%s:%s', row_number, action,
                           coalesce(matched_participant_id::text, ''),
                           coalesce(matched_certificate_id::text, '')),
                    E'\n' order by row_number), ''), 'UTF8')), 'hex')
             from eventos.import_rows where batch_id = p_batch)
   where id = p_batch;

  return resumo;
end;
$$;

-- Só o servidor calcula, depois do `defineAction` (doc 07).
revoke execute on function eventos.import_row_has_error(jsonb, jsonb) from anon, authenticated, public;
revoke execute on function eventos.import_same_person(text, text, date, text, text, text, date, text)
  from anon, authenticated, public;
revoke execute on function eventos.compute_import_diff(uuid) from anon, authenticated, public;

-- Aplica o lote numa transação só (doc 06). Recalcula o diff com o estado
-- atual e só escreve se o plano for o mesmo que o admin viu. Qualquer erro
-- no meio desfaz tudo o que a aplicação escreveu, e o lote fica `failed`:
-- "erro na linha 400 de 500 não deixa o banco pela metade" é propriedade do
-- desenho, e não disciplina de código.
create function eventos.apply_import(p_batch uuid, p_expected_digest text, p_actor uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  lote eventos.import_batches%rowtype;
  liberado boolean;
  resumo jsonb;
  digest text;
begin
  select * into lote from eventos.import_batches where id = p_batch;
  if not found then
    raise exception 'Lote % não encontrado.', p_batch using errcode = 'P0002';
  end if;

  -- Duas importações do mesmo evento nunca correm juntas. A segunda espera
  -- aqui e, quando entra, recalcula contra o que a primeira escreveu.
  perform pg_advisory_xact_lock(hashtext('import:' || lote.event_id::text));

  select * into lote from eventos.import_batches where id = p_batch for update;
  if lote.status <> 'staged' then
    return jsonb_build_object('status', 'not_staged', 'batch_status', lote.status);
  end if;

  resumo := eventos.compute_import_diff(p_batch);
  select preview_digest into digest from eventos.import_batches where id = p_batch;
  if digest is distinct from p_expected_digest then
    return jsonb_build_object('status', 'preview_stale', 'summary', resumo, 'digest', digest);
  end if;
  if (resumo->>'needs_decision')::integer > 0 then
    return jsonb_build_object('status', 'decisions_pending', 'summary', resumo, 'digest', digest);
  end if;

  select certificates_released_at is not null into liberado
    from eventos.events where id = lote.event_id;

  begin
    -- 1. Pessoas novas: uma por grupo, com o primeiro valor de cada campo.
    update eventos.import_rows r
       set matched_participant_id = g.novo
      from (
        select person_row, gen_random_uuid() as novo
          from eventos.import_rows
         where batch_id = p_batch and action = 'create' and matched_participant_id is null
         group by person_row
      ) g
     where r.batch_id = p_batch and r.action = 'create'
       and r.matched_participant_id is null and r.person_row = g.person_row;

    insert into eventos.participants
      (id, event_id, full_name, cpf_hash, cpf_last3, birth_date, email, created_by_batch_id)
    select r.matched_participant_id, lote.event_id,
           (array_agg(r.full_name order by r.row_number))[1],
           (array_agg(r.cpf_hash order by r.row_number) filter (where r.cpf_hash is not null))[1],
           (array_agg(r.cpf_last3 order by r.row_number) filter (where r.cpf_hash is not null))[1],
           (array_agg(r.birth_date order by r.row_number) filter (where r.birth_date is not null))[1],
           (array_agg(r.email order by r.row_number) filter (where r.email is not null))[1],
           p_batch
      from eventos.import_rows r
     where r.batch_id = p_batch and r.action = 'create'
       and not exists (select 1 from eventos.participants p where p.id = r.matched_participant_id)
     group by r.matched_participant_id;

    -- 2. Quem já existia: muda só o que veio preenchido, e o CPF só entra
    -- onde não havia (se os dois tivessem, e diferentes, nem teriam casado).
    update eventos.participants p
       set full_name = a.full_name,
           cpf_hash = coalesce(p.cpf_hash, a.cpf_hash),
           cpf_last3 = case when p.cpf_hash is null then a.cpf_last3 else p.cpf_last3 end,
           birth_date = coalesce(a.birth_date, p.birth_date),
           email = coalesce(a.email, p.email)
      from (
        select r.matched_participant_id as id,
               (array_agg(r.full_name order by r.row_number))[1] as full_name,
               (array_agg(r.cpf_hash order by r.row_number) filter (where r.cpf_hash is not null))[1] as cpf_hash,
               (array_agg(r.cpf_last3 order by r.row_number) filter (where r.cpf_hash is not null))[1] as cpf_last3,
               (array_agg(r.birth_date order by r.row_number) filter (where r.birth_date is not null))[1] as birth_date,
               (array_agg(r.email order by r.row_number) filter (where r.email is not null))[1] as email
          from eventos.import_rows r
         where r.batch_id = p_batch and r.action in ('create', 'update')
         group by r.matched_participant_id
      ) a
     where p.id = a.id
       and p.created_by_batch_id is distinct from p_batch
       and (p.full_name is distinct from a.full_name
         or (p.cpf_hash is null and a.cpf_hash is not null)
         or (a.birth_date is not null and a.birth_date is distinct from p.birth_date)
         or (a.email is not null and a.email is distinct from p.email));

    -- 3. Certificados novos, na ordem do arquivo: a numeração segue a
    -- planilha. Sem horas, o trigger usa a do tipo; o padrão do modelo só
    -- entra aqui.
    insert into eventos.certificates
      (event_id, participant_id, participation_type_id, hours, data, created_by_batch_id, issued_at)
    select lote.event_id, r.matched_participant_id, r.participation_type_id, r.hours,
           r.data_defaults || r.data, p_batch, case when liberado then now() end
      from eventos.import_rows r
     where r.batch_id = p_batch and r.action = 'create'
     order by r.row_number;

    -- 4. Certificados que já existiam: só o que veio preenchido. O trigger
    -- sobe a versão quando horas ou conteúdo mudam.
    update eventos.certificates c
       set hours = coalesce(r.hours, c.hours),
           data = c.data || r.data
      from eventos.import_rows r
     where r.batch_id = p_batch and r.action = 'update'
       and c.id = r.matched_certificate_id
       and ((r.hours is not null and r.hours is distinct from c.hours)
         or exists (select 1 from jsonb_each(r.data) d where c.data -> d.key is distinct from d.value));

    update eventos.import_batches
       set status = 'applied', applied_at = now(), summary = resumo
     where id = p_batch;

    -- Contadores, sem linhas e sem nomes (doc 07).
    insert into eventos.audit_logs (actor_id, action, entity, entity_id, diff)
    values (p_actor, 'import.apply', 'import_batches', p_batch, resumo);
  exception when others then
    -- O bloco já foi desfeito inteiro. Fica só o registro da falha, sem o
    -- detalhe do erro, que pode citar valores da linha.
    update eventos.import_batches
       set status = 'failed', error_message = left(sqlerrm, 500)
     where id = p_batch;
    return jsonb_build_object('status', 'failed', 'summary', resumo, 'error', sqlstate);
  end;

  return jsonb_build_object('status', 'applied', 'summary', resumo);
end;
$$;

revoke execute on function eventos.apply_import(uuid, text, uuid) from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- Poda do staging (agendada em 0013)
-- ---------------------------------------------------------------------------

-- O staging tem nome e e-mail, então não fica parado (doc 08): lote esquecido
-- expira em 24 horas, e lote aplicado perde as linhas em 7 dias. O descarte
-- apaga na hora, pela action; a poda cobre o que escapou. Devolve quantas
-- linhas saíram.
create function eventos.prune_import_staging()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  removidas integer;
begin
  update eventos.import_batches
     set status = 'expired'
   where status in ('staged', 'failed')
     and created_at < now() - interval '24 hours';

  delete from eventos.import_rows r
   using eventos.import_batches b
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
revoke execute on function eventos.prune_import_staging() from anon, authenticated, public;
