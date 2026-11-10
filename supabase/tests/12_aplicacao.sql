-- Aplicação da importação (doc 06, ADR-0011): `apply_import`.
--
-- Uma transação, com lock por evento, recálculo do diff e conferência do
-- digest. Erro no meio não deixa o banco pela metade.

begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

insert into eventos.events (id, slug, title, starts_at, certificates_released_at) values
  ('e0000000-0000-4000-8000-0000000000a1', 'aplicacao', 'Aplicação', now(), null),
  ('e0000000-0000-4000-8000-0000000000a2', 'aplicacao-liberado', 'Aplicação liberado', now(), now());
insert into eventos.participation_types (id, event_id, slug, label, default_hours) values
  ('70000000-0000-4000-8000-0000000000a1', 'e0000000-0000-4000-8000-0000000000a1', 'participante', 'Participante', 8),
  ('70000000-0000-4000-8000-0000000000a2', 'e0000000-0000-4000-8000-0000000000a2', 'participante', 'Participante', 3);

insert into eventos.participants (id, event_id, full_name, cpf_hash, cpf_last3, birth_date, email) values
  ('a0000000-0000-4000-8000-0000000000a1', 'e0000000-0000-4000-8000-0000000000a1',
   'José Gonçalves de Assunção', repeat('1', 64), '725', null, 'jose@exemplo.org'),
  ('a0000000-0000-4000-8000-0000000000a2', 'e0000000-0000-4000-8000-0000000000a1',
   'Maria Atual', null, null, '2001-02-03', null);
insert into eventos.certificates (id, event_id, participant_id, participation_type_id, hours, data) values
  ('c0000000-0000-4000-8000-0000000000a1', 'e0000000-0000-4000-8000-0000000000a1',
   'a0000000-0000-4000-8000-0000000000a1', '70000000-0000-4000-8000-0000000000a1', 8, '{}'),
  ('c0000000-0000-4000-8000-0000000000a2', 'e0000000-0000-4000-8000-0000000000a1',
   'a0000000-0000-4000-8000-0000000000a2', '70000000-0000-4000-8000-0000000000a1', 8, '{"turma": "A"}');

-- Monta um lote de tipo único com as linhas dadas e devolve o id.
create function pg_temp.lote(evento uuid, tipo uuid, linhas jsonb)
returns uuid language plpgsql as $$
declare
  id uuid := gen_random_uuid();
begin
  insert into eventos.import_batches (id, event_id, participation_type_id) values (id, evento, tipo);
  insert into eventos.import_rows (batch_id, row_number, participation_type_id, full_name, cpf_hash,
    cpf_last3, birth_date, email, hours, data, data_defaults, issues)
  select id, (l->>'n')::int, tipo, l->>'nome', l->>'cpf',
         case when l ? 'cpf' then right(l->>'n', 1) || '00' end,
         (l->>'nasc')::date, l->>'email', (l->>'horas')::numeric,
         coalesce(l->'dados', '{}'), coalesce(l->'padroes', '{}'), coalesce(l->'problemas', '[]')
    from jsonb_array_elements(linhas) l;
  return id;
end;
$$;

select pg_temp.lote('e0000000-0000-4000-8000-0000000000a1', '70000000-0000-4000-8000-0000000000a1', $$[
  {"n": 2, "nome": "José Gonçalves de Assunção", "cpf": "1111111111111111111111111111111111111111111111111111111111111111",
   "email": "novo@exemplo.org"},
  {"n": 3, "nome": "Nova Pessoa", "cpf": "3333333333333333333333333333333333333333333333333333333333333333",
   "padroes": {"turma": "Turma única"}},
  {"n": 4, "nome": "Outra Pessoa", "cpf": "4444444444444444444444444444444444444444444444444444444444444444",
   "horas": 4.5, "dados": {"turma": "B"}, "padroes": {"turma": "Turma única"}},
  {"n": 5, "nome": "Linha Com Erro",
   "problemas": [{"code": "EMAIL_INVALID", "severity": "error", "detail": "E-mail inválido."}]},
  {"n": 6, "nome": "Maria Atual", "nasc": "2001-02-03", "padroes": {"turma": "Turma única"}}
]$$::jsonb) as lote \gset

