# 01 · Stack e decisões técnicas

## A baseline não está em discussão

O CF Eventos é o segundo projeto da casa. A stack é a do CF Jobs, versão por versão, e a justificativa de cada item está em `cf-jobs/docs/01-stack.md`. Repetir aquela análise aqui seria ruído; divergir dela custaria dois padrões para os mesmos contribuidores.

| Camada | Escolha (herdada) |
|---|---|
| Framework | Next.js 16 (App Router, RSC), build com webpack (ADR-0015 do CF Jobs) |
| Linguagem | TypeScript strict |
| UI | Tailwind CSS v4 + shadcn/ui (Radix), `lucide-react` |
| Formulários | `react-hook-form` + `@hookform/resolvers` |
| ORM | Drizzle sobre `postgres` (postgres.js), pooler Supavisor em modo transaction, `prepare: false` |
| Banco, Auth, Storage | Supabase |
| Validação | Zod 4, sempre importado de `@/lib/zod` |
| Agendamento | `pg_cron` + `pg_net`, segredo no Vault |
| Mutations do admin | Server Actions com `defineAction` |
| Rate limit | função SQL `check_rate_limit` + Vercel Firewall (sem Redis) |
| Markdown | `react-markdown` + `remark-gfm` + `rehype-sanitize` (descrição do evento) |
| Estado de URL no admin | `nuqs` (filtros e paginação das tabelas) |
| Gráficos (M12) | `recharts` |
| Erros | `@sentry/nextjs`, opcional por env |
| Analytics de tráfego | `@vercel/analytics` |
| Testes | Vitest + Testing Library + Playwright + `@axe-core/playwright` + pgTAP |
| Lint e formato | ESLint 9 flat + Prettier (com `prettier-plugin-tailwindcss`) |
| Pacotes e runtime | pnpm 11 · Node 24 LTS (≥ 24.15) |
| Releases | Conventional Commits + commitlint + husky + Release Please |
| Licença | MIT |
| Deploy | Vercel (funções em `gru1`), Supabase em `sa-east-1` |

**Uma divergência deliberada de arquivo herdado:** o `engines` deste projeto é `>=24.15 <25`, e não o `>=24.15` do CF Jobs. O intervalo aberto aceita o Node 26 e não expressa a decisão da tabela acima, que é a série 24 LTS; com o teto, quem desenvolve em outra série descobre no `pnpm install` e não no PR. O `.npmrc` mantém `engine-strict=true`, sem o qual o teto viraria aviso, e um `.nvmrc` com a série 24 fixa a versão de quem clona.

ADRs do CF Jobs que valem aqui sem reescrita estão listados no [ADR-0001](adr/0001-heranca-do-cf-jobs.md).

**O que o CF Jobs tem e este projeto não leva:** Vercel AI SDK, `linkedom`, `@mozilla/readability`, `turndown` (pipeline de IA), `zod-openapi` e Scalar (não há API pública versionada, [doc 07](07-apis-e-actions.md)).

## Dependências novas

Regra: cada adição tem uma linha dizendo por que ela e não a alternativa óbvia. Versões conferidas no npm em 20/09/2026.

