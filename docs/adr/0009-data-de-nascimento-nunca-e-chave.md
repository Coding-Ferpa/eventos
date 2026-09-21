# ADR-0009 · Data de nascimento nunca é chave de busca sozinha

- **Status:** aceita (o PRD foi atualizado para a versão 1.1)
- **Data:** 2026-09-20
- **Autores:** mantenedor e sessão de arquitetura

## Contexto
O PRD 1.0 permitia ao aluno buscar o certificado por "CPF, nome completo ou data de nascimento", em modo "qualquer um". Em um evento de 300 pessoas entre 17 e 25 anos, a colisão de datas é certa (o que quebra o "resultado 0 ou 1"), e cerca de 3.650 datas cobrem a faixa etária inteira: mesmo com rate limit, é uma varredura viável, e cada acerto devolve nome completo e certificado de uma pessoa, possivelmente menor de idade.

## Decisão
As chaves **independentes** da busca são CPF, e-mail e nome completo normalizado. A data de nascimento existe apenas como:

- **segundo fator do nome** no modo `any`, quando o evento liga `search_birth_date` (nome e nascimento têm de casar juntos);
- **mais um campo exigido** no modo `all`.

Ela também desempata homônimos. Não existe rota, parâmetro ou método de busca que aceite só a data.

## Consequências
- Positivas: o oráculo da busca deixa de ser enumerável na prática (nome completo, CPF e e-mail não são varríveis com 600 palpites por dia); isso é o que permite afrouxar o balde de IP sem risco ([ADR-0006](0006-dois-baldes-de-rate-limit.md)).
- Negativas e trade-offs aceitos: um evento que só coletou nome e data de nascimento não tem chave "fácil de lembrar" além do nome; o aluno com nome digitado errado na planilha não se acha pela data. O caminho dele é o canal de contato do evento e, na fase 2, o link direto por e-mail.

## Alternativas consideradas
- **Manter a data como chave, com rate limit apertado:** o espaço é pequeno demais; nenhum limite compatível com uso honesto impede a varredura.
- **Data mais os 3 últimos dígitos do CPF:** melhora o espaço, mas cria uma segunda semântica de busca para explicar ao aluno; o CPF inteiro já resolve.
