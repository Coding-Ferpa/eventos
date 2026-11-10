# ADR-0018 · Schema próprio no projeto Supabase do CF Jobs

- **Status:** aceita
- **Data:** 2026-11-10
- **Autores:** Claude, com a decisão do mantenedor

## Contexto

Os docs previam um projeto Supabase só do Eventos, em `sa-east-1` (docs 01 e 02). Na ida ao ar, o mantenedor decidiu usar o projeto que já roda o CF Jobs em produção (`cf-jobs-core`, também em `sa-east-1`), com o Eventos num schema próprio, sem apagar nem misturar o que é do CF Jobs.

Inspecionado em 2026-11-10, só com consultas de leitura, o projeto mostrou que trocar o nome do schema não basta. Quatro coisas são uma só por projeto:

1. **Histórico de migrations.** A CLI do Supabase controla o que já foi aplicado pela versão, na tabela `supabase_migrations.schema_migrations`. As do CF Jobs se chamam `0001` a `0013`, os mesmos números das do Eventos: o `db push` daqui diria "em dia" e não criaria nada, e qualquer versão nova de um repositório quebraria o `db push` do outro.
2. **Nomes no `public`.** Catorze objetos têm o mesmo nome nos dois sistemas, entre eles `profiles`, o tipo `user_role`, `audit_logs`, `rate_limits`, `check_rate_limit`, `authorize`, `custom_access_token` e a trigger `on_auth_user_created` em `auth.users`.
3. **Auth.** Os usuários, a Site URL e o Custom Access Token Hook são do projeto. Os dois apps liam o papel do mesmo claim, `user_role`, que o hook do CF Jobs preenche com o papel do CF Jobs. Num Auth compartilhado, um admin do CF Jobs entraria como admin no Eventos, onde há CPF pseudonimizado e data de nascimento de menor de idade.
4. **Storage e chaves.** O nome de bucket é único no projeto, e a chave de serviço e a senha do `postgres` servem aos dois sistemas.

## Decisão

**O Eventos mora inteiro no schema `eventos`, aplica as próprias migrations com histórico próprio, e tira o papel de uma tabela sua, e não do token.**

- **Schema `eventos`.** Tabelas, views, tipos, funções, triggers, políticas de RLS e jobs do `pg_cron` do Eventos ficam nele. O `public` não recebe nada. O schema repete as permissões que o Supabase dá ao `public` (uso e privilégios padrão para `anon`, `authenticated` e `service_role`), para que a RLS, e não a falta de permissão, continue sendo o que decide, como a matriz do pgTAP sempre testou.
- **Fora da Data API.** O `eventos` não entra nos schemas expostos do PostgREST. Isso cumpre o motivo do [ADR-0012](0012-consulta-publica-privilegiada-e-data-api-desligada.md) (nenhuma função do Eventos vira endpoint público) sem desligar a Data API, que é decisão do CF Jobs.
- **Migrations fora de `supabase/migrations`.** Elas moram em `supabase/migrations-eventos/`, onde a CLI não as vê, e o `pnpm db:migrar` as aplica em ordem, cada uma numa transação, registrando versão e sha256 em `eventos.schema_migrations`. Migration já aplicada com conteúdo diferente é recusada. O mesmo comando roda no banco local e no remoto (`--remote`), pela CLI já logada, como `postgres`: o caminho de produção é o de todo dia.
- **Papel pela tabela.** `eventos.profiles` guarda o papel no Eventos. O `getCurrentUser` usa o token só para saber quem é a pessoa (`sub`) e lê o papel da tabela; a função `eventos.authorize` faz o mesmo para a RLS e o Storage. O claim `user_role` do token é ignorado. Não há trigger do Eventos em `auth.users`: quem não tem linha em `eventos.profiles` não tem acesso, e a linha é criada por um admin do Eventos (pelo SQL do runbook, até existir a tela de papéis do M11). Também não há hook do Eventos.
- **Buckets com prefixo.** `eventos-covers`, `eventos-previews`, `eventos-templates` e `eventos-fonts`, com as políticas do `storage.objects` também prefixadas.
- **Local imita o pior caso.** No banco local, um hook que imita o do CF Jobs põe `user_role = 'admin'` em todo token. Os testes de autorização passam com ele ligado: é a prova permanente de que o claim do outro sistema não abre o Eventos.

## Consequências

- Positivas: o CF Jobs não é tocado (nem o `public`, nem o hook, nem o histórico de migrations, nem a trigger dele); o Eventos não depende do papel que o CF Jobs dá a ninguém; e o caminho de migrations de produção passa a ser exercitado no banco local e no CI.
- **Negativa aceita pelo mantenedor, LGPD:** o Auth, a chave de serviço e a senha do `postgres` são compartilhados. Quem tiver uma dessas credenciais do CF Jobs alcança os dados do Eventos, e um vazamento do CF Jobs é também um incidente do Eventos ([doc 08](../08-seguranca-e-lgpd.md)). Uma pessoa com conta no CF Jobs entra no Eventos com o mesmo e-mail e senha, mas sem papel nenhum.
- Negativas operacionais: o `db push`, o `migration repair` e o `db reset --remote` da CLI **nunca** rodam a partir deste repositório contra o projeto. Eles operam o histórico do CF Jobs, e o `migration repair` que a CLI sugere quando estranha o histórico o corromperia. A trigger do CF Jobs em `auth.users` cria um perfil no CF Jobs (sem acesso) para cada conta que o Eventos abrir no painel.
- O plano gratuito deixa de limitar: um projeto atende os dois.
- Revisitar quando houver orçamento para um projeto só do Eventos. A migração é exportar o schema `eventos` e os quatro buckets; o código não muda.

## Alternativas consideradas

- **Projeto Supabase próprio** (o que os docs previam): isolamento total e nenhuma linha de código a mudar. Recusada pelo mantenedor para a ida ao ar.
- **Claim com nome próprio (`eventos_role`) no token:** exigiria mudar o hook do CF Jobs, que é um só por projeto, e acoplaria a autorização de um sistema à função do outro.
- **Versões de migration com carimbo de data no histórico da CLI:** cada `db push` de um repositório passaria a falhar por causa das versões do outro.