| Dependência | Versão | Licença | Para quê | Por que ela | Alternativa rejeitada e motivo |
|---|---|---|---|---|---|
| `@cantoo/pdf-lib` | 2.11.x | MIT | compor texto e QR sobre a arte; gerar o `base.pdf` | fork ativo (release em 15/09/2026) com a API do original; JS puro; isomórfico; carrega PDF existente; subset de fonte | `pdf-lib` original: sem publish desde 11/2021. Puppeteer/Chromium: binário de 50 MB e cold start no endpoint do pico. `@react-pdf/renderer` e `pdfkit`: geram do zero, não compõem sobre PDF existente. ([ADR-0002](adr/0002-fork-cantoo-do-pdf-lib.md)) |
| `@cantoo/fontkit` | 2.0.x | MIT | parsear TTF/OTF: métricas para o layout, contornos para o SVG, embutimento no PDF | é o fontkit que o fork recomenda, mantido (11/09/2026), com tipos | `@pdf-lib/fontkit`: parado desde 2022. `fontkit` upstream: serviria; fica como plano B. `opentype.js`: não integra com o pdf-lib. |
| `qrcode-generator` | 2.0.x | MIT | matriz do QR | zero dependências; só precisamos da matriz porque o desenho vetorial é nosso | `qrcode`: arrasta `pngjs` e `yargs` para gerar PNG e CLI que não usamos |
| `papaparse` | 5.7.x | MIT | parse de CSV | zero dependências; RFC 4180 de verdade (aspas, delimitador e quebra de linha dentro de campo); detecção de delimitador configurável | `csv-parse`: equivalente, API de stream que não precisamos. Parser próprio: aspas e quebras de linha são exatamente onde parser caseiro falha. |
| `pdfjs-dist` | 6.x | Apache-2.0 | (1) no navegador do admin, rasterizar a arte em PDF para o fundo da prévia; (2) nos testes, extrair texto e posições do PDF gerado | única opção madura para as duas coisas, e a mesma serve às duas; carregada por `import()` só no editor | Rasterizar no servidor (`node-canvas`, `sharp`, Chromium): binário nativo no runtime só para uma prévia. `pdf-parse` nos testes: não devolve posições. |
| `resend` | 6.x | MIT | notificação de pedido de correção (fase 1) e e-mail em massa (fase 2) | SDK oficial: tipos, envio em lote, verificação de webhook | `fetch` direto na REST: reimplementaria lote e assinatura de webhook. `nodemailer` + SMTP: sem status de entrega nem webhooks. `@react-email/*`: desnecessário para dois e-mails, que são template de string. |
| `write-excel-file` (M12) | 4.x | MIT | exportações XLSX | só escreve, pequena, mantida (06/2026) | `exceljs`: 21 MB, sem release desde 2024. SheetJS: não é distribuído pelo npm de forma confiável. CSV no lugar de XLSX: reabriria o problema de encoding na mão da coordenação do curso. |
| `jsqr` (dev) | 1.x | Apache-2.0 | decodificar, no teste, o QR que o motor desenhou | prova de ponta a ponta que o QR aponta para a URL certa | conferir só a string de entrada: não provaria o desenho |

**Arrastar e redimensionar (M10): nenhuma biblioteca.** A alternativa óbvia, `@dnd-kit/core`, resolve arrastar entre contêineres e listas ordenáveis, e não tem redimensionamento. A segunda, `react-rnd`, tem os dois, mas mantém posição em pixels como estado próprio, o que briga com a regra de que a fonte de verdade são coordenadas normalizadas. O editor usa um hook de Pointer Events (`use-drag-resize.ts`, cerca de 150 linhas, `setPointerCapture`, 8 alças, teclado) que lê e escreve direto os valores de 0 a 1. É desktop apenas, então não há a complexidade de toque que justificaria uma biblioteca.

**Detecção de encoding: nenhuma biblioteca.** `TextDecoder` com `fatal: true` decide com exatidão ([doc 06](06-importacao-csv.md)); `chardet` e `jschardet` são estatísticos e erram em arquivo pequeno.

**Criptografia: `node:crypto`.** HMAC-SHA256, AES-256-GCM e `randomBytes` são nativos. Nenhuma biblioteca de JWT ou de sessão.

Qualquer dependência fora destas tabelas exige ADR antes do `pnpm add`.

## Como cada recurso do Supabase é usado

| Recurso | Uso |
|---|---|
| Postgres | todo o dado, inclusive staging de importação, rate limit, logs de observabilidade e a fila de e-mail |
| Auth | login do admin (e-mail e senha, GitHub OAuth), claim `user_role` por Auth Hook |
| RLS | em todas as tabelas; `anon` só lê `events` ([doc 04](04-banco-de-dados.md)) |
| Storage | `covers` e `previews` públicos; `templates` e `fonts` privados; upload por URL assinada |
| pg_cron + pg_net | rollup, podas, minimização LGPD, despacho da fila de e-mail (P1) |
| **Data API (PostgREST)** | **desligada em produção** ([doc 08](08-seguranca-e-lgpd.md)) |
| Edge Functions, Realtime | não usados |

