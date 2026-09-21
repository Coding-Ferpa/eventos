# ADR-0007 · Importação upsert-only, com remoção manual explícita

- **Status:** aceita
- **Data:** 2026-09-20
- **Autores:** mantenedor e sessão de arquitetura

## Contexto
O admin vai reimportar planilhas corrigidas sobre uma emissão já publicada. Uma importação que sincroniza (remove do banco quem sumiu do arquivo) transforma um filtro esquecido no Excel em dezenas de certificados apagados, alguns já impressos e entregues em secretarias. Por outro lado, quem importou a planilha errada precisa de uma saída que não seja revogar um a um.

## Decisão
1. **A importação nunca remove.** Ela cria e atualiza. Quem está no banco e não veio no arquivo aparece na prévia como "ausentes no arquivo", informativo, sem ação. Célula vazia nunca apaga valor existente.
2. **Remover é ação própria do admin, fora do fluxo de importação:** a lista de participantes é filtrável por lote (`created_by_batch_id`), tem seleção múltipla e a action `removeCertificates`, que exige digitar a quantidade para confirmar e gera `audit_logs` com contagem e lote.
3. **Regra da remoção:** certificado nunca baixado de evento ainda não liberado é apagado fisicamente (e o participante, se ficar sem certificados). Em qualquer outro caso a action recusa (`must_revoke`) e oferece a revogação com motivo: um código que já pode estar em um papel tem de continuar respondendo algo honesto na validação.
4. Papel: `editor` antes da liberação do evento, `admin` depois.

## Consequências
- Positivas: nenhuma planilha consegue destruir uma emissão; o desastre "importei o arquivo errado" se resolve em uma tela, filtrando pelo lote; a página de validação nunca transforma um documento emitido em "inexistente".
- Negativas e trade-offs aceitos: o banco pode acumular gente que não devia estar lá até alguém remover; a prévia precisa mostrar os ausentes para que isso seja visível. Atualizações feitas por um lote errado não são desfeitas automaticamente (a prévia mostra o antes e o depois justamente para que o erro seja pego antes de aplicar).

## Alternativas consideradas
- **Importação como sincronização completa:** poder destrutivo demais para uma operação feita às 23h.
- **Opção "remover ausentes" marcável na importação:** a mesma arma, com um clique a mais.
- **"Desfazer lote" automático, revertendo também as atualizações:** exigiria guardar o estado anterior de cada linha (mais dado pessoal em staging, por mais tempo) para um caso que a prévia já previne.
