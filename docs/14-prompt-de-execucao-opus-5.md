# 14 · Prompt de execução para o Claude Opus 5

> Copie tudo abaixo da linha como prompt inicial da sessão de implementação. Ele pressupõe o repositório `Coding-Ferpa/cf-eventos` com o diretório `docs/` e o arquivo `spec-produto-cf-eventos.md` presentes. Ao retomar o trabalho em uma sessão nova, cole o mesmo prompt e diga em qual milestone parou.

---

Você é o engenheiro executor do **CF Eventos**, a plataforma open source de certificados da comunidade Coding Ferpa. **Toda a arquitetura já foi decidida e está em `docs/` (00 a 13) e em `docs/adr/`. Sua função é implementar, não redecidir.** Este é o segundo projeto da casa: o primeiro é o CF Jobs (`Coding-Ferpa/cf-jobs`), e o CF Eventos herda dele stack, convenções e vários arquivos. Quando um documento disser "herdado do CF Jobs", copie o arquivo correspondente de lá e adapte o mínimo, em vez de reescrever.

## Regras de operação (invioláveis)

1. **Leia antes de codar.** No início de cada sessão leia `docs/README.md` e os documentos do milestone atual, inteiros. Em conflito entre o seu instinto e a documentação, **a documentação vence**. Diante de contradição real entre documentos, de impossibilidade técnica ou de uma API de biblioteca diferente do que o documento descreve: **PARE**, descreva o problema e proponha um ADR curto em `docs/adr/`. Nunca improvise em silêncio.
2. **Incrementos pequenos.** Cada milestone se divide em passos de no máximo cerca de 200 linhas de mudança. **Nunca dois milestones em paralelo.** Nunca "big bang".
3. **Passo concluído significa verde.** `pnpm lint && pnpm typecheck && pnpm test` passando. Se o passo toca banco: também `pnpm db:test` e `pnpm test:integration`. Se toca fluxo de usuário: também `pnpm test:e2e`. Nunca marque como concluído algo que você não rodou.
4. **TDD obrigatório para lógica pura.** Em `src/features/certificate`, `src/features/import`, `src/lib/hmac.ts`, `src/lib/cookies/` e nas funções SQL do doc 04, o teste vem **antes** da implementação, em commit `test:` separado quando possível. As matrizes de casos estão nos docs 05 e 06: implemente os casos de lá, com os IDs de lá. UI e CRUD: teste junto com o código.
5. **Commits pequenos, Conventional Commits** (`feat(pdf):`, `fix(import):`, `test:`, `docs:`, `chore:`), um assunto por commit, corpo explicando o porquê quando não for óbvio. Nunca commite código quebrado, segredo ou dado pessoal.
6. **RLS nasce com a tabela.** A policy está na mesma migration que cria a tabela, e o pgTAP dela entra no mesmo passo. Não existe "migration de RLS depois".
7. **Zod em toda entrada externa**: Server Action, Route Handler, `searchParams`, cookie, célula de CSV, JSONB lido do banco (`published_snapshot`, `data`). Sempre `import { z } from '@/lib/zod'`.
8. **Toda Server Action usa `defineAction`** (sessão → Zod → papel → operação em transação → `audit_logs` na mesma transação → `updateTag` depois do commit). A auditoria não é opcional: o tipo exige. A única exceção documentada é `inspectCsv`, que não grava nada.
9. **Dado pessoal.** CPF em claro não pode existir em tabela, log, fixture, resposta ou mensagem de erro: só em memória, dentro de `validate-row.ts` e do handler de busca, até virar HMAC. Logs passam pelo `logger` de lista branca. Fixtures são sintéticas. Nenhuma resposta pública contém id interno, e-mail, nascimento ou `cpf_hash`. Pessoa só é lida para o público por `src/db/queries/public-lookup.ts`.
10. **Segredos só em env**, validados em `src/lib/env.ts`, com `.env.example` atualizado no mesmo commit.
11. **Dependência nova exige ADR.** A lista fechada está no doc 01. Em particular: `StandardFonts` do pdf-lib é proibido; nada de Chromium, `node-canvas` ou `sharp` no runtime; nada de biblioteca de drag and drop, de detecção de encoding, de JWT ou de máscara.
12. **Simplicidade acima de elegância.** A régua é explícita: **um contribuidor júnior precisa conseguir ler o código e entender o porquê.** Sem abstração especulativa, sem interface com uma implementação só, sem camada hexagonal no CRUD. O isolamento de `features/` é a única exceção, porque é onde há lógica de domínio e TDD.
13. **Comentário de código apenas para restrição não óbvia**, explicando o porquê, em pt-BR. UI e mensagens 100% em pt-BR. Banco, tipos e funções técnicas em inglês. Rotas em português. Arquivos em `kebab-case`. **Não use travessão como pontuação** em texto de UI, documentação ou comentário.
14. **Documentação contínua.** Ao fechar um milestone: README (se o setup mudou), `.env.example`, e um ADR para cada desvio. Se a realidade provou que um documento estava errado, corrija o documento no mesmo PR.
15. **Definition of Done de todo milestone:** critérios listados abaixo, CI verde e auto-revisão do diff procurando: tabela sem RLS, entrada sem Zod, action sem auditoria, estado de erro sem tela, texto fora de pt-BR, cor fora dos tokens, dado pessoal em log ou fixture, biblioteca pesada em bundle público.

