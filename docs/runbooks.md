# Runbooks

Procedimentos de operação do CF Eventos em produção. Este documento nasce no M9, pela ida ao ar; as seções que ainda faltam estão listadas no fim.

## Resumo de uma página

A ida ao ar tem sete etapas, nesta ordem, porque cada uma depende da anterior. Conta com uma tarde, quase toda esperando DNS.

| Etapa | Onde | O que sai dela |
|---|---|---|
| 1. Supabase | painel do Supabase e terminal | banco com as 13 migrations, o seed do sentinela, Auth com o hook do papel, Data API desligada |
| 2. Segredos | terminal | quatro segredos novos, e o `CPF_PEPPER` guardado por dois admins |
| 3. Vercel | painel da Vercel | projeto ligado ao repositório, variáveis só em Production, deploy verde em `gru1` com Node 26 |
| 4. Domínio | DNS do `codingferpa.org` | `eventos.codingferpa.org` servindo o site |
| 5. Conferência | navegador | o sentinela `DEM0CF2026` validando |
| 6. Primeiro admin | painel do Supabase e SQL | a sua conta entrando em `/admin` |
| 7. Primeiro evento | `/admin` | modelo publicado, planilha importada, certificados liberados |

Três regras que não têm exceção:

1. **Nunca `supabase db push --include-seed` em produção.** O seed do `config.toml` inclui o `02-dev.sql`, com as contas `admin@cfeventos.local` e a senha `cfeventos-local`, que está no repositório público de qualquer clone. O seed de produção é só o `01-producao.sql`, aplicado à mão (etapa 1.4).
2. **O `CPF_PEPPER` é gerado uma vez e nunca muda.** Trocar ou perder o pepper invalida a busca por CPF de todos os eventos já importados, e não há como recalcular: o CPF não fica guardado ([ADR-0005](adr/0005-hmac-com-salt-por-evento.md)).
3. **A Preview da Vercel nunca recebe as variáveis de banco.** Ela sobe sem banco e mostra o site vazio ([ADR-0014](adr/0014-site-vazio-quando-nao-ha-banco.md)); apontá-la para o Supabase de produção exporia dado pessoal em qualquer PR.

## 1. Supabase

### 1.1 Criar o projeto

