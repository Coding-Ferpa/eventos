-- Conciliação da importação (doc 06, ADR-0011): `compute_import_diff`.
--
-- Um lote com um caso por linha, contra participantes que já estão no evento.
-- Os CPFs são HMACs inventados (64 hex), porque o banco nunca vê o CPF.

begin;
create extension if not exists pgtap with schema extensions;
select plan(39);

insert into eventos.events (id, slug, title, starts_at) values
  ('e0000000-0000-4000-8000-0000000000c1', 'conciliacao', 'Conciliação', now());
insert into eventos.participation_types (id, event_id, slug, label, default_hours) values
  ('70000000-0000-4000-8000-0000000000c1', 'e0000000-0000-4000-8000-0000000000c1', 'participante', 'Participante', 8),
  ('70000000-0000-4000-8000-0000000000c2', 'e0000000-0000-4000-8000-0000000000c1', 'palestrante', 'Palestrante', 2);

-- Quem já está no evento.
insert into eventos.participants (id, event_id, full_name, cpf_hash, cpf_last3, birth_date, email) values
  ('a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-0000000000c1',
   'José Gonçalves de Assunção', repeat('1', 64), '725', '1990-09-12', 'jose@exemplo.org'),
  ('a0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-0000000000c1',
   'Maria Eduarda Santos', null, null, '2001-02-03', null),
  ('a0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-0000000000c1',
   'Ana Lima', null, null, null, null),
  ('a0000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-0000000000c1',
   'Carlos Revogado', repeat('4', 64), '444', null, null),
  ('a0000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-0000000000c1',
   'Beatriz Nunes', null, null, null, 'bia@exemplo.org'),
  ('a0000000-0000-4000-8000-000000000006', 'e0000000-0000-4000-8000-0000000000c1',
   'Ricardo Prado', repeat('6', 64), '666', '1980-01-01', null),
  ('a0000000-0000-4000-8000-000000000008', 'e0000000-0000-4000-8000-0000000000c1',
   'Fora do Arquivo', null, null, null, null),
  ('a0000000-0000-4000-8000-000000000009', 'e0000000-0000-4000-8000-0000000000c1',
   'Beatriz Souza', null, null, null, 'souza@exemplo.org');

insert into eventos.certificates (id, event_id, participant_id, participation_type_id, hours, data) values
  ('c0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-0000000000c1',
   'a0000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-0000000000c1', 8, '{}'),
  ('c0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-0000000000c1',
   'a0000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-0000000000c1', 8, '{}'),
  ('c0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-0000000000c1',
   'a0000000-0000-4000-8000-000000000003', '70000000-0000-4000-8000-0000000000c1', 8, '{}'),
  ('c0000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-0000000000c1',
   'a0000000-0000-4000-8000-000000000005', '70000000-0000-4000-8000-0000000000c1', 8, '{"turma": "A"}'),
  ('c0000000-0000-4000-8000-000000000008', 'e0000000-0000-4000-8000-0000000000c1',
   'a0000000-0000-4000-8000-000000000008', '70000000-0000-4000-8000-0000000000c1', 8, '{}'),
  ('c0000000-0000-4000-8000-000000000009', 'e0000000-0000-4000-8000-0000000000c1',
   'a0000000-0000-4000-8000-000000000009', '70000000-0000-4000-8000-0000000000c1', 8, '{}');
insert into eventos.certificates (id, event_id, participant_id, participation_type_id, hours,
  status, revoked_at, revoked_reason) values
  ('c0000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-0000000000c1',
   'a0000000-0000-4000-8000-000000000004', '70000000-0000-4000-8000-0000000000c1', 8,
   'revoked', now(), 'Revogado no teste da conciliação');

-- ---------------------------------------------------------------------------
-- Lote de tipo único: uma linha por caso
-- ---------------------------------------------------------------------------

insert into eventos.import_batches (id, event_id, participation_type_id) values
  ('b0000000-0000-4000-8000-0000000000c1', 'e0000000-0000-4000-8000-0000000000c1',
   '70000000-0000-4000-8000-0000000000c1');

