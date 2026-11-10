# CF Eventos · Documentação de arquitetura

> Especificação técnica completa da plataforma de certificados da comunidade **Coding Ferpa** (`eventos.codingferpa.org`, repositório `Coding-Ferpa/eventos`, MIT).
> Produzida como fase de arquitetura, em setembro de 2026. Nenhuma decisão de implementação deve contradizer estes documentos sem um ADR aprovado.

O documento de produto é o [PRD](spec-produto.md) (versão 1.1, já com os ajustes aprovados na revisão de arquitetura). O PRD diz **o quê e por quê**; esta pasta diz **como**.

## Como ler

Os documentos estão numerados na ordem recomendada de leitura. Cada um é autocontido e referencia os outros quando precisa. Quem vai implementar lê tudo; quem quer entender o sistema em meia hora lê 00, 02 e 05.

| Doc | Conteúdo |
|---|---|
| [00 · Visão geral](00-visao-geral.md) | objetivos, personas, escopo, princípios, divergências do PRD, questões em aberto |
| [01 · Stack](01-stack.md) | baseline herdada do CF Jobs, cada dependência nova com a alternativa rejeitada, limites de plataforma, contrato de env |
| [02 · Arquitetura](02-arquitetura.md) | componentes, os três fluxos centrais em sequência, camadas, estrutura de pastas, decisões transversais |
| [03 · Design system](03-design-system.md) | tokens do CF Jobs, tipografia, UX dos componentes-chave, voz e microcopy |
| [04 · Banco de dados](04-banco-de-dados.md) | ERD, tabelas, enums, índices, **matriz de RLS**, funções, triggers, views, seeds, cron |
| [05 · Motor de certificados](05-motor-de-certificados.md) | **o coração**: biblioteca, formato do modelo, coordenadas, fontes, ajuste de texto, QR, código, cache, matriz de testes |
| [06 · Importação de CSV](06-importacao-csv.md) | máquina de estados, encoding e delimitador, mapeamento, validações, conciliação, idempotência, fixtures |
| [07 · APIs e Server Actions](07-apis-e-actions.md) | actions por domínio, Route Handlers públicos, contratos Zod, códigos de erro, cache e invalidação |
| [08 · Segurança e LGPD](08-seguranca-e-lgpd.md) | papéis, acesso ao banco, HMAC do CPF, enumeração, rate limit, tokens, OWASP, LGPD |
| [09 · Frontend e SEO](09-frontend-e-seo.md) | rotas, renderização, metadata, JSON-LD, sitemap, acessibilidade, orçamento de performance |
| [10 · Observabilidade](10-observabilidade.md) | métricas do PRD e como coletá-las, dashboard, fila de e-mail, logs, erros |
| [11 · Qualidade](11-qualidade.md) | testes por camada, TDD obrigatório, gates do CI, specs E2E numeradas, cobertura, Lighthouse |
| [12 · Open source e governança](12-open-source-e-governanca.md) | repositório, CI, smoke diário, templates, releases, licença, contribuição |
| [13 · Roadmap](13-roadmap.md) | fases, milestones, critérios de pronto, ordem de corte, riscos |
| [14 · Prompt de execução](14-prompt-de-execucao-opus-5.md) | **o entregável final**: o prompt que o mantenedor cola na sessão do Claude Opus 5 |
| [adr/](adr/) | template, os 13 ADRs da sessão de arquitetura e os da execução, a partir do 0014 |

## Resumo executivo das decisões

