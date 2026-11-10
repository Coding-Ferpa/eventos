-- 0009 · Observabilidade, auditoria e as views do dashboard (docs 04 e 10)
--
-- Todo dado de observabilidade nasce no banco, e nenhum carrega dado pessoal:
-- nem nome, nem e-mail, nem CPF, nem o que alguém digitou numa busca. IP e
-- dispositivo entram só como HMAC diário, calculado na aplicação (doc 08).
--
-- Nenhuma destas tabelas tem policy de inserção: quem grava é o servidor,
-- pela conexão privilegiada.

-- ---------------------------------------------------------------------------
-- Logs crus
-- ---------------------------------------------------------------------------

-- Sem coluna para o valor buscado, de propósito: o que não existe não vaza.
create table eventos.search_attempts (
  id bigint generated always as identity primary key,
  -- Nulo em "meus certificados", que não é de um evento só.
  event_id uuid references eventos.events (id) on delete cascade,
  method eventos.search_method not null,
  outcome eventos.search_outcome not null,
  ip_hash text not null,
  device_hash text not null,
  occurred_at timestamptz not null default now()
);

create index search_attempts_event_time_idx on eventos.search_attempts (event_id, occurred_at);
create index search_attempts_time_brin on eventos.search_attempts using brin (occurred_at);

create table eventos.certificate_downloads (
  id bigint generated always as identity primary key,
  certificate_id uuid not null references eventos.certificates (id) on delete cascade,
  event_id uuid not null references eventos.events (id) on delete cascade,
  source eventos.download_source not null,
  certificate_version integer not null,
  device_hash text,
  occurred_at timestamptz not null default now()
);

create index certificate_downloads_event_time_idx
  on eventos.certificate_downloads (event_id, occurred_at);

create table eventos.validation_checks (
  id bigint generated always as identity primary key,
  -- Nulo quando o código não existe ou está malformado.
  certificate_id uuid references eventos.certificates (id) on delete set null,
  outcome eventos.validation_outcome not null,
  ip_hash text not null,
  occurred_at timestamptz not null default now()
);

create index validation_checks_certificate_idx on eventos.validation_checks (certificate_id);
create index validation_checks_time_brin on eventos.validation_checks using brin (occurred_at);

-- Uma linha por dispositivo e dia: é o que dá a mediana de "tempo até o
-- download" sem rastrear ninguém além do dia (doc 10). O `day` é o dia em que
-- o HMAC do dispositivo gira, calculado pela aplicação.
create table eventos.event_visits (
  event_id uuid not null references eventos.events (id) on delete cascade,
  device_hash text not null,
  day date not null,
  first_seen_at timestamptz not null default now(),
  primary key (event_id, device_hash, day)
);

-- ---------------------------------------------------------------------------
-- Agregado diário
-- ---------------------------------------------------------------------------

-- `pdf_failures` é incrementado pela rota de download no momento da falha, e o
-- rollup nunca o reescreve: não existe log cru de falha para recalcular.
create table eventos.event_stats_daily (
  event_id uuid not null references eventos.events (id) on delete cascade,
  day date not null,
  visits integer not null default 0,
  searches integer not null default 0,
  searches_not_found integer not null default 0,
  first_downloads integer not null default 0,
  downloads integer not null default 0,
  validations integer not null default 0,
  correction_requests integer not null default 0,
  pdf_failures integer not null default 0,
  primary key (event_id, day)
);

-- ---------------------------------------------------------------------------
-- Auditoria
-- ---------------------------------------------------------------------------

-- Toda mutação do admin grava aqui, na mesma transação, pelo esqueleto
-- `defineAction` (doc 07). O `diff` nunca carrega CPF (ele não existe) e, em
-- operação em massa, carrega contadores e não nomes.
create table eventos.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references eventos.profiles (id) on delete set null,
  -- `entidade.acao`: `certificate.revoke`, `import.apply`.
  action text not null check (action ~ '^[a-z][a-z_]*\.[a-z][a-z_]*$'),
  entity text not null,
  entity_id uuid,
  diff jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_entity_idx on eventos.audit_logs (entity, entity_id);
create index audit_logs_time_idx on eventos.audit_logs (created_at desc);

-- ---------------------------------------------------------------------------
-- RLS: editor e admin leem; ninguém reescreve nem apaga auditoria
-- ---------------------------------------------------------------------------

alter table eventos.search_attempts enable row level security;
alter table eventos.certificate_downloads enable row level security;
alter table eventos.validation_checks enable row level security;
alter table eventos.event_visits enable row level security;
alter table eventos.event_stats_daily enable row level security;
alter table eventos.audit_logs enable row level security;

