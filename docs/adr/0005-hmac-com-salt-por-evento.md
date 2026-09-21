# ADR-0005 · CPF em HMAC-SHA256 com pepper em env e salt por evento

- **Status:** aceita
- **Data:** 2026-09-20
- **Autores:** mantenedor e sessão de arquitetura

## Contexto
O CPF é a melhor chave de busca e de conciliação, e é o dado mais perigoso da base, que inclui menores de idade. O PRD pedia `sha256(cpf + pepper + salt_do_evento)`. O espaço de CPFs válidos tem só 10⁹ elementos: um hash sem segredo é reversível em minutos.

## Decisão
`cpf_hash = hex(HMAC-SHA256(key = CPF_PEPPER, message = event.cpf_salt + ':' + cpf))`, calculado em TypeScript (o pepper nunca trafega em SQL). `CPF_PEPPER` tem 32 bytes e vive só em env; `cpf_salt` tem 16 bytes por evento, em `events`, e **não é copiado ao clonar**. Guarda-se também `cpf_last3`, para confirmação na tela e para a máscara impressa `***.***.**1-45`.

O pepper **nunca é rotacionado nem pode ser perdido**: o CPF original não existe para recalcular. Fica guardado por dois admins (runbook do M9).

## Consequências
- Positivas: vazamento do banco sem vazamento do env não revela CPFs; o salt por evento impede cruzar presença entre eventos; HMAC é a construção padrão para hash com chave (sem ambiguidade de concatenação, sem extensão de comprimento).
- Negativas e trade-offs aceitos: é pseudonimização, não anonimização, e continua sendo dado pessoal para a LGPD; com o pepper vazado a base é reversível; "Meus certificados" (P1) precisa de um HMAC por evento, o que custa microssegundos; o certificado não pode imprimir o CPF completo, só a máscara, e o formato habitual `***.456.789-**` é impossível de propósito, porque exigiria guardar 6 dígitos e derrubaria o espaço de busca para mil candidatos.

## Alternativas consideradas
- **`sha256` de concatenação (PRD):** mesma intenção, construção mais frágil.
- **KDF lenta (argon2, scrypt):** encareceria a importação e "meus certificados" sem mudar o cenário decisivo, porque 10⁹ candidatos caem mesmo com KDF para quem tem o pepper e hardware.
- **CPF cifrado de forma reversível:** o sistema não precisa ler o CPF de volta; guardar algo reversível aumenta a superfície sem necessidade. Fica como caminho futuro, com ADR próprio, se uma secretaria exigir o CPF completo impresso (coluna `cpf_encrypted`, usada só na renderização).
- **Salt global:** permitiria correlacionar a mesma pessoa entre eventos em um vazamento.
