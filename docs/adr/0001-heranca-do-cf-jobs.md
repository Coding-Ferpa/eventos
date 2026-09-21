# ADR-0001 · Herança do CF Jobs

- **Status:** aceita
- **Data:** 2026-09-20
- **Autores:** mantenedor e sessão de arquitetura

## Contexto
O CF Eventos é o segundo projeto da Coding Ferpa, do mesmo mantenedor e para os mesmos contribuidores do CF Jobs (`Coding-Ferpa/cf-jobs`), que está em produção com arquitetura documentada e decisões já testadas pela realidade. Reavaliar framework, ORM ou governança custaria tempo e produziria dois padrões na mesma casa.

## Decisão
O CF Eventos herda do CF Jobs a stack inteira, as convenções de código, o design system, a governança e os ADRs abaixo, sem reescrevê-los. Quando este repositório e o CF Jobs divergirem em algo herdado, é bug deste repositório ou motivo para um ADR novo aqui.

| ADR do CF Jobs | O que vale aqui |
|---|---|
| 0011 escopo do gate de `pnpm audit` | `pnpm audit --prod` bloqueante em high e critical |
| 0012 CSP com nonce apenas em rotas dinâmicas | idem; as rotas dinâmicas daqui incluem `/admin`, `/login`, a tela de retirada e `/validar/[codigo]` |
| 0013 metadata bloqueante para todos os agentes | `htmlLimitedBots: /.*/` |
| 0014 `updateTag` no lugar de `revalidateTag` | dentro de Server Action, `updateTag`; `revalidateTag` só na rota interna |
| 0015 build com webpack no Next 16 | `next build --webpack` |
| 0016 locale do Zod no módulo | `src/lib/zod.ts` reexporta o `z` configurado; ninguém importa `zod` direto |
| 0018 Vault no lugar de `alter database set` | o segredo que o `pg_cron` usa para chamar a Vercel fica no Vault |
| 0019 `minimumReleaseAge` desligado | idem |

Arquivos copiados e adaptados no M0 e no M2: `define-action.ts`, `authorize.ts`, `result.ts`, `db/client.ts` (com `queryAsAnon`), `lib/env.ts`, `lib/zod.ts`, `lib/theme.ts`, `lib/security-headers.ts`, `proxy.ts`, `scripts/check-*.ts`, workflows de CI, configs de lint, formatação, commit e release.

Não se aplica: o ADR-0017 (saída estruturada do NIM) e tudo o que é do pipeline de IA.

## Consequências
- Positivas: contribuidor do CF Jobs abre este repositório e já sabe onde está tudo; correções de infraestrutura feitas lá podem ser portadas quase literalmente.
- Negativas e trade-offs aceitos: decisões do CF Jobs que envelhecerem mal envelhecem aqui também. Aceito: o custo de manter dois projetos alinhados é menor que o de mantê-los diferentes.

## Alternativas consideradas
- **Reavaliar a stack do zero:** rejeitada pelo mantenedor antes da sessão de arquitetura; o ganho marginal não paga dois padrões.
- **Monorepo com o CF Jobs:** acopla deploy, histórico e permissões de dois produtos com dados de natureza diferente (vagas públicas e dados pessoais de estudantes).
