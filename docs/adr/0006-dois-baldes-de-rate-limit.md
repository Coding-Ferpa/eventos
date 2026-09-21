# ADR-0006 · Rate limit da busca em dois baldes: dispositivo e IP

- **Status:** aceita
- **Data:** 2026-09-20
- **Autores:** mantenedor e sessão de arquitetura

## Contexto
O PRD define o limite da busca por IP e por evento: 5 tentativas por minuto e 20 por hora. No dia do evento, 200 alunos saem pelo mesmo IP (Wi-Fi da faculdade, CGNAT das operadoras) no minuto em que o palestrante anuncia os certificados. O limite do PRD bloquearia o auditório inteiro. É uma falha que só aparece quando não dá mais para consertar, e contradiz a armadilha 10 do próprio pedido de arquitetura.

## Decisão
Dois baldes por evento, ambos sobre a função `check_rate_limit` herdada do CF Jobs (Postgres, sem Redis), que ganha o parâmetro `increment` para permitir consulta sem consumo:

| Balde | Chave | Conta | Limites |
|---|---|---|---|
| Dispositivo | HMAC diário do cookie `cf-dispositivo` | toda tentativa | 5 por minuto, 20 por hora, 60 por dia (os números do PRD) |
| IP | HMAC diário do IP | **só falhas** | 20 por minuto, 150 por hora, 600 por dia |

O backoff progressivo vem das janelas aninhadas. O critério de aceite do PRD ("a 6ª tentativa no mesmo minuto recebe 429") continua valendo, por dispositivo.

**O cookie de dispositivo é emitido pelo `proxy.ts` na primeira visita a uma página pública, não na primeira busca.** Se nascesse com a primeira tentativa, a primeira requisição de todo mundo cairia no balde de IP, exatamente no pico que o desenho existe para cobrir. O proxy só acrescenta `Set-Cookie`: a página continua servida do cache de ISR. Requisição sem cookie válido usa a chave `nocookie:{ip_hash}` com os limites estreitos.

## Consequências
- Positivas: uma pessoa não gasta a cota da outra atrás do mesmo NAT; o pico honesto estimado (6 falhas por minuto por IP) fica 3 vezes abaixo do balde de IP; quem descarta cookie para escapar cai no balde de IP, que rende no máximo 600 palpites por dia, inúteis contra nome completo, CPF ou e-mail (a data de nascimento saiu do conjunto de chaves, [ADR-0009](0009-data-de-nascimento-nunca-e-chave.md)).
- Negativas e trade-offs aceitos: o limite por IP é bem mais largo que o do PRD; um cookie de segurança estritamente necessário passa a existir na área pública (documentado em `/privacidade`, sem banner); botnet distribuída não é contida pelos baldes, e na fase 1 fica a cargo do Firewall da Vercel, com disjuntor por evento previsto para o M11.

## Alternativas consideradas
- **Só por IP, com os números do PRD:** bloqueia o auditório.
- **Só por IP, com números largos:** não entrega o critério de aceite do PRD nem freia uma pessoa insistente.
- **CAPTCHA (Turnstile) em toda busca:** atrito no fluxo de 40 segundos e dependência de terceiro; fica como contingência se o abuso aparecer.
- **Redis (Upstash):** serviço a mais sem ganho: o Postgres aguenta 200 upserts em um minuto com folga, e é o padrão da casa.
- **Emitir o cookie na primeira busca ou por uma chamada do cliente ao carregar a página:** recria o problema no primeiro request, ou cria uma corrida entre a chamada e a busca.
