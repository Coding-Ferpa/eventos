-- 0006 · Participantes e certificados (docs 04 e 05)
--
-- Pessoa e documento são coisas diferentes (ADR-0004): `participants` guarda
-- quem a pessoa é, `certificates` guarda o que aquele documento afirma.

-- ---------------------------------------------------------------------------
-- Normalização de nome: a fonte única da comparação
-- ---------------------------------------------------------------------------

-- Coluna gerada em `participants` e em `import_rows`, e a busca pública chama
-- esta mesma função sobre o que a pessoa digitou. O TypeScript nunca
-- reimplementa esta regra, e por isso as duas pontas não têm como divergir.
--
-- O mapa de `translate` cobre maiúsculas porque `lower()` em caractere fora do
-- ASCII depende do locale do cluster; traduzir antes de baixar a caixa torna o
-- resultado igual em qualquer banco. As partículas saem porque o aluno digita
-- "Maria Eduarda Santos" para quem está na planilha como "Maria Eduarda dos
-- Santos", e isso não afrouxa o casamento por inteiro: "maria" continua não
-- encontrando ninguém (doc 08).
create function public.normalize_person_name(raw text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(regexp_replace(
    regexp_replace(
      regexp_replace(
        lower(translate(
          -- 1. apóstrofo some sem virar espaço: Sant'Ana e Santana casam
          replace(replace(raw, '''', ''), '’', ''),
          'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñÝýÿ',
          'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNnYyy')),
        -- 2. pontuação e hífen viram espaço
        '[^a-z0-9]+', ' ', 'g'),
      -- 3. partículas saem, só como palavra inteira
      '\m(de|da|do|das|dos|e)\M', ' ', 'g'),
    -- 4. espaços colapsam
    '\s+', ' ', 'g'))
$$;

-- ---------------------------------------------------------------------------
-- Código de validação
-- ---------------------------------------------------------------------------

-- 10 símbolos Crockford Base32, sem I, L, O e U, que se confundem ao ditar
-- (doc 05). São 50 bits do gerador criptográfico: sete bytes sorteados, dos
-- quais usamos os 50 mais baixos, cinco bits por símbolo.
--
-- Não há laço de nova tentativa: com 50 bits a chance de colisão em 100 mil
-- certificados é da ordem de 1 em 200 mil, e a unicidade da coluna transforma
-- a colisão em erro, que desfaz a transação inteira e é refeito por quem
-- chamou. Um laço aqui esconderia justamente o que o teste CSV-I4 precisa
-- provocar.
create function public.generate_certificate_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alfabeto constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  sorteio bytea := extensions.gen_random_bytes(7);
  bits bigint := 0;
  codigo text := '';
begin
  for i in 0..6 loop
    bits := (bits << 8) | get_byte(sorteio, i);
  end loop;

  for i in 1..10 loop
    codigo := substr(alfabeto, (bits & 31)::integer + 1, 1) || codigo;
    bits := bits >> 5;
  end loop;

  return codigo;
end;
$$;
