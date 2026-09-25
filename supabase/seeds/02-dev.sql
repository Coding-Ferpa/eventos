-- Seed de desenvolvimento (doc 04). Nunca é aplicado em produção.
--
-- Tudo aqui é sintético: nomes fictícios com a forma dos reais (acento,
-- partícula, apóstrofo, hífen, nome longo e um par de homônimos), e-mails em
-- @example.com. Nenhum dado real de participante entra no repositório
-- (doc 12).
--
-- Duas limitações do M1, que o próprio seed vai perder:
--   - Não há CPF. O hash exige o pepper de desenvolvimento e o HMAC da
--     aplicação, que chegam no M8, quando este seed ganha os CPFs.
--   - Os modelos nascem em rascunho. O snapshot publicado tem o formato do
--     motor de certificado (doc 05), que chega no M5.

-- ---------------------------------------------------------------------------
-- Contas locais: senha `cfeventos-local`, que só existe aqui
-- ---------------------------------------------------------------------------

-- As colunas de token vão como texto vazio: a GoTrue as lê como texto não
-- nulo e falha com "Database error querying schema" se vierem nulas.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token,
  email_change, email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token
) values
  ('00000000-0000-0000-0000-000000000000', 'ad000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'admin@cfeventos.local',
   extensions.crypt('cfeventos-local', extensions.gen_salt('bf')),
   now(), now(), now(), '{"provider":"email","providers":["email"]}',
   '{"full_name":"Admin Local"}', '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'ad000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'editor@cfeventos.local',
   extensions.crypt('cfeventos-local', extensions.gen_salt('bf')),
   now(), now(), now(), '{"provider":"email","providers":["email"]}',
   '{"full_name":"Editora Local"}', '', '', '', '', '', '', '', ''),
  -- Conta sem papel: é o que todo cadastro novo recebe, e o E05 confere que
  -- ela não entra no admin.
  ('00000000-0000-0000-0000-000000000000', 'ad000000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'reader@cfeventos.local',
   extensions.crypt('cfeventos-local', extensions.gen_salt('bf')),
   now(), now(), now(), '{"provider":"email","providers":["email"]}',
   '{"full_name":"Pessoa Sem Acesso"}', '', '', '', '', '', '', '', '')
on conflict (id) do nothing;

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email), 'email', now(), now(), now()
  from auth.users u
 where u.id in ('ad000000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000002',
                'ad000000-0000-4000-8000-000000000003')
on conflict do nothing;

-- O trigger criou os perfis como `reader`; promover é ação manual.
update public.profiles set role = 'admin' where id = 'ad000000-0000-4000-8000-000000000001';
update public.profiles set role = 'editor' where id = 'ad000000-0000-4000-8000-000000000002';

-- ---------------------------------------------------------------------------
-- Três eventos, em estados diferentes
-- ---------------------------------------------------------------------------