insert into eventos.import_rows (batch_id, row_number, participation_type_id,
  full_name, cpf_hash, cpf_last3, birth_date, email, hours, data, issues)
select 'b0000000-0000-4000-8000-0000000000c1', n, '70000000-0000-4000-8000-0000000000c1',
       nome, cpf, case when cpf is null then null else '000' end, nasc::date, mail, horas, dados::jsonb, problemas::jsonb
from (values
  -- 2: casa por CPF, nada mudou
  (2, 'José Gonçalves de Assunção', repeat('1', 64), '1990-09-12', 'jose@exemplo.org', 8.0, '{}', '[]'),
  -- 3: casa por nome e nascimento (ela não tinha CPF) e ganha o CPF
  (3, 'Maria Eduarda Santos', repeat('2', 64), '2001-02-03', null, null, '{}', '[]'),
  -- 4: casa só pelo nome: ninguém tem CPF, nascimento nem e-mail
  (4, 'Ana Lima', null, null, null, null, '{}', '[]'),
  -- 5: casa por CPF, mas o certificado foi revogado
  (5, 'Carlos Revogado', repeat('4', 64), null, null, null, '{}', '[]'),
  -- 6: casa por nome e e-mail, e o conteúdo mudou
  (6, 'Beatriz Nunes', null, null, 'bia@exemplo.org', null, '{"turma": "B"}', '[]'),
  -- 7: pessoa nova
  (7, 'Pedro Novo', repeat('7', 64), null, null, null, '{}', '[]'),
  -- 8: a mesma pessoa e o mesmo tipo da linha 2
  (8, 'Jose Goncalves de Assuncao', repeat('1', 64), null, null, null, '{}', '[]'),
  -- 9: possível duplicata (a): outro nome, mesmo e-mail
  (9, 'Bia Souza', null, null, 'souza@exemplo.org', null, '{}', '[]'),
  -- 10: mesmo nome e nascimento, mas os dois têm CPF e eles diferem: não casa
  -- pela regra 2, e vira possível duplicata (c)
  (10, 'Ricardo Prado', repeat('a', 64), '1980-01-01', null, null, '{}', '[]'),
  -- 11: o banco recusaria o nome: só partículas
  (11, 'De Da', null, null, null, null, '{}', '[]'),
  -- 12: palavra única é aviso, não erro
  (12, 'Madonna', repeat('c', 64), null, null, null, '{}', '[]'),
  -- 13: erro que veio da validação em TypeScript
  (13, 'Erro Vindo do TS', null, null, null, null, '{}',
   '[{"code": "EMAIL_INVALID", "severity": "error", "detail": "E-mail inválido."},
     {"code": "NO_SEARCHABLE_KEY", "severity": "warning", "detail": "Sem dado de busca."}]'),
  -- 14: homônimo da Ana da linha 4, com CPF: é outra pessoa
  (14, 'Ana Lima', repeat('e', 64), null, null, null, '{}', '[]'),
  -- 15: possível duplicata (b): mesmo nascimento e nome parecido
  (15, 'Maria Eduarda Santo', null, '2001-02-03', null, null, '{}', '[]'),
  -- 16: homônimo só de quem já está no banco
  (16, 'Fora do Arquivo', repeat('f', 64), null, null, null, '{}', '[]')
) as linhas (n, nome, cpf, nasc, mail, horas, dados, problemas);

select eventos.compute_import_diff('b0000000-0000-4000-8000-0000000000c1') as resumo \gset

create temporary table linha on commit drop as
  select row_number, action::text as acao, match_rule, matched_participant_id, matched_certificate_id,
         (select coalesce(jsonb_agg(p->>'code' order by p->>'code'), '[]') from jsonb_array_elements(issues || computed_issues) p) as codigos,
         computed_issues
    from eventos.import_rows where batch_id = 'b0000000-0000-4000-8000-0000000000c1';

select is((select row(acao, match_rule)::text from linha where row_number = 2), '(unchanged,cpf)',
  'CPF igual, nada mudou: inalterado');
select is((select row(acao, match_rule)::text from linha where row_number = 3), '(update,name_birth)',
  'nome e nascimento, com um dos lados sem CPF: atualiza só porque ela ganha o CPF');
