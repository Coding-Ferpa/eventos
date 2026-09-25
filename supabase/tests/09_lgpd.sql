-- Eliminação a pedido do titular e minimização por prazo (docs 04 e 08).
--
-- A eliminação deixa uma lápide: o código continua respondendo algo honesto
-- na validação ("removido a pedido do titular"), sem nenhum dado pessoal.

begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into public.events (id, slug, title, starts_at, ends_at) values
  ('e0000000-0000-4000-8000-000000000001', 'evento-atual', 'Evento atual', now(), now()),
  ('e0000000-0000-4000-8000-000000000002', 'evento-antigo', 'Evento antigo',
   now() - interval '6 years', now() - interval '6 years');
insert into public.participation_types (id, event_id, slug, label, default_hours) values
  ('70000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'participante', 'Participante', 8),
  ('70000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'palestrante', 'Palestrante', 2),
  ('70000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000002', 'participante', 'Participante', 8);

-- A pessoa que pede para sair, com dois certificados (um revogado), um pedido
-- de correção, uma linha de staging e três entradas de auditoria.
insert into public.participants (id, event_id, full_name, cpf_hash, cpf_last3, birth_date, email) values
  ('90000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001',
   'Pessoa Que Sai', repeat('a', 64), '145', '2005-03-10', 'sai@example.com'),
  ('90000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001',
   'Pessoa Que Fica', null, null, null, 'fica@example.com'),
  ('90000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000002',
   'Pessoa Antiga', repeat('b', 64), '321', '1999-01-01', 'antiga@example.com');
insert into public.certificates (id, event_id, participant_id, participation_type_id, data) values
  ('c0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001',
   '90000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', '{"turma": "3B"}'),
  ('c0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001',
   '90000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000002', '{}'),
  ('c0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000001',
   '90000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000001', '{}'),
  ('c0000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-000000000002',
   '90000000-0000-4000-8000-000000000003', '70000000-0000-4000-8000-000000000003', '{}');
update public.certificates
   set status = 'revoked', revoked_at = now(), revoked_reason = 'Emitido com o nome da Pessoa Que Sai errado.'
 where id = 'c0000000-0000-4000-8000-000000000002';

insert into public.name_correction_requests (id, certificate_id, current_name, requested_name, contact) values
  ('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
   'Pessoa Que Sai', 'Pessoa Que Sai Silva', 'sai@example.com');
insert into public.import_batches (id, event_id) values
  ('b0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001');
insert into public.import_rows (batch_id, row_number, full_name, matched_participant_id) values
  ('b0000000-0000-4000-8000-000000000001', 2, 'Pessoa Que Sai', '90000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000001', 3, 'Pessoa Que Fica', '90000000-0000-4000-8000-000000000002');
insert into public.audit_logs (action, entity, entity_id, diff) values
  ('participant.update', 'participants', '90000000-0000-4000-8000-000000000001', '{"full_name": ["Pessoa", "Pessoa Que Sai"]}'),
  ('certificate.revoke', 'certificates', 'c0000000-0000-4000-8000-000000000002', '{"reason": "com o nome da Pessoa Que Sai"}'),
  ('correction.request', 'name_correction_requests', 'd0000000-0000-4000-8000-000000000001', '{"requested_name": "Pessoa Que Sai Silva"}'),
  ('participant.update', 'participants', '90000000-0000-4000-8000-000000000002', '{"full_name": ["Pessoa", "Pessoa Que Fica"]}');

create temporary table codigos_antes on commit drop as
  select id, code from public.certificates where participant_id = '90000000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- Eliminação
-- ---------------------------------------------------------------------------

select is(public.erase_participant('90000000-0000-4000-8000-000000000001'), 2,
  'a eliminação devolve quantos certificados viraram lápide');

select is(
  (select count(*) from public.participants where id = '90000000-0000-4000-8000-000000000001'),
  0::bigint, 'a pessoa sai do banco');
select is(
  (select array_agg(distinct status) from public.certificates
    where id in ('c0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002')),
  array['erased'::public.certificate_status], 'os dois certificados viram lápide, inclusive o revogado');
select is(
  (select count(*) from public.certificates c join codigos_antes a using (id) where c.code = a.code),
  2::bigint, 'o código fica: o papel que já circula responde "removido a pedido do titular"');
select is(
  (select count(*) from public.certificates
    where id in ('c0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002')
      and participant_id is null and data = '{}' and revoked_at is null and revoked_reason is null),
  2::bigint, 'a lápide não guarda pessoa, conteúdo nem motivo de revogação, que pode citar o nome');
select is(
  (select count(*) from public.name_correction_requests where id = 'd0000000-0000-4000-8000-000000000001'),
  0::bigint, 'o pedido de correção sai: ele tem nome e contato');
select is(
  (select count(*) from public.import_rows where matched_participant_id = '90000000-0000-4000-8000-000000000001'),
  0::bigint, 'a linha de staging da pessoa sai');
select is(
  (select count(*) from public.audit_logs where diff = '{"scrubbed": true}'),
  3::bigint, 'as três entradas de auditoria que citam a pessoa são raspadas');
select is(
  (select diff from public.audit_logs where entity_id = '90000000-0000-4000-8000-000000000002'),
  '{"full_name": ["Pessoa", "Pessoa Que Fica"]}'::jsonb, 'a auditoria de outra pessoa fica intacta');
select is(
  (select count(*) from public.audit_logs), 4::bigint,
  'nenhuma entrada de auditoria é apagada: só o conteúdo pessoal sai');

-- O que não pode ser tocado.
select is(
  (select row(status, participant_id)::text from public.certificates where id = 'c0000000-0000-4000-8000-000000000003'),
  '(active,90000000-0000-4000-8000-000000000002)', 'o certificado de outra pessoa fica intacto');
select is(
  (select count(*) from public.import_rows where matched_participant_id = '90000000-0000-4000-8000-000000000002'),
  1::bigint, 'a linha de staging de outra pessoa fica');
select is(
  (select array_agg(sequence_number order by sequence_number) from public.certificates
    where event_id = 'e0000000-0000-4000-8000-000000000001'),
  array[1, 2, 3], 'a numeração do evento não abre buraco nem se reorganiza');

select throws_ok(
  $$ select public.erase_participant('90000000-0000-4000-8000-000000000001') $$,
  'P0002', null, 'eliminar quem não existe é erro, e não sucesso silencioso');

-- ---------------------------------------------------------------------------
-- Minimização por prazo
-- ---------------------------------------------------------------------------

select is(public.minimize_old_participants(), 1, 'cinco anos depois do evento, os dados de busca saem');
select is(
  (select row(cpf_hash, cpf_last3, birth_date, email)::text from public.participants
    where id = '90000000-0000-4000-8000-000000000003'),
  '(,,,)', 'CPF, nascimento e e-mail do evento antigo ficam nulos');
select is(
  (select full_name from public.participants where id = '90000000-0000-4000-8000-000000000003'),
  'Pessoa Antiga', 'o nome fica: ele é o que o certificado afirma');
select is(
  (select email from public.participants where id = '90000000-0000-4000-8000-000000000002'),
  'fica@example.com', 'evento recente não é tocado');
select is(public.minimize_old_participants(), 0, 'rodar de novo não acha mais nada');

-- ---------------------------------------------------------------------------
-- Acesso
-- ---------------------------------------------------------------------------

select ok(
  not has_function_privilege('anon', 'public.erase_participant(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.erase_participant(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.minimize_old_participants()', 'execute'),
  'eliminação e minimização não são endpoint');

select * from finish();
rollback;
