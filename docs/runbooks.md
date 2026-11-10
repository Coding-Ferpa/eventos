# Runbooks

Procedimentos de operação do CF Eventos em produção. Este documento nasce no M9, pela ida ao ar; as seções que ainda faltam estão listadas no fim.

O Eventos mora no projeto Supabase do CF Jobs (`cf-jobs-core`, `sa-east-1`), inteiro no schema `eventos` ([ADR-0018](adr/0018-schema-proprio-no-projeto-do-cf-jobs.md)). Tudo o que é do projeto (o Auth, o hook do token, a Site URL, a Data API, o histórico de migrations da CLI e o schema `public`) é do CF Jobs, e este runbook não mexe em nada disso.

## Resumo de uma página

A ida ao ar tem sete etapas, nesta ordem, porque cada uma depende da anterior.

| Etapa | Onde | O que sai dela |
|---|---|---|
| 1. Banco | terminal e painel do Supabase | o schema `eventos` com as 14 migrations e o sentinela, e o Auth aceitando o endereço do Eventos |
| 2. Segredos | terminal | quatro segredos novos, só do Eventos, e o `CPF_PEPPER` guardado por dois admins |
| 3. Vercel | painel da Vercel | variáveis só em Production, deploy verde em `gru1` com Node 26 |
| 4. Domínio | DNS do `codingferpa.org` | `eventos.codingferpa.org` servindo o site |
| 5. Conferência | navegador | o sentinela `DEM0CF2026` validando |
| 6. Primeiro admin | SQL Editor | a sua conta entrando em `/admin` |
| 7. Primeiro evento | `/admin` | modelo publicado, planilha importada, certificados liberados |

Quatro regras que não têm exceção:

1. **Deste repositório, nunca `supabase db push`, `supabase migration repair`, `supabase db reset --remote` nem `--include-seed`.** Esses comandos operam o histórico de migrations do projeto, que é do CF Jobs, e o `migration repair` que a CLI sugere quando estranha o histórico o corromperia. As migrations do Eventos vão só pelo `pnpm db:migrar --remote`.
2. **No Auth, não trocar a Site URL, o hook do token, nem a opção de cadastro.** São do CF Jobs. O Eventos só acrescenta o próprio endereço na lista de redirecionamento.
3. **O `CPF_PEPPER` é gerado uma vez e nunca muda.** Trocar ou perder o pepper invalida a busca por CPF de todos os eventos já importados, e não há como recalcular ([ADR-0005](adr/0005-hmac-com-salt-por-evento.md)).
4. **A Preview da Vercel nunca recebe as variáveis de banco.** Ela sobe sem banco e mostra o site vazio ([ADR-0014](adr/0014-site-vazio-quando-nao-ha-banco.md)).

## 1. Banco

### 1.1 Ligar a CLI ao projeto

Uma vez por máquina, na raiz do repositório, com o Node 26:

```bash
pnpm exec supabase login
```

```bash
pnpm exec supabase link dculmejrmmgrqfmybijp
```

### 1.2 Aplicar as migrations

Veja o plano antes. Sem `--yes`, o comando só lê o histórico numa transação somente leitura:

```bash
pnpm db:migrar --remote
```

**A primeira aplicação já foi feita em 2026-11-10**, com o sentinela. Hoje o esperado é `Target: project cf-jobs-core (dculmejrmmgrqfmybijp) · production` e `14 aplicada(s), 0 pendente(s)`, e não há nada a aplicar. Num banco sem o Eventos, o plano mostraria `0 aplicada(s), 14 pendente(s)`, de `0000_schema` a `0013_cron`, e a aplicação, com o seed do sentinela, seria:

```bash
pnpm db:migrar --remote --yes --seed-producao
```

Cada migration roda inteira numa transação: se uma falhar, nada dela fica, e as anteriores continuam valendo. Rodar de novo aplica só o que falta, e o sentinela usa `on conflict do nothing`.

O que isso cria, e só isso: o schema `eventos` com tabelas, funções, RLS e o histórico próprio (`eventos.schema_migrations`); os buckets `eventos-covers`, `eventos-previews`, `eventos-templates` e `eventos-fonts`, com as políticas deles; e cinco jobs do `pg_cron` com prefixo `cf-eventos:`. As extensões que as migrations pedem já existem no projeto e não mudam. Nada vai para o `public`, nem para o `auth`.