select eventos.compute_import_diff(:'lote');
select preview_digest as digest from eventos.import_batches where id = :'lote' \gset

-- ---------------------------------------------------------------------------
-- Prévia velha: nada é escrito
-- ---------------------------------------------------------------------------

select is(eventos.apply_import(:'lote', repeat('0', 64), null)->>'status', 'preview_stale',
  'digest diferente do que o admin viu: preview_stale');
select is((select count(*)::int from eventos.participants where event_id = 'e0000000-0000-4000-8000-0000000000a1'), 2,
  'e nenhuma pessoa nova foi gravada');
select is((select status::text from eventos.import_batches where id = :'lote'), 'staged',
  'o lote continua em prévia');

-- ---------------------------------------------------------------------------
-- Aplicação feliz
-- ---------------------------------------------------------------------------

select is(eventos.apply_import(:'lote', :'digest', null)->>'status', 'applied', 'digest certo: aplica');
select is((select row(status, applied_at is not null)::text from eventos.import_batches where id = :'lote'),
  '(applied,t)', 'o lote fica aplicado, com a data');

select is((select count(*)::int from eventos.participants
            where event_id = 'e0000000-0000-4000-8000-0000000000a1' and created_by_batch_id = :'lote'), 2,
  'duas pessoas novas, marcadas com o lote');
select is((select row(c.hours, c.data, c.sequence_number)::text from eventos.certificates c
             join eventos.participants p on p.id = c.participant_id where p.full_name = 'Nova Pessoa'),
  '(8.0,"{""turma"": ""Turma única""}",3)',
  'sem horas na planilha vale a do tipo; campo vazio recebe o padrão do modelo, no certificado novo');
select is((select row(c.hours, c.data, c.sequence_number)::text from eventos.certificates c
             join eventos.participants p on p.id = c.participant_id where p.full_name = 'Outra Pessoa'),
  '(4.5,"{""turma"": ""B""}",4)', 'o valor da planilha vence o padrão, e a numeração segue a ordem do arquivo');
select ok((select bool_and(issued_at is null) from eventos.certificates where created_by_batch_id = :'lote'),
  'evento ainda não liberado: os certificados nascem sem issued_at');

select is((select email from eventos.participants where id = 'a0000000-0000-4000-8000-0000000000a1'),
  'novo@exemplo.org', 'quem já existia recebe o e-mail que veio preenchido');
select is((select version from eventos.certificates where id = 'c0000000-0000-4000-8000-0000000000a1'), 1,
  'mudar o e-mail não muda o que o certificado afirma: a versão fica');
select is((select data from eventos.certificates where id = 'c0000000-0000-4000-8000-0000000000a2'),
  '{"turma": "A"}'::jsonb, 'célula vazia não apaga, e o padrão não entra em certificado que já existia');
select ok(not exists (select 1 from eventos.participants where full_name = 'Linha Com Erro'),
  'linha com erro é ignorada');

select is((select count(*)::int from eventos.audit_logs where action = 'import.apply' and entity_id = :'lote'), 1,
  'a aplicação vai para a auditoria');
select ok((select diff::text !~ '(Nova Pessoa|Outra Pessoa|José)' from eventos.audit_logs
            where action = 'import.apply' and entity_id = :'lote'),
  'com contadores, sem nomes');

select is(eventos.apply_import(:'lote', :'digest', null)->>'status', 'not_staged',
  'aplicar de novo o mesmo lote não faz nada');

-- Idempotência: o mesmo arquivo de novo, em outro lote.
select pg_temp.lote('e0000000-0000-4000-8000-0000000000a1', '70000000-0000-4000-8000-0000000000a1', $$[
  {"n": 2, "nome": "José Gonçalves de Assunção", "cpf": "1111111111111111111111111111111111111111111111111111111111111111",
   "email": "novo@exemplo.org"},
  {"n": 3, "nome": "Nova Pessoa", "cpf": "3333333333333333333333333333333333333333333333333333333333333333",
   "padroes": {"turma": "Turma única"}},
  {"n": 4, "nome": "Outra Pessoa", "cpf": "4444444444444444444444444444444444444444444444444444444444444444",
   "horas": 4.5, "dados": {"turma": "B"}, "padroes": {"turma": "Turma única"}},
  {"n": 6, "nome": "Maria Atual", "nasc": "2001-02-03", "padroes": {"turma": "Turma única"}}
]$$::jsonb) as lote_2 \gset
select is((select row((r->>'create')::int, (r->>'update')::int, (r->>'unchanged')::int)::text
             from eventos.compute_import_diff(:'lote_2') r),
  '(0,0,4)', 'reimportar o mesmo arquivo: 0 a criar, 0 a atualizar');