select is((select row(acao, codigos ? 'HOMONYM_IN_EVENT')::text from linha where row_number = 16), '(create,t)',
  'homônimo de quem já está no banco, e de mais ninguém');
select is((select row(acao, match_rule)::text from linha where row_number = 4), '(unchanged,name)',
  'só o nome, exatamente um candidato e ninguém com chave: inalterado');
select is((select row(acao, matched_certificate_id)::text from linha where row_number = 5),
  '(skipped,c0000000-0000-4000-8000-000000000004)', 'certificado revogado não é atualizado: a linha é pulada');
select ok((select codigos ? 'CERTIFICATE_REVOKED' from linha where row_number = 5), 'com o aviso CERTIFICATE_REVOKED');
select is((select row(acao, match_rule)::text from linha where row_number = 6), '(update,name_email)',
  'nome e e-mail, conteúdo diferente: atualiza');
select is((select row(acao, matched_participant_id)::text from linha where row_number = 7), '(create,)',
  'pessoa nova: cria, sem participante casado');
select is((select acao from linha where row_number = 8), 'error', 'mesma pessoa e mesmo tipo de uma linha anterior: erro');
select is(
  (select p->>'detail' from linha, jsonb_array_elements(computed_issues) p
    where row_number = 8 and p->>'code' = 'DUPLICATE_IN_FILE'),
  'Repete a linha 2.', 'DUPLICATE_IN_FILE cita a linha original, que vale');
select is((select row(acao, matched_participant_id)::text from linha where row_number = 9),
  '(needs_decision,a0000000-0000-4000-8000-000000000009)', 'mesmo e-mail com outro nome: pede decisão, com a candidata');
select is((select row(acao, matched_participant_id)::text from linha where row_number = 10),
  '(needs_decision,a0000000-0000-4000-8000-000000000006)', 'mesmo nome com CPF diferente: pede decisão');
select is((select row(acao, matched_participant_id)::text from linha where row_number = 15),
  '(needs_decision,a0000000-0000-4000-8000-000000000002)', 'mesmo nascimento e nome parecido: pede decisão');
select ok((select codigos ? 'POSSIBLE_DUPLICATE' from linha where row_number = 9), 'com o código POSSIBLE_DUPLICATE');
select is((select acao from linha where row_number = 11), 'error', 'nome que o banco recusaria é erro na prévia, e não na aplicação');
select ok((select codigos ? 'NAME_TOO_SHORT' from linha where row_number = 11), 'com o código NAME_TOO_SHORT');
select is((select row(acao, codigos ? 'NAME_SINGLE_WORD')::text from linha where row_number = 12), '(create,t)',
  'palavra única cria, com aviso');
select is((select acao from linha where row_number = 13), 'error', 'erro da validação em TypeScript vira ação de erro');
select is((select row(acao, codigos ? 'HOMONYM_IN_EVENT')::text from linha where row_number = 14), '(create,t)',
  'homônimo com CPF é outra pessoa: cria, com aviso');
select ok((select codigos ? 'HOMONYM_IN_EVENT' from linha where row_number = 4),
  'a Ana que já estava também ganha o aviso: a busca só por nome não acha nenhuma das duas');

select is(:'resumo'::jsonb - 'warnings',
  '{"create": 4, "update": 2, "unchanged": 2, "error": 3, "needs_decision": 3, "skipped": 1,
    "new_people": 4, "absent": 1, "total": 15}'::jsonb,
  'resumo em certificados, com pessoas novas e ausentes do arquivo');
select is((:'resumo'::jsonb)->'warnings',
  '{"HOMONYM_IN_EVENT": 3, "NAME_SINGLE_WORD": 1, "CERTIFICATE_REVOKED": 1}'::jsonb,
  'avisos contados só nas linhas que vão para o banco: o da linha 13, que tem erro, fica de fora');
select ok((select preview_digest ~ '^[0-9a-f]{64}$' from eventos.import_batches
            where id = 'b0000000-0000-4000-8000-0000000000c1'), 'o digest do plano fica no lote');