Migration nova, depois da ida ao ar: o mesmo par de comandos, **antes** do deploy do código que depende dela (o `pnpm check:migrations` do CI barra o que quebraria a versão em produção).

### 1.3 Auth

No painel do projeto `cf-jobs-core`, menu lateral **Authentication**, **URL Configuration**, acrescente em Redirect URLs. Não é a página **OAuth Apps** das configurações da organização: aquela publica um app com acesso à API de gerenciamento do Supabase, e o Eventos não precisa de nenhum.

- `https://eventos.codingferpa.org/auth/callback`

Se for testar o login pelo endereço `*.vercel.app` antes do domínio, acrescente também `https://<o-endereço>.vercel.app/auth/callback`: o login volta para o endereço de onde saiu.

Não troque a Site URL. Em **Sign In / Providers**, veja o que já está ligado (é configuração do CF Jobs). O Eventos entra por dois caminhos:

- **GitHub**, se estiver ligado: é o recomendado, porque a sua conta já existe e não há senha nova (etapa 6);
- **Email**, para login com e-mail e senha.

O hook do token é do CF Jobs, e o Eventos o ignora de propósito: o papel no Eventos vem de `eventos.profiles`.

### 1.4 Data API

Não desligue a Data API: ela é do CF Jobs. Em Project Settings (ou Integrations), **Data API**, confira só que `eventos` **não** está em Exposed schemas. Fora dessa lista, nenhuma função ou tabela do Eventos vira endpoint ([ADR-0012](adr/0012-consulta-publica-privilegiada-e-data-api-desligada.md)).

### 1.5 O que a Vercel vai precisar do projeto

- **Connect**, aba **Transaction pooler** (porta **6543**): a string de conexão, com a senha do banco no lugar de `[YOUR-PASSWORD]`. Se a senha tiver `@`, `:`, `/`, `?` ou `#`, troque cada um pelo código de URL (`@` vira `%40`). É o `DATABASE_URL`. A conexão direta (porta 5432) não serve: o app foi feito para o pooler em modo transaction.
- **Project Settings, API Keys:** a URL (`https://dculmejrmmgrqfmybijp.supabase.co`), a **Publishable key** e a **Secret key**, ou o par legado `anon` e `service_role`, sem misturar.

São as mesmas credenciais do CF Jobs: é o preço aceito no ADR-0018. Elas ficam só no ambiente de Production da Vercel.

## 2. Segredos

Gere quatro valores, um de cada vez, com o Node 26:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

| Variável | Para que serve | Pode trocar depois? |
|---|---|---|
| `CPF_PEPPER` | chave do HMAC do CPF | **nunca** |
| `RETRIEVAL_COOKIE_KEY` | cifra o cookie da tela de retirada | sim (quem está na tela busca de novo) |
| `DEVICE_COOKIE_SECRET` | assina o cookie de dispositivo do rate limit | sim (os limites recomeçam) |
| `IP_HASH_SECRET` | hash diário do IP | sim |

São do Eventos: não reaproveite os do CF Jobs. **Antes de qualquer importação, guarde o `CPF_PEPPER` no gerenciador de senhas de dois admins**, com o nome "CF Eventos, CPF_PEPPER (nunca rotacionar)".

Não use os valores do `.env.example`: começam com `desenvolvimento-local-`, estão no repositório, e o app se recusa a subir na Vercel com eles.

## 3. Vercel

### 3.1 O projeto

O projeto já está ligado ao repositório. Em Settings, Git, a Production Branch é `main`. O primeiro deploy falhou por falta das variáveis, que é o esperado: em produção, o app recusa subir sem banco.

### 3.2 Variáveis de ambiente

Em Settings, Environment Variables, cada uma marcando **só Production**:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | a string do Transaction pooler (1.5) |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://dculmejrmmgrqfmybijp.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | a Publishable key (ou a `anon` legada) |
| `SUPABASE_SERVICE_ROLE_KEY` | a Secret key (ou a `service_role` legada) |
| `CPF_PEPPER` | o da etapa 2 |
| `RETRIEVAL_COOKIE_KEY` | o da etapa 2 |
| `DEVICE_COOKIE_SECRET` | o da etapa 2 |
| `IP_HASH_SECRET` | o da etapa 2 |

