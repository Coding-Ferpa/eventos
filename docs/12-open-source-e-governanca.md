# 12 · Open source e governança

A governança é a do CF Jobs (`Coding-Ferpa/cf-jobs`), copiada arquivo a arquivo. Só muda o que decorre de uma diferença: este repositório gira em torno de dado pessoal de estudante, inclusive menor de idade.

## 1. Repositório público desde o commit inicial

Fecha a questão aberta 8 do PRD: `Coding-Ferpa/eventos` nasce público, como o CF Jobs. Nada no repositório é segredo: pepper, chaves e participantes ficam em env e no banco; schema, RLS e algoritmo de hash são públicos de propósito (a segurança está no pepper, não em esconder o método). Rejeitado: privado até o primeiro evento, porque abrir depois custa uma auditoria de histórico. Ligados no commit zero: secret scanning com push protection, private vulnerability reporting e a regra da seção 6.

## 2. Licença

MIT (`LICENSE`). A dependência `@cantoo/pdf-lib` é MIT. As fontes do certificado são SIL OFL 1.1, que permite redistribuir e embutir desde que a licença acompanhe os arquivos (seção 7); o PDF gerado não herda a OFL.

## 3. Raiz do repositório

App único, sem monorepo. A árvore de `src/` está no [doc 02](02-arquitetura.md).

```
.github/workflows/       ci.yml, release.yml, deploy-db.yml, smoke-producao.yml
.github/ISSUE_TEMPLATE/  bug.yml, feature.yml, chore.yml, config.yml
.github/                 pull_request_template.md, CODEOWNERS, dependabot.yml
.husky/pre-commit  docs/  e2e/  scripts/  src/  tests/integration/
public/fonts/cert/       TTFs do certificado e LICENSES/
supabase/                config.toml, migrations/, seeds/ (01-producao, 02-dev), tests/ (pgTAP)
README.md  CONTRIBUTING.md  CODE_OF_CONDUCT.md  SECURITY.md  LICENSE
THIRD_PARTY_NOTICES.md  CHANGELOG.md (gerado)  .env.example
```

Configs com os nomes do CF Jobs (`commitlint.config.mjs`, `eslint.config.mjs`, `lighthouserc.json`, `vitest.integration.config.ts`, `pnpm-workspace.yaml`). Duas diferenças: `.gitattributes` acrescenta `tests/fixtures/csv/** -text` (sem isso o Git normaliza o CRLF das fixtures e o teste exercita um arquivo que o Excel nunca produziu), e `.gitignore` inclui `/local/`, único lugar onde uma planilha real pode existir.

## 4. CI: `ci.yml`

Em todo PR e em push na `main`. Seis jobs paralelos, todos status checks obrigatórios.

| Job | Roda, e bloqueia o merge se falhar |
|---|---|
| `quality` | `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm check:env` (`.env.example` contra o schema Zod de env), `pnpm check:migrations`, `pnpm build` só com `NEXT_PUBLIC_SITE_URL` (o build da Preview, sem banco: doc 02), `pnpm check:fonts-trace` (as fontes no rastro de cada rota de PDF, e nenhum `.env` ou `.git/` junto: doc 05), `pnpm check:fonts`, `pnpm audit --prod --audit-level high`. A auditoria com dev roda só informativa (ADR-0011 do CF Jobs) |
| `commitlint` | só em PR: commits contra a seção 9 |
| `test` | `pnpm test:gate:pdf`, `pnpm test:gate:csv`, `pnpm test:coverage` (Vitest, limites do [doc 11](11-qualidade.md)) |
| `db` | `pnpm db:start`, `pnpm db:reset` (migrations do zero mais seed), `pnpm db:test` (pgTAP da matriz de RLS do [doc 04](04-banco-de-dados.md)), `pnpm check:schema`, `pnpm test:integration` (contra o Postgres do Supabase CLI) |
| `e2e` | Supabase local, `pnpm test:e2e` (Playwright, Chromium e WebKit; fluxos públicos em viewport de celular) |
| `lighthouse` | Supabase local, `pnpm build`, `pnpm exec lhci autorun` em `/`, `/eventos/{slug-do-seed}` e `/validar` (as rotas dinâmicas ficam fora: dependem de cookie e de banco, [doc 09](09-frontend-e-seo.md)). LCP, CLS e TBT como asserção principal e os KB de JavaScript como tripwire ([ADR-0015](adr/0015-orcamento-de-js-sobre-o-piso-do-framework.md)). Relatórios como artefato do job, sem armazenamento público |

