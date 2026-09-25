# CF Eventos

Plataforma de certificados dos eventos da comunidade **Coding Ferpa**
(Fernandópolis/SP). A organização cadastra o evento, sobe a arte do
certificado, posiciona os campos sobre ela e importa a lista de participantes
por CSV. O aluno acha o certificado sem cadastro, confere o nome na prévia e
baixa o PDF gerado na hora, com QR que leva a uma página pública de validação.

`eventos.codingferpa.org` · licença MIT · segundo projeto da casa, depois do
[CF Jobs](https://github.com/Coding-Ferpa/cf-jobs).

> **Em construção.** A arquitetura está fechada e documentada; a
> implementação avança por milestones ([doc 13](docs/13-roadmap.md)).

## Documentação

A arquitetura é canônica: nenhuma decisão de implementação a contradiz sem um
ADR aprovado. Comece pelo [índice](docs/README.md). Quem quer entender o
sistema em meia hora lê a [visão geral](docs/00-visao-geral.md), a
[arquitetura](docs/02-arquitetura.md) e o
[motor de certificados](docs/05-motor-de-certificados.md).

O documento de produto é o [PRD](docs/spec-produto.md).

## Stack

Next.js 16 (App Router, RSC) · TypeScript strict · Tailwind CSS v4 ·
shadcn/ui · Drizzle ORM · Supabase (Postgres, Auth, Storage) · Zod 4 ·
pnpm 11 · Node 24 LTS · Vitest, Testing Library, Playwright e pgTAP · deploy
na Vercel. O porquê de cada escolha, e de cada dependência nova, está no
[doc 01](docs/01-stack.md).

## Rodando localmente

Pré-requisitos: Node 24 LTS (há um `.nvmrc`), pnpm 11, Git e Docker.

```bash
git clone git@github.com:Coding-Ferpa/eventos.git && cd eventos
pnpm install
cp .env.example .env
pnpm db:start   # Supabase local; a primeira vez baixa as imagens
pnpm db:reset   # migrations do zero e os dois seeds
pnpm dev
```

Os valores do `.env` saem de `pnpm db:status` (URL da API, chave anônima e
URL do banco); cada variável está comentada no `.env.example`.

O Supabase local deste projeto usa portas deslocadas em +100 (API em 54421,
banco em 54422, Studio em 54423, e-mails de teste em 54424), para conviver
com o do CF Jobs na mesma máquina. O seed de desenvolvimento cria três contas
com a senha `cfeventos-local`, que só existe localmente: `admin@cfeventos.local`,
`editor@cfeventos.local` e `reader@cfeventos.local`, esta sem acesso ao
painel, como todo cadastro novo.

## Scripts

| Comando                                             | O que faz                                                  |
| --------------------------------------------------- | ---------------------------------------------------------- |
| `pnpm dev`                                          | servidor de desenvolvimento                                |
| `pnpm build`                                        | build de produção                                          |
| `pnpm lint` · `pnpm typecheck`                      | ESLint e TypeScript                                        |
| `pnpm format` · `pnpm format:check`                 | Prettier                                                   |
| `pnpm test` · `pnpm test:coverage`                  | Vitest                                                     |
| `pnpm test:e2e`                                     | Playwright                                                 |
| `pnpm check:env`                                    | confere `.env.example` contra o schema de env              |
| `pnpm db:start` · `pnpm db:stop` · `pnpm db:status` | Supabase local                                             |
| `pnpm db:reset`                                     | aplica as migrations do zero e os seeds                    |
| `pnpm db:test`                                      | pgTAP: matriz de RLS, funções e guardas                    |
| `pnpm check:schema`                                 | confere o schema Drizzle contra o banco, nas duas direções |
| `pnpm check:migrations`                             | gate de expand/contract nas migrations                     |

## Contribuindo

Leia o [guia de contribuição](CONTRIBUTING.md) e o
[Código de Conduta](CODE_OF_CONDUCT.md). Vulnerabilidade tem canal próprio, e
nunca é issue pública: veja a [política de segurança](SECURITY.md).

Uma regra vale para qualquer contribuição: **nenhum dado real de participante
entra no repositório**, nem em fixture, issue, screenshot ou log colado.