insert into public.events (
  id, slug, title, description_md, starts_at, ends_at, location_name, city, state,
  external_url, status, search_by_name, search_by_email, search_birth_date,
  contact_email, certificates_released_at, created_by
) values
  ('de000000-0000-4000-8000-00000000e001', 'ferpa-tech-day-2026', 'Ferpa Tech Day 2026',
   'Um dia inteiro de palestras e oficinas sobre desenvolvimento, dados e carreira.',
   '2026-09-12 11:00:00+00', '2026-09-12 21:00:00+00', 'Auditório da Faculdade', 'Fernandópolis', 'SP',
   null, 'certificates_available', true, true, true,
   'contato@example.com', '2026-09-14 15:00:00+00', 'ad000000-0000-4000-8000-000000000001'),
  ('de000000-0000-4000-8000-00000000e002', 'semana-academica-2026', 'Semana Acadêmica de TI 2026',
   'Cinco noites de palestras com gente da região.',
   '2026-10-19 22:00:00+00', '2026-10-24 01:00:00+00', 'Bloco B', 'Fernandópolis', 'SP',
   'https://inscricoes.example.com/semana-academica-2026', 'registration_open', false, false, false,
   'contato@example.com', null, 'ad000000-0000-4000-8000-000000000001'),
  ('de000000-0000-4000-8000-00000000e003', 'oficina-de-git', 'Oficina de Git para iniciantes',
   'Três horas de mão na massa: commit, branch e pull request.',
   '2026-09-05 12:00:00+00', '2026-09-05 15:00:00+00', 'Laboratório 3', 'Fernandópolis', 'SP',
   null, 'completed', true, false, false,
   'contato@example.com', null, 'ad000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

insert into public.certificate_templates (id, event_id, name) values
  ('de000000-0000-4000-8000-00000000a001', 'de000000-0000-4000-8000-00000000e001', 'Participação'),
  ('de000000-0000-4000-8000-00000000a002', 'de000000-0000-4000-8000-00000000e001', 'Palestrante')
on conflict (id) do nothing;

insert into public.participation_types (id, event_id, slug, label, aliases, default_hours, certificate_template_id, sort_order) values
  ('de000000-0000-4000-8000-00000000b001', 'de000000-0000-4000-8000-00000000e001', 'participante', 'Participante',
   '{ouvinte}', 8, 'de000000-0000-4000-8000-00000000a001', 1),
  ('de000000-0000-4000-8000-00000000b002', 'de000000-0000-4000-8000-00000000e001', 'palestrante', 'Palestrante',
   '{speaker}', 2, 'de000000-0000-4000-8000-00000000a002', 2),
  ('de000000-0000-4000-8000-00000000b003', 'de000000-0000-4000-8000-00000000e001', 'organizador', 'Organizador',
   '{organizacao}', 16, 'de000000-0000-4000-8000-00000000a001', 3),
  ('de000000-0000-4000-8000-00000000b004', 'de000000-0000-4000-8000-00000000e001', 'monitor', 'Monitor',
   '{}', 12, 'de000000-0000-4000-8000-00000000a001', 4)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 40 participantes do Ferpa Tech Day
-- ---------------------------------------------------------------------------

insert into public.participants (id, event_id, full_name, birth_date, email)
select v.id::uuid, 'de000000-0000-4000-8000-00000000e001', v.nome, v.nascimento::date, v.email
from (values
  ('de000000-0000-4000-8000-000000000001', 'José Gonçalves de Assunção', '2001-04-19', 'jose.assuncao.1@example.com'),
  ('de000000-0000-4000-8000-000000000002', 'Maria Eduarda dos Santos Albuquerque Pessoa Rodrigues', '2001-06-25', 'maria.rodrigues.2@example.com'),
  ('de000000-0000-4000-8000-000000000003', 'Ana Lima', '2001-08-31', 'ana.lima.3@example.com'),
  ('de000000-0000-4000-8000-000000000004', 'Ana-Clara D''Ávila', '2001-11-06', 'ana.davila.4@example.com'),
  ('de000000-0000-4000-8000-000000000005', 'João Pedro da Silva', '2002-01-12', 'joao.silva.5@example.com'),
  ('de000000-0000-4000-8000-000000000006', 'João Pedro da Silva', '2002-03-20', 'joao.silva.6@example.com'),
  ('de000000-0000-4000-8000-000000000007', 'Bruno Souza Araújo', '2002-05-26', 'bruno.araujo.7@example.com'),
  ('de000000-0000-4000-8000-000000000008', 'Camila Ribeiro Cavalcanti', '2002-08-01', 'camila.cavalcanti.8@example.com'),
  ('de000000-0000-4000-8000-000000000009', 'Diego Cavalcanti Ribeiro', '2002-10-07', 'diego.ribeiro.9@example.com'),
  ('de000000-0000-4000-8000-000000000010', 'Eduarda Araújo Souza', '2002-12-13', 'eduarda.souza.10@example.com'),
  ('de000000-0000-4000-8000-000000000011', 'Felipe Carvalho Brandão', '2003-02-18', 'felipe.brandao.11@example.com'),
  ('de000000-0000-4000-8000-000000000012', 'Gabriela Oliveira Pereira', '2003-04-26', 'gabriela.pereira.12@example.com'),
  ('de000000-0000-4000-8000-000000000013', 'Heitor Monteiro Nogueira', '2003-07-02', 'heitor.nogueira.13@example.com'),
  ('de000000-0000-4000-8000-000000000014', 'Isabela Figueiredo Conceição', '2003-09-07', 'isabela.conceicao.14@example.com'),
  ('de000000-0000-4000-8000-000000000015', 'Larissa Conceição Figueiredo', '2003-11-13', 'larissa.figueiredo.15@example.com'),
  ('de000000-0000-4000-8000-000000000016', 'Mateus Nogueira Monteiro', '2004-01-19', 'mateus.monteiro.16@example.com'),
  ('de000000-0000-4000-8000-000000000017', 'Natália Pereira Oliveira', '2004-03-26', 'natalia.oliveira.17@example.com'),
  ('de000000-0000-4000-8000-000000000018', 'Otávio Brandão Carvalho', '2004-06-01', 'otavio.carvalho.18@example.com'),
  ('de000000-0000-4000-8000-000000000019', 'Paula Souza Araújo', '2004-08-07', 'paula.araujo.19@example.com'),
  ('de000000-0000-4000-8000-000000000020', 'Rafael Ribeiro Cavalcanti', '2004-10-13', 'rafael.cavalcanti.20@example.com'),
  ('de000000-0000-4000-8000-000000000021', 'Sofia Cavalcanti Ribeiro', '2004-12-19', 'sofia.ribeiro.21@example.com'),
  ('de000000-0000-4000-8000-000000000022', 'Thiago Araújo Souza', '2005-02-24', 'thiago.souza.22@example.com'),
  ('de000000-0000-4000-8000-000000000023', 'Valéria Carvalho Brandão', '2005-05-02', 'valeria.brandao.23@example.com'),
  ('de000000-0000-4000-8000-000000000024', 'Yasmin Oliveira Pereira', '2005-07-08', 'yasmin.pereira.24@example.com'),
  ('de000000-0000-4000-8000-000000000025', 'Bruno Monteiro Nogueira', '2005-09-13', 'bruno.nogueira.25@example.com'),
  ('de000000-0000-4000-8000-000000000026', 'Camila Figueiredo Conceição', '2005-11-19', 'camila.conceicao.26@example.com'),
  ('de000000-0000-4000-8000-000000000027', 'Diego Conceição Figueiredo', '2006-01-25', 'diego.figueiredo.27@example.com'),
  ('de000000-0000-4000-8000-000000000028', 'Eduarda Nogueira Monteiro', '2006-04-02', 'eduarda.monteiro.28@example.com'),
  ('de000000-0000-4000-8000-000000000029', 'Felipe Pereira Oliveira', '2006-06-08', 'felipe.oliveira.29@example.com'),
  ('de000000-0000-4000-8000-000000000030', 'Gabriela Brandão Carvalho', '2006-08-14', 'gabriela.carvalho.30@example.com'),
  ('de000000-0000-4000-8000-000000000031', 'Heitor Souza Araújo', '2006-10-20', 'heitor.araujo.31@example.com'),
  ('de000000-0000-4000-8000-000000000032', 'Isabela Ribeiro Cavalcanti', '2006-12-26', 'isabela.cavalcanti.32@example.com'),
  ('de000000-0000-4000-8000-000000000033', 'Larissa Cavalcanti Ribeiro', '2007-03-03', 'larissa.ribeiro.33@example.com'),
  ('de000000-0000-4000-8000-000000000034', 'Mateus Araújo Souza', '2007-05-09', 'mateus.souza.34@example.com'),
  ('de000000-0000-4000-8000-000000000035', 'Natália Carvalho Brandão', '2007-07-15', 'natalia.brandao.35@example.com'),
  ('de000000-0000-4000-8000-000000000036', 'Otávio Oliveira Pereira', '2007-09-20', 'otavio.pereira.36@example.com'),
  ('de000000-0000-4000-8000-000000000037', 'Paula Monteiro Nogueira', '2007-11-26', 'paula.nogueira.37@example.com'),
  ('de000000-0000-4000-8000-000000000038', 'Rafael Figueiredo Conceição', '2008-02-01', 'rafael.conceicao.38@example.com'),
  ('de000000-0000-4000-8000-000000000039', 'Sofia Conceição Figueiredo', '2001-04-10', 'sofia.figueiredo.39@example.com'),
  ('de000000-0000-4000-8000-000000000040', 'Thiago Nogueira Monteiro', '2001-06-16', 'thiago.monteiro.40@example.com')
) as v (id, nome, nascimento, email)
on conflict (id) do nothing;

-- Todo mundo participou. O trigger preenche a numeração e, sem carga horária
-- informada, a padrão do tipo.
insert into public.certificates (event_id, participant_id, participation_type_id, issued_at)
select p.event_id, p.id, 'de000000-0000-4000-8000-00000000b001', '2026-09-14 15:00:00+00'
  from public.participants p
 where p.event_id = 'de000000-0000-4000-8000-00000000e001'
 order by p.id
on conflict (participant_id, participation_type_id) do nothing;

-- A mesma pessoa com dois certificados, de tipos e conteúdos diferentes
-- (ADR-0004): José e Bruno palestraram, Ana Lima organizou.
insert into public.certificates (event_id, participant_id, participation_type_id, data, issued_at) values
  ('de000000-0000-4000-8000-00000000e001', 'de000000-0000-4000-8000-000000000001',
   'de000000-0000-4000-8000-00000000b002', '{"titulo_palestra": "Testes que valem a pena"}',
   '2026-09-14 15:00:00+00'),
  ('de000000-0000-4000-8000-00000000e001', 'de000000-0000-4000-8000-000000000007',
   'de000000-0000-4000-8000-00000000b002', '{"titulo_palestra": "Postgres sem medo: RLS na prática"}',
   '2026-09-14 15:00:00+00'),
  ('de000000-0000-4000-8000-00000000e001', 'de000000-0000-4000-8000-000000000003',
   'de000000-0000-4000-8000-00000000b003', '{}', '2026-09-14 15:00:00+00')
on conflict (participant_id, participation_type_id) do nothing;

-- Um terço já baixou, para o resumo do evento e o "quem ainda não baixou"
-- terem o que mostrar.
update public.certificates
   set first_downloaded_at = '2026-09-14 16:30:00+00',
       last_downloaded_at = '2026-09-14 16:30:00+00',
       download_count = 1
 where event_id = 'de000000-0000-4000-8000-00000000e001'
   and sequence_number <= 14
   and first_downloaded_at is null;

-- Um pedido de correção aberto, para a fila não nascer vazia.
insert into public.name_correction_requests (certificate_id, current_name, requested_name, contact, message)
select c.id, p.full_name, 'Ana Lima Figueiredo', 'ana.lima.3@example.com', 'Faltou o meu segundo sobrenome.'
  from public.certificates c
  join public.participants p on p.id = c.participant_id
 where p.id = 'de000000-0000-4000-8000-000000000003'
   and c.participation_type_id = 'de000000-0000-4000-8000-00000000b001'
on conflict do nothing;