E `NEXT_PUBLIC_SITE_URL` = `https://eventos.codingferpa.org` em **Production e Preview** (a Preview precisa dela para o build, e de mais nada).

Para entrar com o GitHub (etapa 6), também em Production: `SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID`, com o Client ID que aparece em Authentication, Sign In / Providers, GitHub. É só ele que faz o botão aparecer no login; a troca com o GitHub é toda do Supabase.

Opcionais, podem vir depois: `RESEND_API_KEY`, `EMAIL_FROM` e `ADMIN_NOTIFICATION_EMAIL` (seção 8). Sem elas o pedido de correção de nome é gravado e só o aviso por e-mail não sai.

Na mesma página, deixe marcado **Automatically expose System Environment Variables** (o padrão): a guarda que distingue produção de Preview lê o `VERCEL_ENV`.

### 3.3 Deploy e conferência do build

Deployments, o último deploy de `main`, **Redeploy**. No log do build, confira:

- **Node:** `v26.x`, lido do `engines` do `package.json`.
- **pnpm:** `11.28.11`, a do `packageManager`. A Vercel começa com o pnpm 9 ou 10 pelo formato do lockfile, e o pnpm 10 troca sozinho para a versão fixada. Se o log mostrar o pnpm 9 e a instalação falhar, em Settings, Build and Deployment, ligue o override do Install Command com `npx --yes pnpm@11.28.11 install --frozen-lockfile` e faça o redeploy.
- **Região:** em Settings, Functions, **São Paulo (`gru1`)**, que vem do `vercel.json`.

## 4. Domínio

1. Settings, Domains, **Add**, `eventos.codingferpa.org`.
2. Crie no DNS do `codingferpa.org` exatamente o registro CNAME que a Vercel mostrar.
3. Espere **Valid Configuration**. O HTTPS sai sozinho.

O endereço entra no QR de todo certificado: precisa estar no ar, e igual ao `NEXT_PUBLIC_SITE_URL`, antes do primeiro certificado ser liberado.

## 5. Conferência

| Abrir | Esperado |
|---|---|
| `https://eventos.codingferpa.org/` | o catálogo carrega |
| `https://eventos.codingferpa.org/validar/DEM0CF2026` | "Certificado válido", com o Participante de Demonstração |
| `https://eventos.codingferpa.org/validar/ZZZZZZZZZZ` | "Não encontramos esse código", e não erro 500 |
| `https://eventos.codingferpa.org/login` | a tela de login |

E confira que o CF Jobs continua no ar, em `vagas.codingferpa.org`. Se algo der erro no Eventos, o motivo está em Vercel, Logs; os erros de configuração do app dizem qual variável falta.

## 6. Primeiro admin

O acesso ao admin do Eventos é uma linha em `eventos.profiles`, com o papel. Ter conta no Auth não basta, e o papel do CF Jobs não conta: um admin do CF Jobs entra no Eventos sem acesso nenhum até ganhar a linha.

1. **A conta.** Com o GitHub (recomendado): entre em `https://eventos.codingferpa.org/login` pelo botão do GitHub, com a mesma conta do CF Jobs. Vai abrir a home, sem acesso: é o esperado. Com e-mail e senha: em Authentication, Users, **Add user**, com **Auto Confirm User**; se o e-mail já existir (porque a pessoa entra no CF Jobs pelo GitHub), use o GitHub.
2. **O papel.** No SQL Editor, troque o e-mail e o nome e rode:

   ```sql
   insert into eventos.profiles (id, display_name, role)
   select id, 'Seu nome', 'admin'
     from auth.users
    where email = 'seu-email@exemplo.org'
   on conflict (id) do update set role = excluded.role;
   ```

3. **Confira:**

   ```sql
   select u.email, p.role
     from eventos.profiles p
     join auth.users u on u.id = p.id;
   ```

4. Entre de novo em `/login`. Deve abrir o `/admin`.

Para as outras pessoas da organização, o mesmo SQL, com `'editor'` (cadastra eventos, modelos e planilhas). `admin` só para quem também precisa ver `/admin/usuarios`, apagar evento em rascunho ou modelo, e remover certificado depois da liberação. Tirar o acesso é apagar a linha: `delete from eventos.profiles where id = ...`.

