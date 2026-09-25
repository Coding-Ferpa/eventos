-- As duas funções puras que sustentam a busca e a validação (docs 04 e 05).
--
-- `normalize_person_name` é a fonte única da comparação de nomes: coluna
-- gerada, staging da importação e a busca pública chamam a mesma função, e
-- por isso o TypeScript nunca reimplementa esta regra.
--
-- `generate_certificate_code` produz o código que vai impresso e é ditado
-- por telefone: 10 símbolos Crockford, sem I, L, O e U.

begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

-- ---------------------------------------------------------------------------
-- normalize_person_name: a tabela de casos do doc 04
-- ---------------------------------------------------------------------------

select is(public.normalize_person_name('José Gonçalves de Assunção'),
  'jose goncalves assuncao', 'acentos, cedilha e partícula');
select is(public.normalize_person_name('  MARIA   EDUARDA dos Santos '),
  'maria eduarda santos', 'caixa, espaços nas pontas e no meio, partícula');
select is(public.normalize_person_name('Ana-Clara D''Ávila'),
  'ana clara davila', 'hífen vira espaço; apóstrofo some sem virar espaço');
select is(public.normalize_person_name('João e Maria'),
  'joao maria', 'o "e" entre nomes sai');
select is(public.normalize_person_name('Müller'),
  'muller', 'trema');
select is(public.normalize_person_name('de da do'),
  '', 'só partículas vira vazio, e o check de tamanho mínimo recusa');

-- Casos além da tabela, cada um guardando um erro plausível.
select is(public.normalize_person_name('Sant’Ana'),
  'santana', 'apóstrofo tipográfico, que o Excel e o celular produzem');
select is(public.normalize_person_name('Andrade Dede'),
  'andrade dede', 'partícula só sai como palavra inteira, nunca dentro de outra');
select is(public.normalize_person_name('Maria da de Souza'),
  'maria souza', 'partículas seguidas saem todas');
select is(public.normalize_person_name('Ñuñez ÝÿÇ'),
  'nunez yyc', 'o mapa cobre maiúsculas e minúsculas, independente do locale');
select is(public.normalize_person_name(null), null, 'nulo continua nulo');

-- Os critérios de aceite do R2, na forma em que o banco os responde.
select is(public.normalize_person_name('MARIA EDUARDA SANTOS'),
  public.normalize_person_name('Maria Eduarda dos Santos'),
  'R2: "MARIA EDUARDA SANTOS" encontra quem está como "Maria Eduarda dos Santos"');
select isnt(public.normalize_person_name('maria'),
  public.normalize_person_name('Maria Eduarda Santos'),
  'R2: "maria" não encontra "Maria Eduarda Santos"');

select is(
  (select provolatile from pg_proc where oid = 'public.normalize_person_name(text)'::regprocedure),
  'i', 'é imutável de verdade, o que permite usá-la em coluna gerada'
);

-- ---------------------------------------------------------------------------
-- generate_certificate_code
-- ---------------------------------------------------------------------------

create temporary table codigos on commit drop as
  select public.generate_certificate_code() as codigo from generate_series(1, 5000);

select is(
  (select count(*) from codigos where codigo !~ '^[0-9A-HJKMNP-TV-Z]{10}$'),
  0::bigint, 'todo código tem 10 símbolos do alfabeto Crockford');
select is(
  (select count(*) from codigos where codigo ~ '[ILOU]'),
  0::bigint, 'nenhum código tem I, L, O ou U, que se confundem ao ditar');
select is(
  (select count(distinct codigo) from codigos),
  5000::bigint, '5.000 códigos seguidos são todos diferentes');

-- Pega o erro clássico de mapear só parte do alfabeto (usar 4 bits em vez de
-- 5, ou deslocar o índice): com 50.000 símbolos sorteados, cada um dos 32
-- aparece com probabilidade praticamente 1.
select is(
  (select count(distinct s) from codigos, regexp_split_to_table(codigo, '') as s),
  32::bigint, 'os 32 símbolos do alfabeto aparecem');
select cmp_ok(
  (select count(*) from codigos, regexp_split_to_table(codigo, '') as s where s = 'Z'),
  '>', 1000::bigint, 'o último símbolo do alfabeto não é sub-representado');
select cmp_ok(
  (select count(*) from codigos, regexp_split_to_table(codigo, '') as s where s = '0'),
  '>', 1000::bigint, 'o primeiro também não');

select is(
  (select provolatile from pg_proc where oid = 'public.generate_certificate_code()'::regprocedure),
  'v', 'é volátil: duas chamadas na mesma linha não podem devolver o mesmo código');

select * from finish();
rollback;
