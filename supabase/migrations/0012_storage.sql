-- 0012 · Buckets de Storage e policies (docs 04 e 08)
--
-- O navegador do admin sobe arquivos direto para o Storage, por URL assinada
-- emitida por Server Action, porque o corpo de uma Vercel Function é limitado
-- a 4,5 MB e uma arte de certificado passa disso (doc 02). Upload por URL
-- assinada é autorizado pelo token, e não por estas policies; elas valem para
-- qualquer outro caminho e documentam a intenção.
--
-- Os tetos de tamanho do doc 08 são impostos pelo próprio Storage. O tipo é
-- conferido de novo na aplicação, pela assinatura de bytes, e não pela
-- extensão.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types, avif_autodetection)
values
  -- Capas de evento: públicas, servidas pela CDN do Storage.
  ('covers', 'covers', true, 5242880,
   array['image/jpeg', 'image/png', 'image/webp'], false),
  -- Fundo da prévia, rasterizado no navegador do admin (doc 05): a arte sem
  -- nenhum nome, alvo de 200 KB.
  ('previews', 'previews', true, 1048576,
   array['image/webp'], false),
  -- Arte original e `base.pdf`: privados, lidos pelo servidor na publicação e
  -- no download.
  ('templates', 'templates', false, 10485760,
   array['application/pdf', 'image/png', 'image/jpeg'], false),
  -- Fontes enviadas pelo admin. MIME livre de propósito: o navegador no
  -- Windows costuma mandar `application/octet-stream` para `.ttf`, e quem
  -- confere a fonte é a action, pela assinatura de bytes (doc 08).
  ('fonts', 'fonts', false, 2097152, null, false);

-- Escrita: editor, só nos quatro buckets do projeto.
create policy storage_insert_editor on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('covers', 'previews', 'templates', 'fonts')
    and public.authorize('editor')
  );

create policy storage_update_editor on storage.objects
  for update to authenticated
  using (
    bucket_id in ('covers', 'previews', 'templates', 'fonts')
    and public.authorize('editor')
  )
  with check (
    bucket_id in ('covers', 'previews', 'templates', 'fonts')
    and public.authorize('editor')
  );

create policy storage_delete_editor on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('covers', 'previews', 'templates', 'fonts')
    and public.authorize('editor')
  );

-- Leitura por sessão: só fontes, que o editor de modelo baixa para medir e
-- desenhar a prévia no navegador. Capa e prévia são públicas pela URL do
-- bucket, sem precisar de policy. A arte original e o `base.pdf` só o
-- servidor lê.
create policy storage_select_fonts_editor on storage.objects
  for select to authenticated
  using (bucket_id = 'fonts' and public.authorize('editor'));