## Limites de plataforma que dimensionam o desenho

| Limite | Valor | Consequência |
|---|---|---|
| Corpo de requisição e de resposta de Vercel Function | 4,5 MB | `base.pdf` ≤ 3 MB; upload de arte direto ao Storage; CSV ≤ 2 MB |
| Duração máxima (Hobby, Fluid Compute) | 300 s | `maxDuration = 60` nas rotas de PDF e de `attachArt`; folga enorme |
| Memória (Hobby) | 2 GB | cache de módulo limitado a 8 `base.pdf` (24 MB no pior caso) |
| Supabase gratuito: pausa após 7 dias de baixa atividade de banco | | workflow diário que consulta `/validar/{código-sentinela}` ([doc 12](12-open-source-e-governanca.md)) |
| Supabase gratuito: 2 projetos por organização | | sem staging com banco ([doc 02](02-arquitetura.md)) |
| Supabase gratuito: 500 MB de banco, 1 GB de Storage | | um evento de 300 pessoas ocupa menos de 1 MB de banco; cada modelo, até 13 MB de Storage (arte original e `base.pdf`) |
| Resend gratuito: 100 e-mails por dia, 3.000 por mês | | fila com teto diário configurável; a busca pública é o caminho principal ([doc 10](10-observabilidade.md)) |

## Variáveis de ambiente (contrato)

Validadas por Zod em `src/lib/env.ts`. `pnpm check:env` (herdado) falha o CI se `.env.example` divergir do schema.

| Variável | Escopo | Obrigatória | Descrição |
|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | público | sim | URL canônica. Entra no QR de todo certificado: errar aqui imprime QR quebrado. |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | público | sim | Auth no cliente |
| `SUPABASE_SERVICE_ROLE_KEY` | servidor | sim | leitura dos buckets privados e URLs assinadas, só depois de sessão e papel |
| `DATABASE_URL` | servidor | sim | pooler Supavisor, modo transaction |
| `DIRECT_URL` | servidor e CI | sim | migrations |
| `CPF_PEPPER` | servidor | sim | 32 bytes em base64. **Nunca rotacionar, nunca perder** ([doc 08](08-seguranca-e-lgpd.md)). |
| `RETRIEVAL_COOKIE_KEY` | servidor | sim | 32 bytes em base64, AES-256-GCM do cookie de retirada |
| `DEVICE_COOKIE_SECRET` | servidor | sim | HMAC do cookie de dispositivo |
| `IP_HASH_SECRET` | servidor | sim | HMAC diário de IP e de dispositivo |
| `CRON_SECRET` | servidor | sim | rotas `/api/internal/*` |
| `RESEND_API_KEY` | servidor | preguiçosa | validada no ponto de uso, como as chaves NVIDIA do CF Jobs: sem ela o app sobe, o pedido de correção é gravado e só a notificação não sai (com log) |
| `EMAIL_FROM` | servidor | preguiçosa | `Coding Ferpa <certificados@codingferpa.org>` |
| `ADMIN_NOTIFICATION_EMAIL` | servidor | preguiçosa | destino das notificações quando o evento não tem `contact_email` |
| `EMAIL_DAILY_LIMIT` / `EMAIL_MONTHLY_LIMIT` | servidor | não | padrão 90 e 2.900 (deixa 10 por dia para as notificações transacionais) |
| `RESEND_WEBHOOK_SECRET` | servidor | P1 | assinatura do webhook |
| `LINKEDIN_ORGANIZATION_ID` | servidor | P1, opcional | sem ela o botão usa `organizationName=Coding Ferpa` |
| `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | misto | não | como no CF Jobs |

O `.env.example` traz valores **de desenvolvimento** para os cinco segredos criptográficos, marcados como tal, para que `supabase db reset` e o seed local funcionem sem cerimônia. Em produção, cada um é gerado com `openssl rand -base64 32`.

Pré-requisitos operacionais que não são código (runbook do M9): SPF e DKIM de `codingferpa.org` no Resend antes do primeiro envio; página de empresa da Coding Ferpa no LinkedIn antes do M12; Data API desligada; Node 24.x e região `gru1` fixados no projeto da Vercel.