- **Stack:** a do CF Jobs, sem alteração (Next.js 16, TypeScript strict, Tailwind v4, shadcn/ui, Drizzle, Supabase, Zod 4, pnpm, Node 26, Vercel). Dependências novas: `@cantoo/pdf-lib`, `@cantoo/fontkit`, `qrcode-generator`, `papaparse`, `pdfjs-dist`, `resend` e, na fase 3, `write-excel-file`. Nenhuma biblioteca para arrastar, para detectar encoding ou para criptografia. ([ADR-0001](adr/0001-heranca-do-cf-jobs.md), [ADR-0002](adr/0002-fork-cantoo-do-pdf-lib.md))
- **Motor de certificado:** `layout()` puro produz um plano de renderização; dois desenhistas sem lógica o consomem: PDF (download) e SVG com glifos em path (prévias). Sem pdf.js no celular, sem rasterizador no servidor nem no CI. A arte vira, uma vez, um `base.pdf` de página canônica (maior lado de 841,89 pt, até 3 MB). Caixas normalizadas de 0 a 1; a inversão do eixo y existe em uma função. Fonte sempre embutida, com subset, parseada em cache. Texto encolhe, depois quebra; nunca vaza e nunca trunca. ([ADR-0003](adr/0003-layout-puro-e-dois-desenhistas.md), [ADR-0008](adr/0008-pagina-canonica-e-base-pdf.md))
- **Modelo de dados:** `participants` (identidade, schema fixo) 1:N `certificates` (tipo, carga horária, **conteúdo dinâmico em JSONB declarado pelo modelo**, código imutável, versão). CPF é sempre identidade, nunca conteúdo, com guardrail por chave e por valor. ([ADR-0004](adr/0004-payload-dinamico-no-certificado.md))
- **Busca pública:** resultado 0 ou 1, igualdade sobre valor normalizado inteiro, chaves independentes CPF, e-mail e nome. **Data de nascimento nunca é chave sozinha.** Sucesso emite um cookie cifrado de 30 minutos; nenhum id sai. `anon` não tem policy em tabela de pessoa, e a Data API do Supabase fica desligada. ([ADR-0009](adr/0009-data-de-nascimento-nunca-e-chave.md), [ADR-0010](adr/0010-token-de-retirada-em-cookie-cifrado.md), [ADR-0012](adr/0012-consulta-publica-privilegiada-e-data-api-desligada.md))
- **CPF:** `HMAC-SHA256` com pepper em env e salt por evento, mais os 3 últimos dígitos. O pepper nunca é rotacionado. ([ADR-0005](adr/0005-hmac-com-salt-por-evento.md))
- **Rate limit:** Postgres, dois baldes por evento: dispositivo (números do PRD) e IP (largo, só falhas), porque no dia do evento o auditório inteiro sai pelo mesmo IP. O cookie de dispositivo é emitido pelo proxy na primeira visita. ([ADR-0006](adr/0006-dois-baldes-de-rate-limit.md))
- **Importação de CSV:** um arquivo por tipo de participação; colunas dinâmicas validadas contra o modelo de cada linha; encoding decidido por BOM, UTF-8 estrito e Windows-1252; o arquivo nunca é persistido; conciliação em cascata e aplicação em uma transação SQL com lock por evento e recálculo do diff. Importação nunca remove: remoção é manual, por lote, auditada. ([ADR-0011](adr/0011-staging-e-diff-em-sql.md), [ADR-0007](adr/0007-upsert-only-e-remocao-manual.md))
- **Código de validação:** 10 símbolos Crockford Base32 (50 bits), imutável; correção de nome incrementa a versão. `/validar/[codigo]` é dinâmica, com estados válido, revogado, removido a pedido do titular, não encontrado e malformado.
- **LGPD:** base legal do art. 7º, V; minimização no desenho; retenção de 5 anos para os dados de busca; eliminação deixa uma lápide sem dado pessoal; pedido de correção gravado na plataforma desde a fase 1.
- **Operação:** Vercel em `gru1`, Supabase em `sa-east-1`, sem staging com banco (a Preview mostra o site vazio: [ADR-0014](adr/0014-site-vazio-quando-nao-ha-banco.md)); smoke diário que consulta a validação e impede a pausa do Supabase; e-mail em massa por fila em tabela com teto diário (fase 2).
- **Execução:** M0 a M12, com o motor (M5) antes do editor (M6), CSV (M7) antes da busca (M8), e **produção no M9**, antes de qualquer conforto. ([ADR-0013](adr/0013-ordem-dos-milestones.md))

## O que ainda depende da organização

Nenhum item bloqueia a implementação; os dois primeiros definem fixtures e textos de ajuda. Detalhe no [doc 00](00-visao-geral.md#questões-em-aberto-e-como-o-projeto-segue-sem-elas).

1. A planilha real do Ferpa Tech Day (colunas; se há CPF ou data de nascimento).
2. Quantos modelos de certificado o primeiro evento terá e quais campos de conteúdo cada um pede.
3. O formato da arte.
4. A data prometida dos certificados, que é o único prazo duro.
5. Validação da seção de LGPD por alguém habilitado, antes do primeiro evento.
