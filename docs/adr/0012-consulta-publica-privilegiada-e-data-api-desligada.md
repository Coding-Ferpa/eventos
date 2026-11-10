# ADR-0012 · Consulta pública de pessoa pelo servidor, sem policy para `anon`, e Data API desligada

- **Status:** aceita; a parte da Data API foi atualizada pelo [ADR-0018](0018-schema-proprio-no-projeto-do-cf-jobs.md): no projeto dividido com o CF Jobs, a Data API é dele, e o Eventos cumpre o mesmo objetivo ficando fora dos schemas expostos
- **Data:** 2026-09-20
- **Autores:** mantenedor e sessão de arquitetura

## Contexto
A convenção herdada diz: leitura pública com a role `anon` e RLS aplicada (`queryAsAnon`). Para o catálogo de eventos isso é perfeito. Para buscar uma pessoa, não: dar a `anon` qualquer caminho até `participants` (policy de select, ou função `security definer` executável por `anon`) cria um endpoint no PostgREST do Supabase, alcançável com a `anon key`, que é pública. Esse endpoint ficaria **fora** do nosso rate limit e da auditoria de tentativas, que são as mitigações obrigatórias contra enumeração.

## Decisão
1. `anon` e `reader` têm policy de select **apenas em `events`** (fora de `draft`). Em `participants`, `certificates` e em todas as demais tabelas, nenhuma policy para eles, e nenhuma policy de insert anônimo em tabela alguma.
2. Busca, tela de retirada, download, validação e pedido de correção são executados pelo servidor com a conexão privilegiada, **somente** através de `src/db/queries/public-lookup.ts`, **depois** do rate limit, com retorno em lista branca tipado à mão. Uma regra de lint restringe quem pode importar esse módulo, e um teste afirma que nenhum retorno contém `id`, `participant_id`, `cpf_hash`, `email` ou `birth_date`.
3. **A Data API (PostgREST) do projeto Supabase fica desligada em produção.** O app usa Drizzle para dados e supabase-js só para Auth e Storage, que não dependem dela.
4. A RLS continua habilitada e testada por pgTAP em todas as tabelas: é o que segura se a Data API for religada por engano.

## Consequências
- Positivas: não existe caminho até dado de pessoa que não passe pelo nosso rate limit; a superfície pública de dados é um arquivo, revisável em um PR; a `anon key` vazada (ela é pública) não alcança nada.
- Negativas e trade-offs aceitos: esse caminho depende de código de aplicação correto, não da RLS, por isso o confinamento por lint e o teste de projeção; diverge do padrão "tudo público passa por `anon`" do CF Jobs, e a divergência está explicada aqui; desligar a Data API é um passo manual do runbook, conferido no M9.

## Alternativas consideradas
- **Função `security definer` executável por `anon`, com o rate limit dentro dela:** a função receberia o hash do IP como parâmetro, fornecido por quem chama; um atacante que a invoque direto pelo PostgREST escolhe o próprio "IP".
- **Policy de select para `anon` filtrando por igualdade:** RLS não consegue exigir "só se você souber o nome inteiro"; qualquer `select *` listaria a tabela.
- **Manter a Data API ligada e confiar só na RLS:** funcionaria enquanto ninguém criasse uma função executável por `anon`. É uma defesa a mais por custo zero.