-- ---------------------------------------------------------------------------
-- Recalcular é determinístico, e as decisões do admin valem
-- ---------------------------------------------------------------------------

select preview_digest as digest_1 from eventos.import_batches
 where id = 'b0000000-0000-4000-8000-0000000000c1' \gset
select eventos.compute_import_diff('b0000000-0000-4000-8000-0000000000c1');
select is((select preview_digest from eventos.import_batches where id = 'b0000000-0000-4000-8000-0000000000c1'),
  :'digest_1', 'recalcular sem mudança nenhuma dá o mesmo digest');

update eventos.import_rows set resolution = 'same_person'
 where batch_id = 'b0000000-0000-4000-8000-0000000000c1' and row_number = 9;
update eventos.import_rows set resolution = 'different_person'
 where batch_id = 'b0000000-0000-4000-8000-0000000000c1' and row_number = 10;
update eventos.import_rows set resolution = 'skip'
 where batch_id = 'b0000000-0000-4000-8000-0000000000c1' and row_number = 15;
select eventos.compute_import_diff('b0000000-0000-4000-8000-0000000000c1') as resumo_2 \gset

select is((select row(action, matched_certificate_id)::text from eventos.import_rows
            where batch_id = 'b0000000-0000-4000-8000-0000000000c1' and row_number = 9),
  '(update,c0000000-0000-4000-8000-000000000009)', '"é a mesma pessoa": casa com a candidata e atualiza o nome');
select is((select row(action, matched_participant_id)::text from eventos.import_rows
            where batch_id = 'b0000000-0000-4000-8000-0000000000c1' and row_number = 10),
  '(create,)', '"é outra pessoa": cria');
select is((select action::text from eventos.import_rows
            where batch_id = 'b0000000-0000-4000-8000-0000000000c1' and row_number = 15),
  'skipped', '"pular linha": pula');
select is((:'resumo_2'::jsonb)->>'needs_decision', '0', 'com as três decididas, nada pede decisão');
select isnt((select preview_digest from eventos.import_batches where id = 'b0000000-0000-4000-8000-0000000000c1'),
  :'digest_1', 'as decisões mudam o plano, e o digest muda junto');

-- Prévia desatualizada (CSV-I6 no banco): alguém edita a Ana entre a prévia e
-- a aplicação, e a linha dela deixa de ser inalterada.
select preview_digest as digest_2 from eventos.import_batches
 where id = 'b0000000-0000-4000-8000-0000000000c1' \gset
update eventos.participants set email = 'ana@exemplo.org' where id = 'a0000000-0000-4000-8000-000000000003';
select eventos.compute_import_diff('b0000000-0000-4000-8000-0000000000c1');
select isnt((select preview_digest from eventos.import_batches where id = 'b0000000-0000-4000-8000-0000000000c1'),
  :'digest_2', 'participante editado depois da prévia muda o digest');

-- Mais estrito que o doc 06: o digest leva também o participante casado. Alguém
-- cadastra o Pedro à mão entre a prévia e a aplicação; a linha continua
-- "criar" (agora só o certificado), e mesmo assim a prévia fica velha.
select preview_digest as digest_3 from eventos.import_batches
 where id = 'b0000000-0000-4000-8000-0000000000c1' \gset
insert into eventos.participants (event_id, full_name, cpf_hash, cpf_last3)
values ('e0000000-0000-4000-8000-0000000000c1', 'Pedro Novo', repeat('7', 64), '777');
select eventos.compute_import_diff('b0000000-0000-4000-8000-0000000000c1');
select isnt((select preview_digest from eventos.import_batches where id = 'b0000000-0000-4000-8000-0000000000c1'),
  :'digest_3', 'a mesma ação com outro participante também deixa a prévia velha');

-- ---------------------------------------------------------------------------
-- Lote com coluna de tipo: a mesma pessoa em dois tipos
-- ---------------------------------------------------------------------------

insert into eventos.import_batches (id, event_id, participation_type_id) values
  ('b0000000-0000-4000-8000-0000000000c2', 'e0000000-0000-4000-8000-0000000000c1', null);
