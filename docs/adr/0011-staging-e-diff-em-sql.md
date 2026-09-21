# ADR-0011 · Importação: arquivo nunca persistido, staging sem CPF em claro, diff e aplicação em SQL

- **Status:** aceita
- **Data:** 2026-09-20
- **Autores:** mantenedor e sessão de arquitetura

## Contexto
A importação tem quatro passos em requisições separadas (upload, mapeamento, prévia, aplicação). Entre eles é preciso guardar algo, e o arquivo contém CPFs em claro. A prévia tem de ser fiel: o que o admin viu é o que será aplicado, mesmo se outra pessoa mexer no evento no intervalo. A conciliação depende do nome normalizado, e a normalização de nomes tem fonte única no banco ([doc 04](../04-banco-de-dados.md)). E erro no meio não pode deixar o banco pela metade.

## Decisão
1. **O arquivo CSV nunca é gravado** (nem disco, nem Storage, nem log). Ele trafega duas vezes: na inspeção, que não grava nada, e no staging. Só sabemos qual coluna é o CPF depois do mapeamento, por isso o arquivo volta no segundo passo em vez de ficar guardado.
2. **O staging (`import_rows`) guarda linhas já validadas e normalizadas, com o CPF já em HMAC.** `full_name_normalized` é coluna gerada pela mesma função SQL de `participants`.
3. **O diff é calculado em SQL** (`compute_import_diff`), por junção entre `import_rows` e `participants`, com a cascata de conciliação. Duplicata dentro do arquivo e homônimos também são consultas de conjunto.
4. **A aplicação é uma função SQL em uma transação** (`apply_import`): `pg_advisory_xact_lock` por evento, **recálculo do diff**, comparação do digest com o da prévia que o admin viu; se divergir, nada é escrito e a prévia nova é devolvida (`preview_stale`).

A parte pura (decodificar, parsear, mapear, validar linha) fica em TypeScript, em `features/import`, com TDD.

## Consequências
- Positivas: CPF em claro só existe em memória, por milissegundos; nome normalizado tem uma implementação só, sem gêmeo em TypeScript para divergir; atomicidade e serialização por evento são propriedades do banco, não disciplina de código; 5.000 linhas são aplicadas em poucas instruções.
- Negativas e trade-offs aceitos: cerca de 150 linhas de PL/pgSQL, menos familiares a um contribuidor júnior que TypeScript (mitigado por comentários, tabela de casos e testes de integração CSV-I1 a CSV-I9); o arquivo de até 2 MB sobe duas vezes; o staging contém nome e e-mail e por isso tem RLS fechada e expiração (descarte imediato, 24 h sem aplicar, 7 dias após aplicar).

## Alternativas consideradas
- **Guardar o arquivo no Storage entre os passos:** CPFs em claro em repouso, contra o princípio central do projeto.
- **Parse e validação no navegador, enviando só JSON:** o servidor teria de revalidar tudo de qualquer jeito, e o CPF viajaria em claro do mesmo modo.
- **Diff em TypeScript:** exigiria reimplementar a normalização de nomes fora do banco e trazer todos os participantes do evento para a memória.
- **Aplicar exatamente o plano gravado na prévia, sem recalcular:** aplicaria decisões tomadas sobre um estado que já mudou.
