# Guia de contribuição

Obrigado por querer ajudar. Este projeto é da comunidade Coding Ferpa, e quem
contribui costuma ser o mesmo estudante que recebe o certificado.

## Régua de revisão: legível por contribuidor júnior

A pergunta que a revisão faz é "alguém no segundo ano da faculdade entende
este arquivo sem perguntar a ninguém?". Função que cabe na tela, sem generics
engenhosos, abstração só na terceira repetição. Entre a solução elegante e a
simples, vence a simples.

Comentário só para restrição não óbvia, explicando o **porquê**. Código que
precisa de comentário para dizer o **que** faz quer ser reescrito.

## Antes de escrever código

A arquitetura já está decidida e documentada em [`docs/`](docs/README.md), e a
documentação vence o instinto. Se você encontrar contradição real, algo
impossível ou uma API que não funciona como o documento descreve, **pare e
abra a conversa** em vez de improvisar: decisão arquitetural nova (schema,
contrato de rota ou action, dependência de produção, RLS, cache, rate limit,
formato de código ou token) exige um ADR curto em `docs/adr/` **antes** do
código. O ADR é o primeiro commit do PR, e o código é revisado depois que ele
é aceito. Bug, refatoração dentro de uma camada e atualização minor não pedem
ADR.

## Ambiente

Pré-requisitos: Node 24 LTS, pnpm 11, Git e Docker. O `.nvmrc` fixa a série
do Node; o `engines` recusa outra.

```bash
git clone git@github.com:Coding-Ferpa/eventos.git && cd eventos
pnpm install
cp .env.example .env
pnpm db:start && pnpm db:reset
pnpm dev
```

Os valores do `.env` saem de `pnpm db:status`. As portas do Supabase local
são as padrão deslocadas em +100 (banco em 54422), para conviver com o CF
Jobs. As contas `admin@`, `editor@` e `reader@cfeventos.local`, senha
`cfeventos-local`, vêm do seed e só existem localmente; a `reader` não entra no
painel, como todo cadastro novo.

O `.env.example` cresce por milestone e diz, em comentário, onde cada grupo de
variáveis entra. Variável nova exige atualizar os dois lados no mesmo commit:
o schema de `src/lib/env.ts` e o `.env.example`. O `pnpm check:env` falha o CI
quando eles divergem.

## Dados pessoais: a regra que não tem exceção

**Nenhum dado real de participante entra no repositório**, nem em fixture,
seed, issue, PR, screenshot, log colado ou mensagem de commit. Commit é para
sempre: fork e cache não se reescrevem, e o erro vira incidente de LGPD
([doc 08](docs/08-seguranca-e-lgpd.md)).

- Fixtures e seeds são sintéticos: nomes fictícios com a forma dos reais
  (acento, partícula, nome longo), e-mails em `@example.com` e CPFs fictícios
  com dígito verificador válido.
- A planilha real de um evento vive só em `/local/`, que está no `.gitignore`.
- Screenshot com participantes usa o seed local.

## Antes de abrir o PR

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Quando a mudança toca o banco, também `pnpm db:reset && pnpm db:test &&
pnpm check:schema`. Quando toca fluxo de usuário, também `pnpm test:e2e`.

Branch a partir de `main`. PR acima de 400 linhas volta para ser fatiado: o
projeto avança em incrementos pequenos, e revisão de diff grande não pega
nada.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/pt-br/), validados
no CI. Tipos: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`,
`ci`, `revert`. Assunto em português, no imperativo, até 100 caracteres.

Escopo é opcional. Os usados aqui: `events`, `templates`, `pdf`, `import`,
`search`, `validation`, `admin`, `email`, `db`, `docs`, `ci`.

```
fix(import): detecta UTF-16LE sem BOM
```

Explique o porquê no corpo quando ele não for óbvio. O `docs/` faz parte da
entrega: se a realidade provou que um documento estava errado, corrija o
documento no mesmo PR.

## Segurança

Vulnerabilidade **nunca** vira issue pública. Use o canal da
[política de segurança](SECURITY.md).
