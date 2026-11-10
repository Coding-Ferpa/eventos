-- 0008 · Pedidos de correção de nome (docs 04 e 07)
--
-- Existe desde a fase 1: o pedido nunca sai da plataforma, então o histórico
-- nasce inteiro. O que é fase 2 é a tela de fila; até ela existir, editar o
-- nome da pessoa aprova os pedidos pendentes na mesma transação (doc 07).
--
-- Não há policy de inserção: quem grava o pedido é a rota pública, pela
-- conexão do servidor, depois do rate limit (ADR-0012).

create table eventos.name_correction_requests (
  id uuid primary key default gen_random_uuid(),
  certificate_id uuid not null references eventos.certificates (id) on delete cascade,
  -- Foto do nome no momento do pedido: a fila mostra os dois lado a lado.
  current_name text not null,
  requested_name text not null check (char_length(btrim(requested_name)) between 3 and 120),
  -- E-mail ou telefone, como a pessoa preferir.
  contact text not null check (char_length(btrim(contact)) between 5 and 120),
  message text check (char_length(message) <= 500),

  status eventos.correction_status not null default 'pending',
  reviewed_by uuid references eventos.profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_note text check (char_length(review_note) <= 500),
  created_at timestamptz not null default now(),

  check ((status = 'pending') = (reviewed_at is null))
);

-- Um pedido aberto por certificado: o segundo clique vira "já recebemos".
create unique index name_correction_requests_one_pending_key
  on eventos.name_correction_requests (certificate_id) where status = 'pending';
create index name_correction_requests_queue_idx
  on eventos.name_correction_requests (status, created_at);

alter table eventos.name_correction_requests enable row level security;

create policy name_correction_requests_select_editor on eventos.name_correction_requests
  for select to authenticated using (eventos.authorize('editor'));
create policy name_correction_requests_update_editor on eventos.name_correction_requests
  for update to authenticated
  using (eventos.authorize('editor')) with check (eventos.authorize('editor'));
create policy name_correction_requests_delete_admin on eventos.name_correction_requests
  for delete to authenticated using (eventos.authorize('admin'));