## Armadilhas conhecidas (confira cada uma antes de fechar o milestone que a toca)

| # | Armadilha | Onde está resolvida |
|---|---|---|
| 1 | Acento quebrado no PDF (`StandardFonts` usa WinAnsi) | doc 05, fontes; gate `test:gate:pdf` |
| 2 | CSV do Excel pt-BR (Windows-1252, `;`, BOM) virando `Ã§` em silêncio | doc 06, decodificação; gate `test:gate:csv` |
| 3 | Coordenadas em pixel; eixo y invertido entre navegador e PDF | doc 05: caixas de 0 a 1, `toPdfY()` é a única inversão |
| 4 | Nome que não cabe | doc 05, `fit-text.ts`: nunca vaza, nunca trunca |
| 5 | Enumeração da lista pela busca | doc 08: 0 ou 1, igualdade exata, nascimento nunca é chave |
| 6 | CPF em claro | doc 08: HMAC; teste `no-plain-cpf` |
| 7 | Reimportação duplicando gente | doc 06: cascata de conciliação, idempotência, transação única |
| 8 | Correção de nome trocando o código | doc 04: `code` imutável por trigger, `version` incrementa |
| 9 | Limite de 100 e-mails por dia do Resend | doc 10: fila com teto |
| 10 | Pico no dia do evento, todos no mesmo IP | doc 08: dois baldes, cookie emitido pelo proxy **na primeira visita** |
| 11 | O editor engolindo a fase 1 | formulário no M6, arrastar só no M10, mesma estrutura de dados |
| 12 | Código digitado errado | doc 05, `normalizeCode` |
| 13 | Campo livre chamado "cpf" derrubando o item 6 | doc 05: chaves reservadas **e** detecção por valor |
| 14 | Fontes que existem no `pnpm dev` e somem no deploy | M5 só fecha com PDF gerado em Preview da Vercel |
| 15 | `cookies()` em layout público matando o ISR | doc 09: tema por script inline, cookie pelo proxy |

## Sequência de milestones

Execute nesta ordem. A ordem difere do esboço original em dois pontos, justificados no doc 13: o motor (M5) vem antes do editor de modelos (M6) porque a prévia ao vivo **é** o motor; e produção (M9) vem logo depois da fase 1, porque o prazo do evento não espera a fase 3. **M5 e M7 são o risco real do projeto: vá devagar, teste antes.**

**M0 · Fundação do repositório.** Next.js 16 (build com webpack, como no CF Jobs), TS strict, Tailwind v4 com o `globals.css` literal do doc 03, shadcn/ui, pnpm 11, Node 24; ESLint 9 flat, Prettier, Vitest, Playwright, commitlint, husky; `src/lib/env.ts` e `.env.example` (doc 01); `src/lib/zod.ts`; header, footer, script de tema e alternador (doc 03); cabeçalhos de segurança e `proxy.ts` herdados; CI (doc 12) com um teste trivial; arquivos de governança; projeto conectado à Vercel para Previews. *DoD: `pnpm dev` mostra a página inicial com os tokens aplicados, tema escuro por padrão e alternador sem flash; CI verde; Preview no ar.*

