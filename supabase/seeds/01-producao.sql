-- Seed de produção (doc 04): o certificado sentinela e nada mais.
--
-- Nenhum dado pessoal. O participante é fictício, com nome acentuado de
-- propósito: o smoke diário (doc 12) consulta `/validar/DEM0CF2026` e procura
-- o nome no HTML, o que prova de uma vez que a página responde, que o banco
-- respondeu e que o acento chegou inteiro. A mesma consulta é a atividade de
-- banco que impede o Supabase gratuito de pausar o projeto.
--
-- O evento fica `archived`, fora do catálogo. O certificado nunca é revogado,
-- e serve também ao teste de carga do M9.
--
-- Idempotente: pode rodar de novo sem duplicar nada. Os ids são fixos para o
-- motor de certificado (M5) e o runbook (M9) poderem se referir a eles.
--
-- O modelo nasce em rascunho. Publicá-lo exige `base.pdf` no Storage, que um
-- arquivo SQL não cria; isso acontece quando o motor existir.

insert into public.events (
  id, slug, title, description_md, starts_at, ends_at,
  location_name, city, state, status, search_by_name
) values (
  '5e000000-0000-4000-8000-000000000001',
  'evento-de-demonstracao',
  'Evento de demonstração',
  'Evento fictício usado para conferir que a validação pública está no ar.',
  '2026-09-01 11:00:00+00', '2026-09-01 21:00:00+00',
  'Coding Ferpa', 'Fernandópolis', 'SP', 'archived', true
) on conflict (id) do nothing;

insert into public.certificate_templates (id, event_id, name) values (
  '5e000000-0000-4000-8000-000000000002',
  '5e000000-0000-4000-8000-000000000001',
  'Demonstração'
) on conflict (id) do nothing;

insert into public.participation_types (
  id, event_id, slug, label, default_hours, certificate_template_id
) values (
  '5e000000-0000-4000-8000-000000000003',
  '5e000000-0000-4000-8000-000000000001',
  'participante', 'Participante', 4,
  '5e000000-0000-4000-8000-000000000002'
) on conflict (id) do nothing;

insert into public.participants (id, event_id, full_name) values (
  '5e000000-0000-4000-8000-000000000004',
  '5e000000-0000-4000-8000-000000000001',
  'Participante de Demonstração'
) on conflict (id) do nothing;

-- Código fixo, que vai na variável de repositório `SMOKE_VALIDATION_CODE`.
-- Lido em voz alta: DEM0-CF2-026.
insert into public.certificates (
  id, event_id, participant_id, participation_type_id, code, issued_at
) values (
  '5e000000-0000-4000-8000-000000000005',
  '5e000000-0000-4000-8000-000000000001',
  '5e000000-0000-4000-8000-000000000004',
  '5e000000-0000-4000-8000-000000000003',
  'DEM0CF2026',
  '2026-09-02 12:00:00+00'
) on conflict (id) do nothing;
