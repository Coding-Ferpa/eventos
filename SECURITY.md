# Política de Segurança

## Como reportar uma vulnerabilidade

**Não abra uma issue pública.** Issues são visíveis a todos e expõem o problema antes de existir correção.

Use o [relato privado de vulnerabilidade do GitHub](https://github.com/Coding-Ferpa/eventos/security/advisories/new) (aba **Security**, depois _Report a vulnerability_). O relato fica visível apenas para você e para as pessoas mantenedoras.

Se não conseguir usar esse canal, procure uma pessoa mantenedora em privado pelo Discord da comunidade Coding Ferpa, sem detalhes técnicos na mensagem inicial.

## Dado pessoal no relato

Esta plataforma guarda nome, e-mail, data de nascimento e um derivado do CPF de estudantes, parte deles menor de idade. Por isso:

- **Descreva o caminho, não cole o resultado.** "A busca por nome devolve pessoa que não deveria" é relato completo; a lista devolvida não precisa vir junto.
- Ao pesquisar, acesse o mínimo necessário para provar a falha, e pare aí.
- Se encontrar dado real publicado por engano no próprio repositório (fixture, issue, screenshot), reporte pelo mesmo canal: também é incidente.

## O que incluir no relato

- Onde está o problema (rota, arquivo, endpoint ou tela).
- Passos para reproduzir, com o mínimo necessário.
- Qual o impacto: o que uma pessoa mal-intencionada consegue ler, alterar ou derrubar.
- Versão ou commit em que você reproduziu.

## O que esperar

| Etapa                          | Prazo alvo                                                               |
| ------------------------------ | ------------------------------------------------------------------------ |
| Confirmação de recebimento     | 3 dias úteis                                                             |
| Avaliação inicial e severidade | 7 dias corridos                                                          |
| Correção ou plano de mitigação | conforme severidade; críticas têm prioridade sobre qualquer outra tarefa |

Divulgamos a falha publicamente (advisory e release) somente depois da correção disponível. Quem reportar recebe crédito no advisory, salvo se preferir anonimato.

## Escopo

Interessa especialmente:

- Falha de RLS ou de verificação de papel que permita ler ou alterar dado além do papel do usuário.
- **Enumeração de participantes pela busca pública**: qualquer caminho que devolva lista, contagem, sugestão de nome ou resposta que diferencie "não existe" de "existe mais de um".
- Qualquer caminho que revele CPF, e-mail, data de nascimento ou identificador interno em resposta pública, log ou mensagem de erro.
- Forja do cookie de retirada, do cookie de dispositivo ou do token de acesso direto por e-mail.
- XSS por campo vindo de CSV, e injeção de fórmula nas exportações XLSX.
- Upload malicioso de arte de certificado ou de fonte.
- Escalonamento de privilégio pelos custom claims do JWT.

Fora de escopo: ataques que exijam acesso físico à máquina da vítima, engenharia social contra mantenedores, resultado de scanner automático sem prova de exploração, e relato de força bruta em endpoint já protegido por rate limit.

## Versões suportadas

O projeto está em desenvolvimento inicial: correções são aplicadas na branch `main` e publicadas no próximo release. Não há suporte a versões anteriores.