create policy search_attempts_select_editor on eventos.search_attempts
  for select to authenticated using (eventos.authorize('editor'));
create policy certificate_downloads_select_editor on eventos.certificate_downloads
  for select to authenticated using (eventos.authorize('editor'));
create policy validation_checks_select_editor on eventos.validation_checks
  for select to authenticated using (eventos.authorize('editor'));
create policy event_visits_select_editor on eventos.event_visits
  for select to authenticated using (eventos.authorize('editor'));
create policy event_stats_daily_select_editor on eventos.event_stats_daily
  for select to authenticated using (eventos.authorize('editor'));
create policy audit_logs_select_editor on eventos.audit_logs
  for select to authenticated using (eventos.authorize('editor'));

-- ---------------------------------------------------------------------------
-- Views do dashboard
-- ---------------------------------------------------------------------------

-- `security_invoker`: a view consulta com os privilégios de quem a chama, e a
-- RLS das tabelas vale. Não há filtro por papel dentro das views: a conexão do
-- servidor não carrega JWT, e um `authorize('editor')` aqui esconderia os
-- dados justamente do dashboard. Quem fica de fora é `anon`, por revogação no
-- fim do arquivo; para `reader`, a RLS das tabelas já zera tudo.
create view eventos.v_event_summary with (security_invoker = true) as
select
  e.id as event_id,
  e.slug,
  e.title,
  e.status,
  (select count(*) from eventos.participants p where p.event_id = e.id) as participants,
  count(c.id) filter (where c.status = 'active') as certificates_active,
  count(c.id) filter (where c.status = 'active' and c.issued_at is not null) as certificates_issued,
  count(c.id) filter (
    where c.status = 'active' and c.issued_at is not null and c.first_downloaded_at is not null
  ) as certificates_downloaded,
  round(
    count(c.id) filter (
      where c.status = 'active' and c.issued_at is not null and c.first_downloaded_at is not null
    )::numeric
    / nullif(count(c.id) filter (where c.status = 'active' and c.issued_at is not null), 0),
    4
  ) as download_rate,
  (select count(*) from eventos.name_correction_requests r
     join eventos.certificates rc on rc.id = r.certificate_id
    where rc.event_id = e.id and r.status = 'pending') as pending_corrections,
  -- Busca ambígua conta como sem resultado: para a pessoa, é a mesma resposta.
  (select round(
     count(*) filter (where s.outcome in ('not_found', 'ambiguous'))::numeric
     / nullif(count(*) filter (where s.outcome <> 'rate_limited'), 0), 4)
     from eventos.search_attempts s
    where s.event_id = e.id and s.occurred_at > now() - interval '7 days') as not_found_rate_7d
from eventos.events e
left join eventos.certificates c on c.event_id = e.id
group by e.id;

create view eventos.v_admin_overview with (security_invoker = true) as
select
  (select count(*) from eventos.events) as events,
  (select count(*) from eventos.events where status = 'certificates_available') as events_available,
  (select count(*) from eventos.certificates where status = 'active' and issued_at is not null)
    as certificates_issued,
  (select round(avg(download_rate), 4) from eventos.v_event_summary where download_rate is not null)
    as average_download_rate;

-- Base da exportação "quem ainda não baixou" (doc 10). Tem nome e e-mail, e
-- por isso só existe para quem a RLS deixa ver participantes.
create view eventos.v_pending_downloads with (security_invoker = true) as
select
  c.id as certificate_id,
  c.event_id,
  c.code,
  pt.label as participation_label,
  p.full_name,
  p.email
from eventos.certificates c
join eventos.participants p on p.id = c.participant_id
join eventos.participation_types pt on pt.id = c.participation_type_id
where c.status = 'active'
  and c.issued_at is not null
  and c.first_downloaded_at is null;

-- ---------------------------------------------------------------------------
-- Rollup e poda (agendados em 0013)
-- ---------------------------------------------------------------------------