**Dois gates inegociáveis**, em passos nomeados para o PR mostrar o que quebrou. Os scripts filtram por nome de arquivo (`vitest run pdf-accents`, `vitest run csv-encoding`), onde quer que o doc 02 ponha os testes.

- **`pdf-accents.test.ts`**: para cada TTF de `public/fonts/cert/` (lista a pasta, então fonte nova entra sozinha), gera um PDF pelo motor real do [doc 05](05-motor-de-certificados.md) com `José Gonçalves de Assunção`, extrai o texto e compara por igualdade estrita, e exige a fonte embutida (`/FontFile2`, nenhuma das 14 fontes-padrão). Pega TTF sem os glifos e regressão para `StandardFonts`: falhas sem erro, só com certificado impresso errado. A extração sozinha não pegaria a segunda, porque os acentos do português existem no WinAnsi (medido no M5).
- **`csv-encoding.test.ts`**: roda o parser do [doc 06](06-importacao-csv.md) contra `excel-ptbr-cp1252-semicolon.csv`, `excel-csv-utf8-bom-semicolon.csv`, `google-sheets-utf8-comma.csv` e `excel-unicode-utf16le-tab.txt`, de mesmo conteúdo lógico. As quatro produzem as mesmas linhas, com acentos intactos, sem opção informada pelo chamador.

PR que remove, marca com `.skip` ou afrouxa um gate é recusado.

**PR de fork não recebe secrets.** O `ci.yml` não usa nenhum: todo job fala com o Supabase local, com chaves de teste fixas em `$GITHUB_ENV` (inclusive o pepper), então o fork roda a bateria inteira. Secrets existem só em `deploy-db.yml` (o do CF Jobs: `supabase db push` antes do deploy hook da Vercel) e `release.yml`, que não disparam em PR. `pull_request_target` é proibido, e o ambiente Preview da Vercel nunca recebe as envs de produção.

## 5. `smoke-producao.yml`

Roda 1 vez por dia (`cron: '17 9 * * *'`) e por `workflow_dispatch`.

1. `curl --fail --max-time 30 --retry 3` em `https://eventos.codingferpa.org/validar/${{ vars.SMOKE_VALIDATION_CODE }}`.
2. `grep -qF "${{ vars.SMOKE_EXPECTED_NAME }}"` no HTML. Status 200 sem o nome é falha.
3. Na falha: `gh issue create` com label `smoke-producao`, ou comentário na issue já aberta. O corpo lembra que projeto pausado só volta por restauração manual no dashboard do Supabase.
4. Sempre: `gh workflow enable smoke-producao.yml`, porque o GitHub desativa workflow agendado de repositório público após 60 dias sem atividade.

Dupla função: smoke test de produção e atividade de **banco** que impede o Supabase gratuito de pausar o projeto após 7 dias de baixa atividade, o normal entre um evento e outro. Request que só toca a Vercel não conta; por isso o alvo é `/validar/{código}`, dinâmica e com consulta ao Postgres a cada request ([doc 09](09-frontend-e-seo.md)). É um contrato: cache nessa rota mata o keep-alive sem avisar.

O certificado sentinela vem do seed `supabase/seeds/01-producao.sql` ([doc 04](04-banco-de-dados.md)): um evento de demonstração `archived`, fora do catálogo, com um participante fictício de nome acentuado. Nunca é revogado. O mesmo certificado serve ao teste de carga do M9 ([doc 11](11-qualidade.md)).