insert into eventos.import_rows (batch_id, row_number, participation_type_id, full_name, cpf_hash, cpf_last3, birth_date, email)
values
  ('b0000000-0000-4000-8000-0000000000c2', 2, '70000000-0000-4000-8000-0000000000c2',
   'José Gonçalves de Assunção', repeat('1', 64), '725', null, 'jose.novo@exemplo.org'),
  ('b0000000-0000-4000-8000-0000000000c2', 3, '70000000-0000-4000-8000-0000000000c1',
   'Lucas Duplo', repeat('d', 64), '777', '1995-05-05', null),
  ('b0000000-0000-4000-8000-0000000000c2', 4, '70000000-0000-4000-8000-0000000000c2',
   'Lucas Duplo', null, null, '1995-05-05', null),
  -- Sem CPF e com o e-mail novo: não casa com o José do banco, mas casa com a
  -- linha 2, que casou por CPF, e herda o participante dela.
  ('b0000000-0000-4000-8000-0000000000c2', 5, '70000000-0000-4000-8000-0000000000c1',
   'José Gonçalves de Assunção', null, null, null, 'jose.novo@exemplo.org');
select eventos.compute_import_diff('b0000000-0000-4000-8000-0000000000c2') as resumo_3 \gset

select is((select row(action, matched_participant_id)::text from eventos.import_rows
            where batch_id = 'b0000000-0000-4000-8000-0000000000c2' and row_number = 2),
  '(create,a0000000-0000-4000-8000-000000000001)', 'quem já existe ganha o certificado do outro tipo');
select is((select array_agg(person_row order by row_number)::text from eventos.import_rows
            where batch_id = 'b0000000-0000-4000-8000-0000000000c2' and row_number in (3, 4)),
  '{3,3}', 'a mesma pessoa nova nos dois tipos é um grupo só, encabeçado pela primeira linha');
select is((select array_agg(action::text order by row_number)::text from eventos.import_rows
            where batch_id = 'b0000000-0000-4000-8000-0000000000c2' and row_number <= 4),
  '{create,create,create}', 'tipos diferentes não são duplicata');
select is((select row(action, matched_participant_id, match_rule)::text from eventos.import_rows
            where batch_id = 'b0000000-0000-4000-8000-0000000000c2' and row_number = 5),
  '(update,a0000000-0000-4000-8000-000000000001,cpf)',
  'linha que só casa com outra linha herda o participante dela, e atualiza o e-mail');
select is((:'resumo_3'::jsonb)->>'new_people', '1', 'uma pessoa nova, dois certificados');
select is((:'resumo_3'::jsonb)->>'absent', '0', 'ausentes só contam no modo tipo único');

-- ---------------------------------------------------------------------------
-- Desempenho, medido no M7
-- ---------------------------------------------------------------------------

-- 5.000 linhas recém-inseridas, com a estatística de import_rows ainda da
-- época em que a tabela tinha poucas linhas: sem o ANALYZE do começo da
-- função, o plano ficou quadrático, passou de 36 s e esgotou a memória da VM.
-- O limite de tempo derruba o teste antes disso.
insert into eventos.import_batches (id, event_id, participation_type_id) values
  ('b0000000-0000-4000-8000-0000000000c9', 'e0000000-0000-4000-8000-0000000000c1',
   '70000000-0000-4000-8000-0000000000c1');
insert into eventos.import_rows (batch_id, row_number, participation_type_id, full_name, cpf_hash, cpf_last3)
select 'b0000000-0000-4000-8000-0000000000c9', n + 1, '70000000-0000-4000-8000-0000000000c1',
       'Participante Numero ' || n || ' Teste', encode(sha256(n::text::bytea), 'hex'), '123'
  from generate_series(1, 5000) n;
set local statement_timeout = '20s';
select lives_ok(
  $$ select eventos.compute_import_diff('b0000000-0000-4000-8000-0000000000c9') $$,
  '5.000 linhas recém-inseridas: o diff termina dentro do limite');
reset statement_timeout;

select ok(
  not has_function_privilege('anon', 'eventos.compute_import_diff(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'eventos.compute_import_diff(uuid)', 'execute'),
  'o diff só roda pelo servidor, depois do defineAction');

select * from finish();
rollback;
