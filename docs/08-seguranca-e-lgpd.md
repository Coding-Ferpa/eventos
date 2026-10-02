# 08 · Segurança e LGPD

Modelo mental herdado do CF Jobs: **o Postgres é a última linha de defesa.** O que muda aqui é a natureza do dado: o CF Jobs guarda vagas públicas; o CF Eventos guarda nome, e-mail, data de nascimento e um derivado do CPF de estudantes, parte deles menores de idade. Toda decisão deste documento parte daí.

## Autenticação e papéis

Supabase Auth com e-mail e senha e GitHub OAuth, sessão em cookies via `@supabase/ssr`, Custom Access Token Hook injetando `user_role` no JWT, `proxy.ts` apenas redirecionando não autenticados de `/admin` para `/login`, logout com `scope: 'local'`. Tudo igual ao CF Jobs.

O cadastro é aberto (consequência do OAuth), então todo usuário novo nasce `reader`, que **não acessa nada**. O PRD define dois papéis de trabalho:

| Capacidade | reader | editor | admin |
|---|---|---|---|
| Área pública | sim | sim | sim |
| Entrar em `/admin` | não | sim | sim |
| Eventos, tipos, modelos, fontes: criar e editar | não | sim | sim |
| Importar CSV, editar participante e certificado, liberar certificados | não | sim | sim |
| Revogar e restaurar certificado (motivo obrigatório) | não | sim | sim |
| Remover certificados **antes** da liberação do evento | não | sim | sim |
| Remover certificados **depois** da liberação, apagar evento, apagar modelo | não | não | sim |
| Eliminação LGPD de um participante | não | não | sim |
| Gerir papéis de usuários | não | não | sim |
| Campanhas de e-mail, fila de correção, exportações (P1) | não | sim | sim |

Mudança de papel exige novo login (sessão de 1 h), trade-off herdado e aceito.

## Três modos de acesso ao banco

| Modo | Quem usa | Como | O que protege |
|---|---|---|---|
| Leitura pública de catálogo | páginas de evento, sitemap | `queryAsAnon` (`set local role anon`), RLS aplicada | um filtro esquecido não vaza rascunho |
| Consulta pública de pessoa | busca, tela de retirada, download, validação, pedido de correção | conexão privilegiada, **somente** por `src/db/queries/public-lookup.ts`, depois do rate limit, devolvendo projeções em lista branca | `anon` não tem nenhuma policy em `participants` nem `certificates` |
| Admin | Server Actions e páginas de `/admin` | conexão privilegiada, **depois** de sessão e papel verificados (`defineAction`, guard do layout) | autorização de aplicação, com a RLS documentando a intenção |

Regra de lint (`no-restricted-imports`): `public-lookup.ts` só pode ser importado por `src/app/api/certificados/**`, `src/app/(public)/validar/**`, `src/app/(public)/eventos/[slug]/certificado/**` e `src/app/(public)/certificado/**`. Cada função desse arquivo tem o tipo de retorno escrito à mão (nunca `typeof tabela.$inferSelect`), e um teste afirma que nenhum retorno tem as chaves `id`, `participant_id`, `cpf_hash`, `email` ou `birth_date`.

**Data API desligada.** O app não usa PostgREST: fala com o Postgres por Drizzle, e o supabase-js faz só Auth e Storage. Em produção a Data API do projeto Supabase é desativada (item do runbook do M9). Motivo: a `anon key` é pública por natureza, e com a Data API ligada qualquer função executável por `anon` vira endpoint sem o nosso rate limit. A RLS segue em todas as tabelas e testada por pgTAP, porque é o que segura se alguém religar a API.