-- ---------------------------------------------------------------------------
-- Decisão pendente e evento liberado
-- ---------------------------------------------------------------------------

select pg_temp.lote('e0000000-0000-4000-8000-0000000000a1', '70000000-0000-4000-8000-0000000000a1', $$[
  {"n": 2, "nome": "Maria Atualizada", "nasc": "2001-02-03"}
]$$::jsonb) as lote_3 \gset
select eventos.compute_import_diff(:'lote_3');
select preview_digest as digest_3 from eventos.import_batches where id = :'lote_3' \gset
select is(eventos.apply_import(:'lote_3', :'digest_3', null)->>'status', 'decisions_pending',
  'possível duplicata sem decisão bloqueia a aplicação');

select pg_temp.lote('e0000000-0000-4000-8000-0000000000a2', '70000000-0000-4000-8000-0000000000a2', $$[
  {"n": 2, "nome": "Pessoa do Evento Liberado"}
]$$::jsonb) as lote_4 \gset
select eventos.compute_import_diff(:'lote_4');
select preview_digest as digest_4 from eventos.import_batches where id = :'lote_4' \gset
select is(eventos.apply_import(:'lote_4', :'digest_4', null)->>'status', 'applied', 'aplica no evento liberado');
select ok((select issued_at is not null and hours = 3 from eventos.certificates where created_by_batch_id = :'lote_4'),
  'evento já liberado: o certificado criado depois nasce emitido');

-- ---------------------------------------------------------------------------
-- Atomicidade (CSV-I4 no banco): o código colide na terceira chamada
-- ---------------------------------------------------------------------------

create temporary sequence chamadas;
create or replace function eventos.generate_certificate_code()
returns text language sql volatile set search_path = '' as $$
  select case when nextval('pg_temp.chamadas') = 3
              then (select code from eventos.certificates limit 1)
              else upper(substr(md5(random()::text), 1, 10)) end
$$;

select pg_temp.lote('e0000000-0000-4000-8000-0000000000a1', '70000000-0000-4000-8000-0000000000a1', $$[
  {"n": 2, "nome": "Primeira Nova", "cpf": "5555555555555555555555555555555555555555555555555555555555555555"},
  {"n": 3, "nome": "Segunda Nova", "cpf": "6666666666666666666666666666666666666666666666666666666666666666"},
  {"n": 4, "nome": "Terceira Nova", "cpf": "7777777777777777777777777777777777777777777777777777777777777777"},
  {"n": 5, "nome": "Quarta Nova", "cpf": "8888888888888888888888888888888888888888888888888888888888888888"}
]$$::jsonb) as lote_5 \gset
select eventos.compute_import_diff(:'lote_5');
select preview_digest as digest_5 from eventos.import_batches where id = :'lote_5' \gset
select participantes_antes from (select count(*) as participantes_antes from eventos.participants) x \gset

select is(eventos.apply_import(:'lote_5', :'digest_5', null)->>'status', 'failed',
  'colisão no meio da aplicação: falha');
select is((select count(*) from eventos.participants), :'participantes_antes'::bigint,
  'nenhuma pessoa nova ficou: as que entraram antes da colisão foram desfeitas');
select is((select count(*)::int from eventos.certificates where created_by_batch_id = :'lote_5'), 0,
  'nenhum certificado do lote ficou');
select is((select row(status, error_message is not null)::text from eventos.import_batches where id = :'lote_5'),
  '(failed,t)', 'o lote fica failed, com a mensagem');

select ok(
  not has_function_privilege('anon', 'eventos.apply_import(uuid, text, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'eventos.apply_import(uuid, text, uuid)', 'execute'),
  'a aplicação só roda pelo servidor, depois do defineAction');

select * from finish();
rollback;