1. Em [supabase.com/dashboard](https://supabase.com/dashboard), **New project**, na organização da Coding Ferpa.
2. Nome `cf-eventos`. Região **South America (São Paulo)**, que é a `sa-east-1` do [doc 02](02-arquitetura.md). Plano gratuito.
3. Gere a senha do banco pelo botão do próprio painel e guarde no gerenciador de senhas antes de continuar: ela entra no `DATABASE_URL` e no `supabase link`.
4. Anote o **Reference ID** do projeto (Project Settings, General). É o `<REF>` dos comandos abaixo.

### 1.2 Aplicar as migrations

No terminal, na raiz do repositório, com o Node 26:

```bash
pnpm exec supabase login
```

```bash
pnpm exec supabase link <REF>
```

O `link` pede a senha do banco do passo 1.1. Antes de aplicar, veja o que vai entrar:

```bash
pnpm exec supabase db push --remote --dry-run
```

A lista tem de ser exatamente as 13 migrations, de `0001_extensions.sql` a `0013_cron.sql`. Se estiver certa:

```bash
pnpm exec supabase db push --remote
```

A CLI 3 mostra o alvo (`Target:`) e pergunta uma vez, com "não" como resposta padrão: confira que o alvo é o projeto de produção e responda `y`. Sem `--remote`, a CLI 3 aplica no banco **local**.

Se parar em `0001_extensions.sql` por causa do `pg_cron`: em Database, Extensions, ligue o `pg_cron` e rode o `db push --remote` de novo. As migrations usam `if not exists` e continuam de onde pararam.

O que as migrations já criam sozinhas: as tabelas com RLS, os buckets `covers`, `previews`, `templates` e `fonts` com as políticas deles, e os cinco jobs do `pg_cron` (estatísticas, podas e minimização). Confira em Storage (quatro buckets) e em Integrations, Cron (cinco jobs com prefixo `cf-eventos:`).

### 1.3 Não aplicar o seed de desenvolvimento

Repetindo a regra 1: **sem** `--include-seed`. O `db push` acima não aplica seed nenhum, e é assim que tem de ser.

### 1.4 Aplicar o seed do sentinela

O sentinela é um evento arquivado com um certificado de código `DEM0CF2026`, que serve para conferir que a validação pública está no ar sem expor ninguém ([doc 12](12-open-source-e-governanca.md)).

1. Abra `supabase/seeds/01-producao.sql` no editor e copie o arquivo inteiro.
2. No Supabase, SQL Editor, New query, cole e clique em **Run**. Resposta esperada: `Success. No rows returned`.

O arquivo usa `on conflict do nothing`, então rodar duas vezes não duplica nada.

### 1.5 Auth

Em Authentication:

1. **URL Configuration:** Site URL `https://eventos.codingferpa.org`. Em Redirect URLs, acrescente `https://eventos.codingferpa.org/auth/callback` (só é usado pelo login com GitHub, mas deixa pronto).
2. **Auth Hooks:** Add a new hook, **Customize Access Token (JWT) Claims**, tipo Postgres, schema `public`, função `custom_access_token`. **Sem este passo, ninguém entra no admin:** é o hook que põe o papel (`user_role`) no token, e a autorização inteira lê dele ([doc 08](08-seguranca-e-lgpd.md)).
3. **Sign In / Providers:** Email ligado. **Allow new users to sign up desligado.** Recomendação para o lançamento: entrar só com e-mail e senha, com as contas criadas por você no painel (etapa 6). O cadastro aberto só faz sentido com o login pelo GitHub, que é opcional e pode vir depois (seção 8).

### 1.6 Desligar a Data API

Em Project Settings (ou Integrations), **Data API**: desligue **Enable Data API** e salve. O app não usa o PostgREST: fala com o banco pelo Drizzle, e o supabase-js faz só Auth e Storage, que continuam funcionando. Com a Data API ligada, qualquer função executável por `anon` vira endpoint público sem o nosso rate limit ([ADR-0012](adr/0012-consulta-publica-privilegiada-e-data-api-desligada.md)).

### 1.7 Copiar o que a Vercel vai precisar

- **Connect**, aba **Transaction pooler** (porta **6543**): a string de conexão, com a senha do passo 1.1 no lugar de `[YOUR-PASSWORD]`. Se a senha tiver `@`, `:`, `/`, `?` ou `#`, troque cada um pelo código de URL (`@` vira `%40`, por exemplo). Este é o `DATABASE_URL`. A conexão direta (porta 5432) não serve: o app foi feito para o pooler em modo transaction (`prepare: false`).
- **Project Settings, API Keys:** a **URL** do projeto, a **Publishable key** e a **Secret key**. Servem também as chaves antigas da aba Legacy (`anon` e `service_role`); use um par só, não misture.

## 2. Segredos

Gere quatro valores, um de cada vez, com o Node 26 (funciona no PowerShell e no Git Bash):

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Cada execução dá um valor diferente. Um para cada:

| Variável | Para que serve | Pode trocar depois? |
|---|---|---|
| `CPF_PEPPER` | chave do HMAC do CPF | **nunca** |
| `RETRIEVAL_COOKIE_KEY` | cifra o cookie da tela de retirada | sim (quem está na tela busca de novo) |
| `DEVICE_COOKIE_SECRET` | assina o cookie de dispositivo do rate limit | sim (os limites recomeçam) |
| `IP_HASH_SECRET` | hash diário do IP | sim |

**Antes de qualquer importação, guarde o `CPF_PEPPER` no gerenciador de senhas de dois admins**, com o nome "CF Eventos, CPF_PEPPER (nunca rotacionar)". É o único segredo cuja perda não tem conserto.

Não use os valores do `.env.example`: eles começam com `desenvolvimento-local-`, estão no repositório, e o app se recusa a subir na Vercel com eles.

## 3. Vercel

### 3.1 Importar o repositório

1. Em [vercel.com/new](https://vercel.com/new), **Import Git Repository**. O repositório é privado, na conta Coding-Ferpa: se ele não aparecer, instale o app da Vercel no GitHub da organização com acesso ao `eventos`.
2. Framework **Next.js** (detectado). Root Directory `./`. Build e Install sem override: a Vercel roda o script `build` do `package.json` (`next build --webpack`) e instala com pnpm.
3. Em Environment Variables, nesta tela, ponha **só** `NEXT_PUBLIC_SITE_URL` = `https://eventos.codingferpa.org`.
4. **Deploy.** Este primeiro build **vai falhar**, e é o esperado: em produção, o app recusa subir sem banco. Ele serve para criar o projeto sem que nenhum segredo vá para a Preview.

### 3.2 Variáveis de ambiente

Em Settings, Environment Variables, acrescente cada uma marcando **só Production**:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | a string do Transaction pooler (1.7) |
| `NEXT_PUBLIC_SUPABASE_URL` | a URL do projeto (1.7) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | a Publishable key (ou a `anon` legada) |
| `SUPABASE_SERVICE_ROLE_KEY` | a Secret key (ou a `service_role` legada) |
| `CPF_PEPPER` | o da etapa 2 |
| `RETRIEVAL_COOKIE_KEY` | o da etapa 2 |
| `DEVICE_COOKIE_SECRET` | o da etapa 2 |
| `IP_HASH_SECRET` | o da etapa 2 |

E confira que `NEXT_PUBLIC_SITE_URL` está em **Production e Preview** (a Preview precisa dela para o build, e de mais nada).

Opcionais, podem vir depois sem redeploy de código: `RESEND_API_KEY`, `EMAIL_FROM` e `ADMIN_NOTIFICATION_EMAIL` (seção 7). Sem elas o pedido de correção de nome é gravado normalmente e só o aviso por e-mail não sai.

Na mesma página, deixe marcado **Automatically expose System Environment Variables** (é o padrão): a guarda que distingue produção de Preview lê o `VERCEL_ENV`.

### 3.3 Redeploy e conferência do build

Deployments, o deploy que falhou, **Redeploy**. No log do build, confira três linhas:

- **Node:** `v26.x`, lido do `engines` do `package.json`.
- **pnpm:** `11.28.11`, a do `packageManager`. A Vercel começa com o pnpm 9 ou 10 pelo formato do lockfile, e o pnpm 10 troca sozinho para a versão fixada. Se o log mostrar o pnpm 9 e a instalação falhar, em Settings, Build and Deployment, ligue o override do Install Command com `npx --yes pnpm@11.28.11 install --frozen-lockfile` e faça o redeploy.
- **Região:** em Settings, Functions, a região tem de ser **São Paulo (`gru1`)**. Ela vem do `vercel.json`.

## 4. Domínio

1. Settings, Domains, **Add**, `eventos.codingferpa.org`.
2. A Vercel mostra um registro CNAME. Crie exatamente esse registro no DNS do `codingferpa.org`, onde ele estiver hospedado.
3. Espere o painel mostrar **Valid Configuration**. O certificado HTTPS sai sozinho.

O endereço entra no QR de todo certificado: ele precisa estar no ar, e igual ao `NEXT_PUBLIC_SITE_URL`, antes do primeiro certificado ser liberado.

## 5. Conferência

Com o domínio no ar:

| Abrir | Esperado |
|---|---|
| `https://eventos.codingferpa.org/` | o catálogo carrega |
| `https://eventos.codingferpa.org/validar/DEM0CF2026` | "Certificado válido", com o Participante de Demonstração |
| `https://eventos.codingferpa.org/validar/ZZZZZZZZZZ` | "Não encontramos esse código", e não erro 500 |
| `https://eventos.codingferpa.org/login` | a tela de login |

Se algo der erro, o motivo está em Vercel, Logs. Os erros de configuração do app dizem qual variável falta e de onde copiá-la.

## 6. Primeiro admin

Toda conta nasce sem acesso (`reader`), e a troca de papel ainda é feita no banco: a tela `/admin/usuarios` só lista as contas.

1. No Supabase, Authentication, Users, **Add user**, **Create new user**. Seu e-mail e uma senha nova, com **Auto Confirm User** marcado.
2. No SQL Editor, troque o e-mail e rode:

   ```sql
   update public.profiles
      set role = 'admin'
    where id = (select id from auth.users where email = 'seu-email@exemplo.org');
   ```

3. Confira:

   ```sql
   select u.email, p.role
     from public.profiles p
     join auth.users u on u.id = p.id;
   ```

4. Entre em `https://eventos.codingferpa.org/login`. Deve abrir o `/admin`.

Se o login funcionar mas o admin recusar o acesso, falta o hook do passo 1.5: ligue-o, saia e entre de novo. O papel vai no token, e o token só é refeito no login.

Para as outras pessoas da organização, o mesmo caminho, com `role = 'editor'` (cadastra eventos, modelos e planilhas). `admin` só para quem também precisa ver `/admin/usuarios`, apagar evento em rascunho ou modelo, e remover certificado depois da liberação.

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

## 8. Opcionais do lançamento

### Login com GitHub

1. No GitHub da organização, Settings, Developer settings, OAuth Apps, New. Homepage `https://eventos.codingferpa.org`, callback `https://<REF>.supabase.co/auth/v1/callback`.
2. No Supabase, Authentication, Sign In / Providers, GitHub: ligue e cole o Client ID e o Client Secret.
3. Na Vercel, `SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID` e `SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET`, só Production, e redeploy: o botão do GitHub só aparece no login com elas.
4. Ligue **Allow new users to sign up** (1.5): com o GitHub, a primeira entrada cria a conta. Ela nasce sem acesso, e o papel continua sendo dado pelo SQL da etapa 6.

### E-mail de aviso (Resend)

1. No Resend, Domains, acrescente `codingferpa.org` e crie no DNS os registros que ele mostrar (SPF e DKIM). Espere **Verified**: e-mail sem SPF e DKIM cai no spam.
2. API Keys, uma chave com permissão só de envio.
3. Na Vercel, só Production: `RESEND_API_KEY`, `EMAIL_FROM` (`Coding Ferpa <certificados@codingferpa.org>`) e `ADMIN_NOTIFICATION_EMAIL` (para onde vai o aviso quando o evento não tem e-mail de contato). Redeploy.

## 9. Se o Supabase pausar

O plano gratuito pausa o projeto depois de uma semana sem atividade. Pausado, o site mostra erro em toda página que lê o banco, inclusive a validação.

1. No painel do Supabase, o projeto aparece como pausado: **Restore project**. Leva alguns minutos.
2. Confira a etapa 5.

O smoke diário do M9 (pendente, abaixo) faz uma leitura por dia e evita a pausa.

## Pendências deste runbook

Do escopo do M9 ([doc 14](14-prompt-de-execucao-opus-5.md)), ainda não escritas:

- incidente (vazamento com e sem o pepper, comunicação à ANPD, [doc 08](08-seguranca-e-lgpd.md));
- pedido de eliminação LGPD, com a decisão sobre a `erase_participant` rodada à mão no console ([doc 08](08-seguranca-e-lgpd.md));
- o workflow `smoke-producao.yml`;
- as cinco verificações manuais do [doc 11](11-qualidade.md), registradas aqui depois de feitas com um certificado real.