## 6. Dados pessoais no repositório

**Nenhum dado real de participante entra no repositório**: nem em fixture, seed, issue, PR, screenshot, log colado ou mensagem de commit. Commit é para sempre (forks e caches não se reescrevem), então o erro vira incidente do [doc 08](08-seguranca-e-lgpd.md).

- Fixtures de CSV e os seeds em `supabase/seeds/` são sintéticos: nomes fictícios com a forma dos reais (acentos, partículas, nome longo), e-mails em `@example.com` e CPFs fictícios gerados por script com dígito verificador válido, nunca copiados de documento.
- A planilha real de um evento nunca é commitada; vive só em `/local/`. Para derivar fixture dela, `pnpm fixtures:anonymize local/<arquivo>.csv` troca todos os valores por sintéticos e preserva encoding, BOM, delimitador e fim de linha. Anonimizar no Excel não serve: salvar de novo destrói as peculiaridades de formato que davam valor ao arquivo.
- Screenshot com participantes usa o seed local. Dado publicado por engano é apagado (conteúdo e histórico de edição) e tratado como incidente.

## 7. Fontes do certificado

Poppins, Inter, Montserrat, Lora e Playfair Display ficam em `public/fonts/cert/` como **TTF estáticos**, um arquivo por peso usado (doc 05), com o nome do Google Fonts (`Poppins-Regular.ttf`; para família distribuída como variável, a pasta `static/` do download). Fonte variável não é aceita: o embutimento de fontes variáveis pela família pdf-lib não é confiável, e o risco é o peso 700 sair como 400 sem erro nenhum.

Todas são SIL OFL 1.1. `public/fonts/cert/LICENSES/` traz um `OFL-{Familia}.txt` por família (o aviso de copyright muda em cada uma), e `THIRD_PARTY_NOTICES.md` tem a tabela: família, arquivos, versão, copyright, licença, URL de origem. `pnpm check:fonts` reprova TTF com tabela `fvar`, com peso diferente do catálogo, sem os caracteres do português, sem licença em `LICENSES/` ou fora da tabela. Fonte enviada pelo admin vai para o Storage, não para o repositório.

## 8. Templates, CODEOWNERS, Dependabot

Issue forms com os campos do CF Jobs:

- `bug.yml`: reproduzir, esperado, observado, prints, ambiente. Abre com o aviso em destaque "**Não cole dados reais de participantes**: nome, CPF, e-mail, planilha, certificado ou print com alguém de verdade. Issues são públicas. Reproduza com o seed local." e tem checkbox obrigatório de confirmação.
- `feature.yml`: problema antes da solução. `chore.yml`: o que e por quê.
- `config.yml`: sem issue em branco, e links para dúvidas, vulnerabilidade e "Problema com o seu certificado", que leva ao site (o aluno que não acha o certificado acha o repositório e abre issue com o próprio CPF).

`pull_request_template.md`: o que muda, por quê, como testar, screenshots e o checklist:

- [ ] `pnpm lint`, `pnpm typecheck` e `pnpm test` passam; testes cobrem a mudança
- [ ] Tabela nova nasce com RLS, `grant` e pgTAP na mesma migration
- [ ] Toda entrada externa passa por Zod
- [ ] Toda mutação grava `audit_logs` pelo esqueleto padrão de Server Action
- [ ] `docs/`, `.env.example` e ADR atualizados quando a mudança pede
- [ ] Sem dado pessoal real nem segredo no diff, nas fixtures e nos screenshots

`CODEOWNERS`: `* @eduardovpessoa`, com entradas explícitas para `/docs/`, `/supabase/migrations/`, `/.github/workflows/`, `/public/fonts/cert/`, os dois testes de gate e `tests/fixtures/csv/`.

`dependabot.yml`: npm semanal às segundas, até 5 PRs, grupo `dependencias-menores` (minor e patch), prefixo `chore`; `github-actions` mensal, prefixo `ci`.