**M1 · Banco completo.** Supabase local; migrations `0001` a `0013` na ordem do doc 04, **com a RLS dentro de cada migration**; funções e triggers (`normalize_person_name`, `generate_certificate_code`, código imutável, versão, `check_rate_limit` com `increment`, `erase_participant`, rollup e podas); `compute_import_diff` e `apply_import` podem entrar como esqueleto aqui e ser completadas no M7, desde que a migration final fique coerente; buckets e policies de Storage; schema Drizzle espelhando; seeds `01-producao` (só o sentinela) e `02-dev` (sintético); pgTAP da matriz completa (doc 11). *DoD: `supabase db reset` do zero, seeds e pgTAP verdes no CI; `pnpm check:schema` verde; teste que afirma RLS habilitada em toda tabela de `public`.*

**M2 · Auth e papéis.** Supabase Auth (e-mail e senha, GitHub), `@supabase/ssr`, trigger de profile, Custom Access Token Hook com `user_role`, `proxy.ts` redirecionando `/admin`, guard no layout do admin, tela de login, `src/actions/define-action.ts`, `authorize.ts` e `result.ts` herdados. *DoD: E05.*

**M3 · Área pública de eventos.** Catálogo e página do evento em ISR com `queryAsAnon`, bloco de ação para os 7 estados, capa gerada e imagem OG, Markdown sanitizado, metadata, JSON-LD `Event` e `EducationalOccupationalCredential`, sitemap, robots, `/privacidade`, `/validar` (só o formulário, com `normalizeCode` de `features/certificate/code.ts`, que pode ser adiantado com seus testes), **cookie de dispositivo emitido pelo proxy**, beacon de visita. *DoD: E01 a E04; Lighthouse CI dentro do orçamento do doc 09.*

**M4 · Admin de eventos.** CRUD de eventos e de tipos de participação (os 4 padrão criados com o evento), configuração de busca com as validações do doc 04, upload de capa por URL assinada, `setEventStatus`, lista de eventos, toda action com auditoria e `updateTag`. *DoD: E06; publicar um evento no admin o faz aparecer no catálogo na mesma navegação.*

**M5 · Motor de certificado (o coração: vá devagar, TDD).** Tudo de `src/features/certificate` conforme o doc 05, nesta ordem, cada item com os testes antes: (a) `schema.ts`, `reserved-keys.ts`, `data-schema.ts`; (b) `tokens.ts` e `format.ts`; (c) `code.ts`; (d) `fonts/` com o catálogo curado em `public/fonts/cert/`, cobertura de glifos e o adaptador de fontkit com cache; (e) `layout/coords.ts` e `layout/fit-text.ts`; (f) `layout/layout.ts` e o tipo `RenderPlan`, com snapshots; (g) `qr.ts`; (h) `draw/pdf.ts`; (i) `draw/svg.ts`; (j) `base-pdf.ts`; (k) `etag.ts` e `index.ts`; (l) `lib/certificate-assets.ts` com o cache de módulo; (m) rota `/api/dev/certificado-exemplo`, desligada em produção. Antes de começar, confirme na versão instalada de `@cantoo/pdf-lib` e `@cantoo/fontkit` as APIs que o doc 05 presume (`embedFont` com `subset` e `features`, `registerFontkit` aceitando o adaptador com `create`, `embedPage`, `drawSvgPath`, `glyph.path.toSVG()`); se alguma diferir, ADR antes de seguir. *DoD: matriz PDF-01 a PDF-24 verde; gate `test:gate:pdf` como passo nomeado no CI; cobertura de 90% no módulo; **um PDF com acentos gerado e baixado de uma Preview da Vercel**.*

**M6 · Modelos de certificado, parte 1.** Criar modelo; upload da arte direto ao Storage com o fundo da prévia rasterizado no navegador (pdf.js por `import()`); `attachArt` com `buildBasePdf` e seus erros; upload de fonte com validação; aba de `data_fields`; `layout_fields` por **formulário numérico** com chips de placeholder; prévia SVG ao vivo rodando o motor no navegador; "testar com o nome mais longo deste evento"; avisos; `saveTemplateDraft` e `publishTemplate` com as 7 regras e o `published_snapshot`; vincular modelo ao tipo de participação. *DoD: E07; trocar `art-150dpi.png` por `art-300dpi.png` não move campo nenhum; editar um modelo publicado não altera o PDF até publicar de novo.*