-- Consolida um dia de São Paulo em `event_stats_daily`. O dia local, e não o
-- UTC, porque o painel é lido por quem organiza, e o agendamento das 03:30
-- UTC (00:30 local) só faz sentido assim. Idempotente: rodar de novo reescreve
-- o dia. Devolve quantos eventos tiveram linha gravada.
create function eventos.rollup_event_stats(p_day date)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  gravadas integer;
begin
  with
  visitas as (
    select event_id, count(*) as n from eventos.event_visits
     where (first_seen_at at time zone 'America/Sao_Paulo')::date = p_day
     group by event_id
  ),
  buscas as (
    select event_id,
           count(*) filter (where outcome <> 'rate_limited') as n,
           count(*) filter (where outcome in ('not_found', 'ambiguous')) as sem_resultado
      from eventos.search_attempts
     where event_id is not null
       and (occurred_at at time zone 'America/Sao_Paulo')::date = p_day
     group by event_id
  ),
  primeiros as (
    select event_id, count(*) as n from eventos.certificates
     where (first_downloaded_at at time zone 'America/Sao_Paulo')::date = p_day
     group by event_id
  ),
  downloads as (
    select event_id, count(*) as n from eventos.certificate_downloads
     where (occurred_at at time zone 'America/Sao_Paulo')::date = p_day
     group by event_id
  ),
  validacoes as (
    select c.event_id, count(*) as n
      from eventos.validation_checks v
      join eventos.certificates c on c.id = v.certificate_id
     where (v.occurred_at at time zone 'America/Sao_Paulo')::date = p_day
     group by c.event_id
  ),
  correcoes as (
    select c.event_id, count(*) as n
      from eventos.name_correction_requests r
      join eventos.certificates c on c.id = r.certificate_id
     where (r.created_at at time zone 'America/Sao_Paulo')::date = p_day
     group by c.event_id
  ),
  eventos as (
    select event_id from visitas union select event_id from buscas
    union select event_id from primeiros union select event_id from downloads
    union select event_id from validacoes union select event_id from correcoes
  )
  insert into eventos.event_stats_daily as s (
    event_id, day, visits, searches, searches_not_found,
    first_downloads, downloads, validations, correction_requests
  )
  select
    e.event_id, p_day,
    coalesce(vi.n, 0), coalesce(b.n, 0), coalesce(b.sem_resultado, 0),
    coalesce(pr.n, 0), coalesce(d.n, 0), coalesce(va.n, 0), coalesce(co.n, 0)
  from eventos e
  left join visitas vi using (event_id)
  left join buscas b using (event_id)
  left join primeiros pr using (event_id)
  left join downloads d using (event_id)
  left join validacoes va using (event_id)
  left join correcoes co using (event_id)
  on conflict (event_id, day) do update set
    visits = excluded.visits,
    searches = excluded.searches,
    searches_not_found = excluded.searches_not_found,
    first_downloads = excluded.first_downloads,
    downloads = excluded.downloads,
    validations = excluded.validations,
    correction_requests = excluded.correction_requests;
  get diagnostics gravadas = row_count;

  return gravadas;
end;
$$;

-- Apaga, depois de 90 dias, o log cru de dia que já foi agregado. Dia sem
-- linha em `event_stats_daily` fica, para o rollup ainda poder recalcular.
-- Busca de "meus certificados" não é de um evento e não tem agregado: sai
-- pelo prazo. `certificate_downloads` não é podado: é o histórico de retirada
-- que a exportação usa (doc 10). Devolve quantas linhas saíram.
create function eventos.prune_observability()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  removidas integer := 0;
  n integer;
begin
  delete from eventos.search_attempts s
   where s.occurred_at < now() - interval '90 days'
     and (
       s.event_id is null
       or exists (
         select 1 from eventos.event_stats_daily d
          where d.event_id = s.event_id
            and d.day = (s.occurred_at at time zone 'America/Sao_Paulo')::date
       )
     );
  get diagnostics n = row_count;
  removidas := removidas + n;

  delete from eventos.validation_checks v
   where v.occurred_at < now() - interval '90 days'
     and (
       v.certificate_id is null
       or exists (
         select 1 from eventos.event_stats_daily d
           join eventos.certificates c on c.event_id = d.event_id
          where c.id = v.certificate_id
            and d.day = (v.occurred_at at time zone 'America/Sao_Paulo')::date
       )
     );
  get diagnostics n = row_count;
  removidas := removidas + n;

  delete from eventos.event_visits ev
   where ev.first_seen_at < now() - interval '90 days'
     and exists (
       select 1 from eventos.event_stats_daily d
        where d.event_id = ev.event_id
          and d.day = (ev.first_seen_at at time zone 'America/Sao_Paulo')::date
     );
  get diagnostics n = row_count;
  removidas := removidas + n;

  return removidas;
end;
$$;

revoke select on eventos.v_event_summary, eventos.v_admin_overview, eventos.v_pending_downloads
  from anon;

revoke execute on function eventos.rollup_event_stats(date) from anon, authenticated, public;
revoke execute on function eventos.prune_observability() from anon, authenticated, public;
