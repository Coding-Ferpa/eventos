-- 0001 · Extensões (doc 04)
--
-- O Supabase mantém extensões no schema `extensions`, que já está no
-- search_path das conexões. Só entra aqui o que o M1 usa: `pg_net` e o Vault
-- chegam no M11, com o despacho da fila de e-mail, que é o primeiro momento em
-- que o banco precisa chamar a aplicação.
--
-- `unaccent` não é usada de propósito: ela é STABLE e não serve em coluna
-- gerada sem um wrapper que mente sobre a volatilidade. A normalização de nome
-- (0006) usa um mapa explícito de `translate`, imutável de verdade.

-- `gen_random_bytes`, fonte do código de validação (0006).
create extension if not exists pgcrypto with schema extensions;

-- Similaridade de nome: só no admin, para a "possível duplicata" da importação
-- (doc 06). A busca pública nunca usa trigrama (doc 08).
create extension if not exists pg_trgm with schema extensions;

-- Agendamento dentro do banco: rollup, podas e minimização LGPD (0013).
create extension if not exists pg_cron;