## 7. Primeiro evento

O que separar antes:

- **A arte** de cada tipo de certificado: PDF de 1 página (2 com verso), que é o recomendado, ou PNG/JPG com o lado maior de pelo menos 1.200 px (2.000 px ou mais para impressão). Sem rotação, sem senha, até 3 MB.
- **A planilha** de inscritos em CSV (no Excel, "CSV UTF-8" ou "CSV separado por vírgulas"; os dois funcionam), até 2 MB e 5.000 linhas, com cabeçalho na primeira linha. Nome completo é obrigatório. CPF, e-mail e data de nascimento são opcionais, mas é por eles que a pessoa vai buscar o certificado.

Os passos, todos em `/admin`:

1. **Eventos, Novo evento:** título, início e término, local, cidade. **Criar evento.** Ele nasce em rascunho, fora do site.
2. Na página do evento, seção **Dados:** o **E-mail de contato**. É para ele que vai a dúvida de quem não se achou e o aviso de pedido de correção.
3. Seção **Busca:** marque as chaves que a planilha tem. Com CPF na planilha, CPF é a melhor. A data de nascimento nunca é chave sozinha, só junto do nome ([ADR-0009](adr/0009-data-de-nascimento-nunca-e-chave.md)). **Salvar busca.**
4. Seção **Modelos de certificado:** dê um nome em "Nome do modelo novo" e **Criar modelo**. No editor: **Enviar a arte**; **Posicionar o nome**, **Posicionar o código** e **Posicionar o QR** (os três são obrigatórios para publicar); ajuste as caixas pelos números ao lado, com a prévia acompanhando; **Testar com o nome mais longo deste evento**; **Salvar rascunho** e **Publicar**.
5. Seção **Tipos de participação:** em cada tipo que terá certificado, escolha o modelo e confira a carga horária padrão.
6. **Importar participantes:** escolha de quem é a lista, envie o CSV, confira se os acentos apareceram certos e qual coluna é o quê, e olhe a prévia: os contadores, as linhas com erro (cada uma diz o motivo) e as que pedem decisão. **Aplicar a importação.** Reimportar o mesmo arquivo não duplica ninguém.
7. Seção **Certificados:** **Liberar certificados.** Se faltar alguma coisa, a tela lista tudo de uma vez. Liberado, a busca aparece na página pública do evento e os códigos passam a valer na validação.
8. Teste como aluno, de preferência no celular: abra `/eventos/<endereço-do-evento>`, busque a si mesmo, baixe o PDF e valide o código pelo QR.

O link para divulgar é o da página do evento.

## 8. E-mail de aviso (Resend), opcional no lançamento

1. No Resend, Domains, acrescente `codingferpa.org` e crie no DNS os registros que ele mostrar (SPF e DKIM). Espere **Verified**: e-mail sem SPF e DKIM cai no spam.
2. API Keys, uma chave com permissão só de envio.
3. Na Vercel, só Production: `RESEND_API_KEY`, `EMAIL_FROM` (`Coding Ferpa <certificados@codingferpa.org>`) e `ADMIN_NOTIFICATION_EMAIL` (para onde vai o aviso quando o evento não tem e-mail de contato). Redeploy.

## 9. Se o Supabase pausar

O plano gratuito pausa o projeto depois de uma semana sem atividade. Como o projeto é dividido com o CF Jobs, a atividade de um mantém os dois de pé. Se pausar assim mesmo, os dois sistemas caem juntos: no painel do Supabase, **Restore project**, e confira a etapa 5 e o CF Jobs.

## Pendências deste runbook

Do escopo do M9 ([doc 14](14-prompt-de-execucao-opus-5.md)), ainda não escritas:

- incidente (vazamento com e sem o pepper, comunicação à ANPD, [doc 08](08-seguranca-e-lgpd.md)), agora considerando que um vazamento de credencial do CF Jobs também é incidente do Eventos (ADR-0018);
- pedido de eliminação LGPD, com a decisão sobre a `erase_participant` rodada à mão no console ([doc 08](08-seguranca-e-lgpd.md));
- o workflow `smoke-producao.yml`;
- as cinco verificações manuais do [doc 11](11-qualidade.md), registradas aqui depois de feitas com um certificado real.
