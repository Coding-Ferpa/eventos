-- 0005 · Fontes enviadas e modelos de certificado (docs 04 e 05)
--
-- As fontes curadas não moram no banco: vivem em `public/fonts/cert/` e no
-- catálogo em código. Aqui ficam só as que o admin sobe.

-- ---------------------------------------------------------------------------
-- custom_fonts
-- ---------------------------------------------------------------------------

create table public.custom_fonts (
  id uuid primary key default gen_random_uuid(),
  family text not null check (char_length(btrim(family)) between 1 and 80),
  weight smallint not null check (weight between 100 and 900 and weight % 100 = 0),
  -- Caminho no bucket privado `fonts`.
  storage_path text not null,
  sha256 text not null unique,
  -- Resultados dos dois testes feitos no upload (doc 05). Fonte que falha na
  -- ida e volta do subset é embutida inteira.
  subset_ok boolean not null,
  glyph_coverage_ok boolean not null,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.custom_fonts enable row level security;

create policy custom_fonts_select_editor on public.custom_fonts
  for select to authenticated using (public.authorize('editor'));
create policy custom_fonts_insert_editor on public.custom_fonts
  for insert to authenticated with check (public.authorize('editor'));
create policy custom_fonts_update_editor on public.custom_fonts
  for update to authenticated
  using (public.authorize('editor')) with check (public.authorize('editor'));
create policy custom_fonts_delete_admin on public.custom_fonts
  for delete to authenticated using (public.authorize('admin'));

-- ---------------------------------------------------------------------------
-- certificate_templates
-- ---------------------------------------------------------------------------

create table public.certificate_templates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  status public.template_status not null default 'draft',
  -- Incrementa a cada publicação e entra no ETag do PDF (doc 05).
  version integer not null default 0 check (version >= 0),

  art_kind public.art_kind,
  art_original_path text,
  -- O `base.pdf` canônico (ADR-0008). O teto de 3 MB existe porque a resposta
  -- de uma Vercel Function é limitada a 4,5 MB, e o PDF final é o base.pdf
  -- mais fontes em subset e texto.
  base_pdf_path text,
  base_pdf_sha256 text,
  base_pdf_size_bytes integer check (base_pdf_size_bytes between 1 and 3145728),
  -- [{ width_pt, height_pt, preview_path }], frente e, opcionalmente, verso.
  pages jsonb check (
    pages is null
    or (jsonb_typeof(pages) = 'array' and jsonb_array_length(pages) between 1 and 2)
  ),

  schema_version smallint not null default 1,
  -- Cópia de trabalho. Editar um modelo publicado mexe só aqui; os downloads
  -- em produção continuam lendo o snapshot até o próximo "Publicar".
  data_fields jsonb not null default '[]'
    check (jsonb_typeof(data_fields) = 'array' and jsonb_array_length(data_fields) <= 20),
  layout_fields jsonb not null default '[]'
    check (jsonb_typeof(layout_fields) = 'array' and jsonb_array_length(layout_fields) <= 40),
  -- Preset de mapeamento de colunas do CSV. Pertence ao modelo e é clonado
  -- com ele (ADR-0004).
  column_mapping jsonb not null default '{}' check (jsonb_typeof(column_mapping) = 'object'),

  -- Cópia imutável do que foi publicado. O motor só lê isto (doc 05).
  published_snapshot jsonb,
  published_at timestamptz,
  cloned_from_template_id uuid references public.certificate_templates (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Alvo da FK composta de `participation_types`: garante que um tipo nunca
  -- aponte para o modelo de outro evento, que é o erro que um clone mal feito
  -- produziria em silêncio.
  unique (id, event_id),

  check (
    (base_pdf_path is null) = (base_pdf_sha256 is null)
    and (base_pdf_path is null) = (base_pdf_size_bytes is null)
  ),
  check (
    (status = 'draft' and published_snapshot is null)
    or (status = 'published' and published_snapshot is not null and published_at is not null)
  )
);

create index certificate_templates_event_idx on public.certificate_templates (event_id);

create trigger certificate_templates_set_updated_at
  before update on public.certificate_templates
  for each row execute function public.set_updated_at();

-- Implementa o "só rascunho sem tipos apontando" do `deleteTemplate` (doc 07),
-- e a composição com `event_id` é a garantia de mesmo evento descrita acima.
--
-- `no action`, e não `restrict`: a checagem fica para o fim do comando. Ao
-- apagar um evento, a cascata remove modelos e tipos no mesmo comando, e com
-- `restrict` o modelo poderia sair antes do tipo que aponta para ele. Apagar o
-- modelo sozinho continua barrado do mesmo jeito.
alter table public.participation_types
  add constraint participation_types_template_fk
  foreign key (certificate_template_id, event_id)
  references public.certificate_templates (id, event_id)
  on delete no action;

alter table public.certificate_templates enable row level security;

create policy certificate_templates_select_editor on public.certificate_templates
  for select to authenticated using (public.authorize('editor'));
create policy certificate_templates_insert_editor on public.certificate_templates
  for insert to authenticated with check (public.authorize('editor'));
create policy certificate_templates_update_editor on public.certificate_templates
  for update to authenticated
  using (public.authorize('editor')) with check (public.authorize('editor'));
create policy certificate_templates_delete_admin on public.certificate_templates
  for delete to authenticated
  using (public.authorize('admin') and status = 'draft');