Branch protection em `main`: os seis checks, 1 review de code owner, sem force-push, histórico linear.

## 9. Commits e releases

Mesmo `commitlint.config.mjs` do CF Jobs: tipos `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `ci`, `revert`; cabeçalho até 100 caracteres; assunto em português, no imperativo. Valida no CI, não em hook `commit-msg`: o husky só roda `lint-staged`, para tooling local não barrar iniciante.

Escopo opcional, sem `scope-enum`. Sugeridos: `events`, `templates`, `pdf`, `import`, `search`, `validation`, `admin`, `email`, `db`, `docs`, `ci`. Exemplo: `fix(import): detecta UTF-16LE sem BOM`.

`release.yml`: `googleapis/release-please-action` com `release-type: node` em push na `main`. O merge do PR de release gera tag semver, `CHANGELOG.md` e GitHub Release, sem npm. Token `secrets.RELEASE_PLEASE_TOKEN || secrets.GITHUB_TOKEN`, porque a organização bloqueia PR aberto por Actions.

## 10. Guia de contribuição

`CONTRIBUTING.md` segue o do CF Jobs. Pré-requisitos: Node 24 LTS, pnpm 11, Git, Docker.

```bash
git clone git@github.com:Coding-Ferpa/eventos.git && cd eventos
pnpm install
cp .env.example .env    # valores impressos por `pnpm db:start`
pnpm db:start && pnpm db:reset
pnpm dev
```

Meta: menos de 10 minutos do clone a um certificado baixado. O seed cria `admin@cfeventos.local` e `editor@cfeventos.local` (senha `cfeventos-local`, só local) e um evento de demonstração com modelo publicado e participantes sintéticos.

Scripts com os nomes do CF Jobs, mais `check:fonts`, `test:gate:pdf`, `test:gate:csv` e `fixtures:anonymize`. Antes do PR: `pnpm lint && pnpm typecheck && pnpm test`; com banco, `pnpm db:reset && pnpm db:test && pnpm check:schema`. Branch a partir de `main`; PR acima de 400 linhas volta para fatiar.

**Régua: legível por contribuidor júnior.** Quem contribui é o mesmo estudante que recebe o certificado. A pergunta da revisão é "alguém no segundo ano da faculdade entende este arquivo sem perguntar a ninguém?". Função que cabe na tela, sem generics engenhosos, abstração só na terceira repetição. Entre a elegante e a simples, vence a simples.

## 11. ADRs

`docs/adr/NNNN-titulo-em-kebab-case.md`, com o `0000-template.md` do CF Jobs. Decisão arquitetural nova exige ADR curto **antes do código**: schema além de coluna aditiva, contrato de action ou rota, dependência de produção, RLS, cache, rate limit, formato de código ou token. O ADR é o primeiro commit do PR (`docs(adr): ...`) e o código só é revisado depois de ele ser aceito. Bug, refatoração dentro de uma camada e atualização minor não pedem ADR.

## 12. SECURITY.md e Código de Conduta

`SECURITY.md` replica o do CF Jobs: nunca issue pública; relato em `https://github.com/Coding-Ferpa/eventos/security/advisories/new` (Discord em privado como alternativa); confirmação em 3 dias úteis, avaliação em 7 corridos; divulgação só após a correção. Escopo: falha de RLS ou papel, enumeração de participantes pela busca, qualquer caminho que revele CPF, e-mail ou data de nascimento, forja de token, XSS por campo de CSV, injeção de fórmula nas exportações XLSX, upload malicioso de arte ou fonte.

Vazamento de dado pessoal: o relato **não inclui dado real** (descreve o caminho, não cola o resultado), quem pesquisa acessa o mínimo para provar, e dado exposto no próprio repositório entra pelo mesmo canal. Confirmado, segue o procedimento de incidente do doc 08.

`CODE_OF_CONDUCT.md`: Contributor Covenant 2.1 em pt-BR, o texto do CF Jobs com o link de relato deste repositório.
