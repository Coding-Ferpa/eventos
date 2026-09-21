# ADR-0004 · Conteúdo dinâmico declarado pelo modelo e gravado no certificado

- **Status:** aceita
- **Data:** 2026-09-20
- **Autores:** mantenedor e sessão de arquitetura

## Contexto
Requisito acrescentado pelo mantenedor na revisão da arquitetura: cada evento tem modelos de certificado diferentes, com campos diferentes (`titulo_palestra`, `turma`, `orientador`). Não existe conjunto fixo de colunas de CSV que sirva a todo evento. Ao mesmo tempo, a busca pública e a conciliação da importação precisam de um contrato estável, e o CPF não pode escapar para um campo livre.

## Decisão
Duas classes de campo, com fronteira rígida:

1. **Identidade (schema fixo, colunas reais em `participants`):** `full_name`, `full_name_normalized`, `cpf_hash`, `cpf_last3`, `birth_date`, `email`. Únicos campos usados em busca e conciliação. O admin escolhe quais habilitar na busca, mas não cria campo de identidade.
2. **Conteúdo (dinâmico):** o modelo declara `data_fields` (`key`, `label`, `type`, `required`, `default`, `format`); os valores ficam em **`certificates.data`** (JSONB), validados por um Zod gerado a partir da declaração.

O payload fica no certificado, não no participante: a pessoa que é palestrante e organizadora no mesmo evento tem carga horária e título de palestra diferentes em cada documento. O participante guarda quem a pessoa é; o certificado guarda o que aquele documento afirma.

Decorrências:

- a validação da importação é por linha, contra o modelo do tipo de participação **daquela linha**;
- um CSV por tipo de participação é o caminho principal; a planilha única com coluna de tipo é o caso degenerado suportado ([doc 06](../06-importacao-csv.md));
- o preset de mapeamento de colunas pertence ao modelo (`certificate_templates.column_mapping`) e é clonado com ele;
- `cloneEvent` copia modelos, campos, presets e configuração de busca, e nunca pessoas.

**CPF é sempre identidade, nunca conteúdo.** Duas barreiras: chaves reservadas na declaração (`cpf`, `nome`, `email`, `nascimento` e variantes com acento, hífen e underscore) e detecção por valor na importação (`CONTENT_LOOKS_LIKE_CPF`), que pega o campo chamado "registro".

Dois refinamentos sobre a proposta original do mantenedor, registrados por transparência:

- `data_fields` é uma **lista própria** do modelo, e os campos posicionados a referenciam por placeholder `{{data.key}}`, em vez de cada campo posicionado declarar sua chave. Motivo: a mesma chave aparece em mais de um lugar (frente e verso, dentro de um parágrafo), e duas declarações da mesma chave divergiriam.
- **Carga horária é coluna (`certificates.hours`), não conteúdo.** A página de validação, o JSON-LD, o LinkedIn e o dashboard dependem dela; um campo livre não serve de contrato.

## Consequências
- Positivas: qualquer evento cabe sem migration; o segundo evento reaproveita modelo e mapeamento (objetivo 5 do PRD); o contrato de busca não muda nunca.
- Negativas e trade-offs aceitos: JSONB não tem integridade referencial; mudar `data_fields` com certificados emitidos exige a regra 7 de publicação ([doc 05](../05-motor-de-certificados.md)) para não deixar certificado sem campo obrigatório. Consultas por conteúdo no admin são raras e ficam sem índice.

## Alternativas consideradas
- **`participants.extra` JSONB:** não comporta a mesma pessoa com dois certificados de conteúdo diferente.
- **Tabela EAV (`certificate_values`):** joins e complexidade para um dado que é sempre lido e escrito inteiro.
- **Colunas fixas para os campos "comuns":** a lista de comuns muda a cada evento.