A matriz completa de RLS por tabela e por papel está no [doc 04](04-banco-de-dados.md#rls-matriz-completa).

## CPF: HMAC com pepper e salt por evento

```
cpf_hash  = hex( HMAC-SHA256( key = CPF_PEPPER, message = event.cpf_salt + ':' + cpf_11_digitos ) )
cpf_last3 = últimos 3 dígitos
```

- **HMAC e não `sha256(concatenação)`** ([ADR-0005](adr/0005-hmac-com-salt-por-evento.md)): é a construção padrão para hash com chave, sem ambiguidade de concatenação e sem extensão de comprimento. Mesma intenção do PRD, construção correta.
- **`CPF_PEPPER`**: 32 bytes aleatórios em base64, só em env da Vercel (marcada como sensível). Nunca vai para o banco, nunca aparece em log, e o HMAC é calculado em TypeScript (`hmacCpf`, em `lib/hmac.ts`) justamente para o pepper não trafegar em SQL. A chave do HMAC é o **texto** do env como está, sem decodificar o base64, igual aos outros HMACs do projeto. Como o pepper nunca muda, essa escolha também não pode mudar: um teste a fixa com um vetor calculado pelo `openssl`.
- **`cpf_salt`**: 16 bytes por evento. Garante que o mesmo CPF tenha hashes diferentes em eventos diferentes: um vazamento não permite cruzar presença entre eventos sem o pepper.
- **O pepper não pode ser rotacionado nem perdido.** Trocar o pepper invalida a busca por CPF de todos os eventos passados, e não há como recalcular porque o CPF não existe mais. Ele fica guardado no gerenciador de senhas de dois admins (runbook). Se vazar, a resposta é tratar como incidente (abaixo), não rotacionar em silêncio.
- **Honestidade sobre o que isso é:** pseudonimização, não anonimização. O espaço de CPFs válidos tem 10⁹ elementos; com o pepper na mão, um atacante reverte a base em minutos, e `cpf_last3` reduz cada busca a cerca de 10⁶ candidatos. O modelo de ameaça coberto é **vazamento do banco sem vazamento do env**, que é o cenário comum (dump, backup, SQL injection, acesso indevido ao painel). Para a LGPD, `cpf_hash` continua sendo dado pessoal.
- **Busca:** normaliza para 11 dígitos, valida os dígitos verificadores **antes** de tocar o banco (CPF impossível responde `validation_error` sem gastar consulta), calcula o HMAC com o salt do evento, compara por igualdade no índice único.
- **"Meus certificados" (R13, P1):** um HMAC por evento com certificados disponíveis, e uma consulta `where (event_id, cpf_hash) in (...)`. Com centenas de eventos ainda são microssegundos de CPU.
- **Guardrail de conteúdo:** CPF é sempre campo de identidade, nunca `data_field`. Chaves reservadas e detecção por valor na importação ([doc 05](05-motor-de-certificados.md), [doc 06](06-importacao-csv.md)).
- **CPF impresso:** o modelo pode usar `{{participant.cpf_masked}}` (`***.***.**1-45`). CPF completo impresso é decisão futura com ADR (cifrado em repouso com chave em env, usado só na renderização, nunca em busca nem em resposta). O modelo de dados não impede ([doc 04](04-banco-de-dados.md)).

## Enumeração: a busca pública é um oráculo

Não há como ter busca sem login e sem oráculo. O que se faz é tornar o oráculo inútil para varredura:

1. **Resultado é 0 ou 1 pessoa.** Nunca lista, nunca sugestão, nunca autocomplete, nunca contagem. Mais de um casamento (`ambiguous`, o caso dos homônimos) responde **exatamente** como `not_found`: mesmo status, mesmo corpo. A diferença só existe em `search_attempts`.
2. **Igualdade sobre valor normalizado inteiro.** `full_name_normalized = normalize_person_name($entrada)`. Nome parcial não encontra. Não há `like`, `ilike`, trigrama nem `soundex` em nenhum caminho público.
3. **Data de nascimento nunca é chave sozinha** ([ADR-0009](adr/0009-data-de-nascimento-nunca-e-chave.md)). Em um evento de 300 pessoas de 17 a 25 anos a colisão é certa, e cerca de 3.650 datas varrem a lista inteira, devolvendo nome e certificado de menores. Ela existe como segundo fator do nome (`any`) ou como campo exigido (`all`).
4. **Chaves independentes aceitas:** CPF (10⁹ de espaço), e-mail (só quem já sabe o e-mail consulta) e nome completo (o que se obtém é "fulano esteve no evento X", que a página de validação já mostra a quem tem o código).
5. **Rate limit em dois baldes** (abaixo).
6. **Auditoria sem PII:** toda tentativa vira `search_attempts` com método, desfecho, `ip_hash` e `device_hash`. O valor buscado nunca é gravado nem logado.
7. **Nenhum identificador interno sai.** A resposta de sucesso é um cookie opaco; URLs usam o código de validação, que é público por desígnio.
8. **Tempo de resposta uniforme:** o handler sempre calcula o HMAC e sempre consulta, encontrando ou não. Nenhum atalho de "evento sem CPF cadastrado".

## Rate limit

Implementação herdada: função SQL `check_rate_limit` sobre a tabela `rate_limits`, janela deslizante em 10 sub-baldes, `on conflict` atômico, sem Redis. Acréscimo: parâmetro `increment` (padrão 1); com 0 a função só consulta. Isso permite baldes que contam **apenas falhas**: consulta antes, consome depois, só se falhou.

### Por que dois baldes ([ADR-0006](adr/0006-dois-baldes-de-rate-limit.md))

No dia do evento, 200 alunos saem pelo mesmo IP (Wi-Fi da faculdade, CGNAT das operadoras). O limite do PRD, aplicado por IP, bloquearia o auditório inteiro no minuto em que o palestrante anuncia os certificados. É uma falha que só aparece quando não dá mais para consertar.

| Balde | Chave | Conta | Limites (todas as janelas valem juntas) |
|---|---|---|---|
| Dispositivo | `search:dev:{event_id}:{device_hash}` | toda tentativa | **5 por minuto, 20 por hora**, 60 por dia (os números do PRD) |
| IP | `search:ip:{event_id}:{ip_hash}` | **só falhas** (`not_found`, `ambiguous`) | 20 por minuto, 150 por hora, 600 por dia |

O pico honesto estimado é de 200 buscas em 5 minutos com 15% de falha: 6 falhas por minuto saindo de um único IP. O balde de IP tem folga de 3 vezes sobre isso. O balde de dispositivo mantém o critério de aceite do PRD ("a 6ª tentativa no mesmo minuto recebe 429") para cada pessoa, sem que uma pessoa gaste a cota da outra. Quem descarta o cookie para escapar do balde de dispositivo cai no balde de IP, que rende no máximo 600 palpites por dia: inútil contra nomes completos, CPFs ou e-mails, agora que a data de nascimento saiu do jogo.

**Backoff progressivo** vem das janelas aninhadas: estourar o minuto custa até 60 s; insistir estoura a hora; insistir mais estoura o dia. O `Retry-After` devolvido é o da maior janela estourada, e a mensagem em pt-BR diz quanto falta ("Muitas tentativas. Tente de novo em 40 segundos.").

### O cookie de dispositivo nasce na primeira visita

`cf-dispositivo = v1.{id de 128 bits}.{emitido_em}.{HMAC com DEVICE_COOKIE_SECRET}`, `HttpOnly`, `Secure`, `SameSite=Lax`, 30 dias. **É emitido pelo `proxy.ts` na primeira resposta de `/`, `/eventos/*`, `/validar*` e `/meus-certificados`**, e não na primeira busca, e reemitido quando o que o navegador manda não vale mais (vencido, forjado, segredo trocado). Se nascesse junto com a primeira tentativa, a primeira requisição de todo mundo cairia no balde de IP, exatamente no pico que ele existe para cobrir. O proxy só acrescenta `Set-Cookie` à resposta: a página continua estática e servida do cache de ISR (mesmo mecanismo com que o CF Jobs já injeta a CSP em rota pública).

Fora da produção e sem banco (a Preview da Vercel), o proxy não emite o cookie: sem banco não há busca nem rate limit para ele servir ([ADR-0014](adr/0014-site-vazio-quando-nao-ha-banco.md)).

Requisição de busca sem cookie válido (curl, cookies bloqueados, assinatura inválida) usa como chave de dispositivo `nocookie:{ip_hash}`: os limites estreitos do PRD, compartilhados por IP. Navegador honesto nunca chega aí, porque passou por uma página antes. É cookie estritamente necessário de segurança: não pede banner de consentimento, e está descrito em `/privacidade`.

`device_hash = HMAC(IP_HASH_SECRET, id + dia UTC)` e `ip_hash = HMAC(IP_HASH_SECRET, ip + dia UTC)`: giram a cada dia, então servem para limitar e para correlacionar tentativas dentro de um dia, e não para seguir alguém por semanas. O IP vem de `x-forwarded-for` (primeiro endereço), que na Vercel é confiável. IP bruto nunca é persistido.

### Demais superfícies

| Superfície | Limite |
|---|---|
| Download do PDF | 10 por minuto por dispositivo; 120 por minuto por IP |
| `/validar/{codigo}` | 30 por minuto e 300 por hora por IP (enumerar 50 bits é inviável; o limite protege o banco) |
| Pedido de correção | 3 por dia por certificado; 5 por dia por dispositivo |
| "Meus certificados" (P1) | os dois baldes da busca, com `event_id = all` |
| `/certificado/{token}` (P1) | 20 por minuto por IP |
| Importação e upload (admin) | 30 por hora por usuário |
| Login | Supabase Auth (limites nativos) |
| Borda | Vercel Firewall: bloqueio de bots agressivos e challenge em pico anômalo |

**Reforço P1 (M11), não construído na fase 1:** disjuntor por evento. Mais de 300 falhas em 5 minutos somando todos os IPs (10 vezes o pico honesto) aperta o balde de IP daquele evento para os números do PRD por 15 minutos e notifica o admin. Cobre botnet distribuída, que na fase 1 fica a cargo do Firewall da Vercel.

## Token de retirada e tokens de acesso direto

### Cookie de retirada ([ADR-0010](adr/0010-token-de-retirada-em-cookie-cifrado.md))

O sucesso da busca emite `cf-retirada`: payload `{ v: 1, pids: string[], src, exp }` **cifrado com AES-256-GCM** (`RETRIEVAL_COOKIE_KEY`, 32 bytes; IV aleatório de 12 bytes por emissão), formato `v1.{iv}.{ciphertext+tag}` em base64url. `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, **30 minutos**.

- É ele que autoriza a tela de retirada, a prévia, o download e o pedido de correção. Não autoriza nada no admin.
- **Opaco de verdade:** cifrado, não apenas assinado. O critério "nenhuma resposta expõe id de participante" vale até para quem abre o DevTools.
- Sem estado: nenhuma tabela de sessões para limpar. A revogação dentro dos 30 minutos é coberta porque o download **sempre** relê a situação do certificado.
- Cookie em vez de token na URL: não entra em histórico, log de acesso nem `Referer`, e o download funciona com um link comum (o que importa no iOS).
- `pids` é lista desde já para que "Meus certificados" (P1) não mude o formato. Máximo de 40.
- `src` registra como a pessoa chegou: `search_cpf`, `search_email`, `search_name`, `search_all`, `token` ou `mine`. Serve à métrica de origem do download e a uma regra de exibição: "CPF terminado em 145" só aparece na tela quando `src` é `search_cpf` ou `mine`. Quem chegou pelo nome não ganha 3 dígitos do CPF de ninguém.
- **`Secure` sempre, menos em http no próprio localhost** (`lib/cookies/seguro.ts`; vale também para o `cf-dispositivo`). Medido no M8: o WebKit guarda o cookie `Secure` recebido por `http://localhost` e nunca o devolve por http, e as E2E do iPhone rodam no `pnpm start`; a busca dava 200 e a tela de retirada voltava como sessão expirada. O Chromium trata localhost como contexto seguro, por isso só o WebKit quebrava. Produção nunca é localhost, e qualquer outro host, até em http, continua com `Secure`.

Autorização do download: o certificado do `{codigo}` da URL precisa pertencer a um participante em `pids`. Código válido de outra pessoa responde 404, igual a código inexistente.

### Token de acesso direto por e-mail (P1)

| Propriedade | Valor |
|---|---|
| Formato | 32 bytes do CSPRNG em base64url (43 caracteres), 256 bits |
| URL | `/certificado/{token}` |
| Armazenamento | só `sha256(token)` em `participant_access_tokens`. O token em claro existe apenas no e-mail. |
| Escopo | um participante em um evento (abre todos os certificados ativos dele naquele evento) |
| Expiração | 180 dias após o envio; reenvio gera token novo e revoga o anterior |
| Revogação | `revoked_at`; revogar o último certificado ativo do participante também inutiliza o link (R12) |
| Uso | a rota valida, troca o token pelo cookie de retirada e redireciona com 303 para `/eventos/{slug}/certificado`. O token sai da barra de endereços na hora. `Referrer-Policy: no-referrer` nessa rota. |

Sha256 simples basta aqui (ao contrário do CPF) porque o token tem 256 bits de entropia: não há o que atacar por força bruta.

## OWASP Top 10 aplicado

| Risco | Mitigação específica deste projeto |
|---|---|
| A01 Broken Access Control | RLS em tudo; `anon` só lê `events`; consulta pública confinada a `public-lookup.ts`; download autorizado por cookie cifrado e posse do certificado; pgTAP da matriz |
| A02 Cryptographic Failures | CPF só em HMAC; tokens só em hash; cookie de retirada em AES-GCM; segredos com 32 bytes do CSPRNG; TLS de ponta a ponta |
| A03 Injection | Drizzle parametriza; Zod em toda entrada; Markdown do evento sanitizado (`rehype-sanitize`); **injeção de fórmula em planilha**: exportações XLSX escrevem texto como texto e prefixam com `'` valores que começam com `=`, `+`, `-` ou `@` |
| A04 Insecure Design | resultado 0 ou 1; nascimento nunca é chave; dois baldes; importação com prévia e transação única; código imutável |
| A05 Security Misconfiguration | cabeçalhos herdados (CSP com nonce nas rotas dinâmicas, HSTS, `frame-ancestors 'none'`); o `connect-src` libera a origem do Supabase só nas rotas dinâmicas, onde o admin sobe arquivo por URL assinada; `upgrade-insecure-requests` fora de localhost; Data API desligada; buckets privados para arte e fontes |
| A06 Vulnerable Components | Dependabot e `pnpm audit --prod` bloqueante, herdados |
| A07 Auth Failures | Supabase Auth; cookies `HttpOnly`; nada em `localStorage` |
| A08 Integrity | lockfile; arte do admin normalizada por `embedPage` (JavaScript e formulários do PDF original não chegam ao certificado); fonte enviada é parseada e validada antes de aceita; webhook do Resend com verificação de assinatura |
| A09 Logging Failures | `audit_logs` em toda mutação; `search_attempts`; logs estruturados **sem PII** (nunca nome, e-mail, CPF nem o valor buscado); Sentry com `sendDefaultPii: false` e corpo de requisição removido em `beforeSend` |
| A10 SSRF | o servidor nunca busca URL fornecida por usuário: arte e fontes chegam por upload ao Storage, e o servidor lê só os próprios buckets |

Uploads: tipo conferido por assinatura de bytes (`%PDF-`, PNG, JPEG, `OTTO`/`true`/`0x00010000`), não por extensão; tamanhos máximos de 10 MB (arte), 5 MB (capa) e 2 MB (fonte).

## LGPD

> Nota: esta seção é desenho de engenharia orientado pela lei, não parecer jurídico. A organização deve validá-la com alguém habilitado antes do primeiro evento, em especial a base legal e o prazo de retenção.

### Papéis

Controladora: a organização da Coding Ferpa (com o encarregado indicado em `/privacidade`, com e-mail de contato). Operadores: Supabase (banco, auth, arquivos), Vercel (hospedagem), Resend (e-mail), Sentry (erros, sem PII).

### Dados tratados

| Dado | Titular | Onde | Finalidade |
|---|---|---|---|
| Nome completo | participante | `participants`, staging por até 7 dias | emitir e validar o certificado |
| CPF (só HMAC e 3 dígitos) | participante | `participants` | localizar o certificado; máscara impressa opcional |
| Data de nascimento | participante | `participants` | segundo fator da busca |
| E-mail | participante | `participants`, `email_deliveries` | localizar o certificado; enviar o link |
| Conteúdo do certificado (palestra, turma) | participante | `certificates.data` | imprimir no certificado |
| Contato informado no pedido de correção | participante | `name_correction_requests` | responder ao pedido |
| IP e dispositivo, em hash diário | visitante | `search_attempts`, `rate_limits`, `validation_checks` | segurança e antiabuso |
| E-mail e nome de admins | admin | `auth.users`, `profiles`, `audit_logs` | autenticação e auditoria |

Não há dado pessoal sensível (art. 5º, II). Há dados de adolescentes: a persona começa aos 17 anos.

### Base legal

- **Dados do participante:** execução de contrato ou de procedimentos preliminares a pedido do titular (art. 7º, V). A pessoa se inscreveu em um evento que entrega certificado; emitir e permitir validar esse certificado é o serviço.
- **Logs de segurança e rate limit:** legítimo interesse (art. 7º, IX), com dado minimizado (hash diário).
- **Adolescentes (art. 14):** o tratamento é feito no melhor interesse do titular, com o mínimo de dados e sem exposição pública além do nome na validação, que é a própria finalidade do documento. O formulário de inscrição do evento, que fica fora desta plataforma, precisa informar que os dados serão usados para emitir o certificado: é pré-requisito operacional, registrado no runbook e no texto de ajuda da tela de importação.

### Minimização embutida no desenho

CPF nunca em claro; o arquivo CSV nunca é persistido; a página de validação mostra só nome, evento, tipo, carga horária e datas; nenhuma resposta pública traz e-mail, nascimento ou CPF; logs sem PII; páginas com nome de pessoa são `noindex`; IP só em hash diário.

### Retenção

| Dado | Prazo | Mecanismo |
|---|---|---|
| Identidade de busca (`cpf_hash`, `cpf_last3`, `birth_date`, `email`) | 5 anos após `ends_at` | `minimize_old_participants()` mensal |
| Nome, certificado e código | enquanto o certificado precisar ser verificável (sem prazo automático) | eliminação a pedido |
| `import_rows` | 7 dias após aplicar; 24 h sem aplicar; imediato no descarte | `prune_import_staging()` |
| `search_attempts`, `validation_checks`, `event_visits` | 90 dias | `prune_observability()` |
| `email_deliveries` | 1 ano | poda anual |
| `audit_logs` | 5 anos | poda anual |
| Pedidos de correção | junto com o certificado | cascade |

Cinco anos cobrem o curso de graduação inteiro, que é o período em que as horas complementares são lançadas. Depois disso a busca por dados pessoais deixa de funcionar para aquele evento, e o certificado segue validável pelo código.

### Direitos do titular e o que fazer quando alguém pede remoção

Canal: o e-mail do encarregado em `/privacidade`. Procedimento (runbook):

1. **Confirmar a identidade** sem coletar mais dado do que já existe: o titular informa evento e nome, e responde pelo e-mail que consta na inscrição, ou apresenta o próprio certificado.
2. **Explicar a consequência antes de executar:** a eliminação faz o certificado deixar de ser validável. A página passará a dizer "Este certificado foi removido a pedido do titular". Se o objetivo é só corrigir um nome, o caminho é a correção.
3. **Executar** a action `eraseParticipant` (papel `admin`), que chama `erase_participant()` em uma transação:
   - certificados viram lápide: `status = 'erased'`, `participant_id = null`, `data = '{}'`. Ficam o código, o tipo e as datas, sem nenhum dado pessoal;
   - o participante é apagado, junto com tokens de acesso, pedidos de correção, entregas de e-mail e linhas de staging;
   - os `diff` dos `audit_logs` que citam aquela pessoa são substituídos por `{"scrubbed": true}`. A entrada de auditoria da própria eliminação registra o ator e a data, sem o nome.

   **Pendência do runbook do M9.** A função `erase_participant` não recebe o ator: pela aplicação, quem audita é o `defineAction`. Só que a eliminação por LGPD é justamente a operação com mais chance de ser rodada à mão no console, durante um pedido real, e por ali não fica rastro de quem executou. O runbook do M9 decide entre duas saídas: proibir o caminho manual, ou fazer a função gravar `current_user` na auditoria por conta própria.
4. **Responder ao titular em até 15 dias.**

A lápide existe por honestidade com terceiros: um papel que circula por aí não pode virar "código inexistente" (o que sugere fraude) nem continuar exibindo o nome de quem pediu para sair.

Acesso e correção: o titular vê tudo o que o sistema exibe sobre ele na própria tela de retirada, e corrige o nome pelo botão "Meu nome está errado". Pedidos de acesso ao dado bruto são atendidos pelo encarregado com uma exportação filtrada.

### Incidente

Vazamento de banco sem env: comunicar à ANPD e aos titulares conforme o art. 48, informando que CPFs estavam pseudonimizados com chave não comprometida. Vazamento que inclua `CPF_PEPPER`: tratar os CPFs como expostos. Passos, contatos e modelo de comunicado no runbook do M9.

## Gestão de segredos

Somente em env da Vercel e do GitHub (secrets), nunca no repositório. `.env.example` sem valores reais, exceto segredos **de desenvolvimento** claramente marcados, para que o seed local funcione. `CPF_PEPPER`, `RETRIEVAL_COOKIE_KEY`, `DEVICE_COOKIE_SECRET`, `IP_HASH_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` e `CRON_SECRET` são marcadas como sensíveis. Rotação: todas podem girar a qualquer momento (efeito: cookies em voo expiram, limites reiniciam), **exceto `CPF_PEPPER`**. PR de fork não recebe secrets. O contrato completo está no [doc 01](01-stack.md#variáveis-de-ambiente-contrato).
