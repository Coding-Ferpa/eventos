-- 0002 · Enums de sistema (doc 04)
--
-- Estados internos em inglês, como manda a convenção da casa; os rótulos em
-- pt-BR que o PRD usa vivem na aplicação. O `email_delivery_status` não está
-- aqui: ele nasce no M11, junto com a tabela que o usa.

-- `reader` é o papel de quem acabou de se cadastrar e não acessa nada. Existe
-- porque o login com GitHub é aberto.
create type public.user_role as enum ('admin', 'editor', 'reader');

create type public.event_status as enum (
  'draft',
  'registration_open',
  'registration_closed',
  'in_progress',
  'completed',
  'certificates_available',
  'archived'
);

create type public.search_mode as enum ('any', 'all');
create type public.template_status as enum ('draft', 'published');
create type public.art_kind as enum ('pdf', 'image');
create type public.certificate_status as enum ('active', 'revoked', 'erased');

create type public.import_status as enum (
  'staged', 'applied', 'discarded', 'failed', 'expired'
);
create type public.import_row_action as enum (
  'create', 'update', 'unchanged', 'error', 'needs_decision', 'skipped'
);

create type public.correction_status as enum ('pending', 'approved', 'rejected');

create type public.search_method as enum (
  'cpf', 'email', 'name', 'all', 'token', 'my_certificates'
);
-- `ambiguous` só existe no log: para fora ele é idêntico a `not_found` (doc 08).
create type public.search_outcome as enum (
  'found', 'not_found', 'ambiguous', 'rate_limited', 'event_unavailable'
);
create type public.download_source as enum (
  'search', 'email_link', 'my_certificates', 'admin'
);
create type public.validation_outcome as enum (
  'valid', 'revoked', 'erased', 'not_found', 'malformed'
);