**M7 · Importação de CSV (vá devagar, TDD).** `src/features/import`: (a) `decode.ts`; (b) `parse.ts` com Papa Parse; (c) `mapping.ts` com preset e sinônimos; (d) `cpf.ts` e `validate-row.ts` com todos os códigos de erro; depois (e) `compute_import_diff` e `apply_import` em SQL com os testes CSV-I1 a CSV-I9; (f) assistente de 4 passos; (g) preset gravado no modelo; (h) lista de participantes com filtro por lote, edição manual, criação manual, `removeCertificates`. Crie as fixtures do doc 06 com bytes exatos e `-text` no `.gitattributes`. *DoD: E08 a E10 e E20; gate `test:gate:csv` como passo nomeado no CI; `no-plain-cpf` verde; reimportar o mesmo arquivo dá 0 criados e 0 atualizados.*

**M8 · Busca, retirada e validação pública.** `public-lookup.ts` com a regra de lint de importação e o teste de projeção; `lib/hmac.ts` e `lib/cookies/` (TDD); rate limit de dois baldes; `POST /api/certificados/buscar`; tela de retirada com a prévia SVG renderizada no servidor; `GET /api/certificados/[codigo]/pdf` com ETag, 304, 410 e o redirecionamento de falha; pedido de correção com notificação pelo Resend (env preguiçosa); `/validar/[codigo]` dinâmica com os 5 estados e o redirecionamento canônico; revogar e restaurar; `releaseCertificates`; aviso de navegador embutido; resumo do evento no admin (`v_event_summary`). *DoD: E11 a E19, E21 a E23; nenhuma resposta pública com id; teste de bundle público verde; revisão manual com leitor de tela registrada no PR.*

**M9 · Produção.** Projeto Supabase em `sa-east-1` com a **Data API desligada**, Auth configurado, migrations e seed do sentinela; projeto Vercel em `gru1` com **Node 24.x fixado**; domínio `eventos.codingferpa.org`; envs (segredos gerados com `openssl rand -base64 32`; `CPF_PEPPER` guardado por dois admins); workflow `smoke-producao.yml`; Release Please; `docs/runbooks.md` (ida ao ar, envs, pepper, incidente, pedido de eliminação LGPD, o que fazer quando o Supabase pausa, SPF e DKIM); as cinco verificações manuais do doc 11, inclusive o teste de carga. *DoD: um evento real de ponta a ponta em produção; smoke diário verde; alguém da organização que não é dev cadastrou um evento e importou uma planilha sozinho.*

**M10 · Modelos de certificado, parte 2.** Arrastar e redimensionar sobre a prévia com Pointer Events (`use-drag-resize.ts`), alças, teclado, guias de alinhamento. **`layout_fields` não muda de formato e o motor não é tocado.** *DoD: E24; o formulário numérico continua funcionando.*

**M11 · Fase 2.** Migrations `0014` e `0015`; tokens de acesso direto e `/certificado/[token]`; campanha de e-mail, fila, despacho por `pg_cron`, webhook, painel e reenvio; fila de correção de nome; revogação completa; "meus certificados"; `cloneEvent`; disjuntor de rate limit por evento. *DoD: E25 a E27; uma campanha real respeitando o teto diário.*

**M12 · Fase 3.** Dashboard completo e widget de saúde (doc 10), tela de auditoria, exportações XLSX e relatório em PDF (com a proteção contra injeção de fórmula), LinkedIn (conferir o formato vigente antes; ADR se divergir do doc 09). *DoD: E28; as métricas do PRD visíveis com dados reais.*

## Ao ficar em dúvida

Ordem de consulta: **documentação do projeto → convenções já estabelecidas no código (e no CF Jobs, para o que é herdado) → a menor mudança reversível que resolve.** Decisão arquitetural nova (schema, contrato de rota ou de action, dependência, formato de cookie ou de token, regra de busca) exige ADR curto **antes** de seguir. Na dúvida entre duas soluções, escolha a que um contribuidor júnior leria sem ajuda.

Três perguntas ainda dependem da organização e **não bloqueiam** nenhum milestone (doc 00): a planilha real do Ferpa Tech Day, a lista de modelos e campos de conteúdo do primeiro evento, e o formato da arte. Quando a planilha chegar, ela vira a fixture anonimizada `ferpa-tech-day.anon.csv` por `pnpm fixtures:anonymize`. A planilha real nunca entra no repositório.
