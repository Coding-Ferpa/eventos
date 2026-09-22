# 00 · Visão geral

## O que é

O CF Eventos entrega certificados dos eventos da Coding Ferpa (Fernandópolis/SP) sem trabalho manual por aluno. A organização cadastra o evento, sobe a arte do certificado, posiciona os campos sobre ela e importa a lista de participantes por CSV. O aluno, sem login, encontra o certificado com um dado que já tem na cabeça, confere o nome em uma prévia e baixa o PDF gerado na hora. Qualquer secretaria confere a autenticidade em uma página pública, pelo código ou pelo QR.

O documento de produto é o [PRD](spec-produto.md). Este conjunto de documentos é a arquitetura: aqui se decide **como**.

## O problema, em uma frase

O esforço da organização hoje é linear no número de participantes, e o aluno que fica sem o PDF perde o prazo de lançar horas complementares. O evento acaba bem e a entrega arrasta.

## Objetivos e o que cada um exige da arquitetura

| Objetivo do PRD | O que isso impõe |
|---|---|
| 300 certificados com menos de 15 minutos de trabalho humano | importação com prévia confiável e idempotente; liberação em um clique; nada gerado por pessoa |
| Aluno retira em menos de 1 minuto, sem cadastro | busca exata sem login; prévia leve em SVG; PDF sob demanda em cerca de 150 ms; nada que dependa de e-mail |
| Certificado verificável | código legível por humano e imutável; página de validação dinâmica; estado "revogado" distinto de "inexistente" |
| Nome certo na primeira tentativa | pedido de correção gravado na plataforma desde a fase 1; correção mantém o código e incrementa a versão |
| Segundo evento custa minutos | modelo declara os próprios campos; preset de mapeamento preso ao modelo; clonar evento copia tudo que não é pessoa |

## Personas e o que elas ditam

| Persona | Contexto | Consequência de projeto |
|---|---|---|
| **Aluno** (volume) | 17 a 25 anos, celular, rede móvel, chega pelo WhatsApp ou pelo Instagram, não cria conta | orçamento de performance de celular em 4G lento; nenhuma biblioteca pesada no caminho público; aviso de navegador embutido; parte do público é menor de idade, o que pesa em toda decisão de dado |
| **Palestrante, organizador, monitor** (poucos, visíveis) | certificado com texto e carga horária próprios; compartilham no LinkedIn | tipos de participação com modelo próprio; conteúdo dinâmico por certificado; uma pessoa pode ter dois certificados no mesmo evento |
| **Admin** (2 a 5 pessoas) | confortável com computador, não com tecnologia; trabalha às 23h da véspera | toda operação destrutiva tem prévia; erro fala a língua dele e cita a linha da planilha; editar um modelo publicado não quebra quem está baixando |
| **Secretaria** (validador) | recebe o PDF ou o papel, não instala nada | código que se dita por telefone; QR legível impresso; página sem login e sem jargão |

## Escopo

**Fase 1 (o primeiro evento precisa disto):** catálogo e página de evento, busca e retirada, PDF sob demanda, modelos com campos por formulário, importação de CSV, validação pública, tipos de participação, admin com papéis, identidade visual. Mais três itens que a revisão de arquitetura puxou para cá: o **registro** do pedido de correção de nome (sem a tela de fila), a notificação por e-mail desse pedido, e a ação simples de **revogar e restaurar** um certificado (o estado "revogado" já é critério de aceite da validação no P0, e é a saída quando a remoção é recusada).

**Fase 2:** arrastar campos sobre a prévia, e-mail em massa com link direto, fila de correção de nome, revogação completa (o link direto deixa de funcionar), "meus certificados", clonar evento.

**Fase 3:** dashboard, exportações, LinkedIn.

Faseamento e critérios de pronto no [doc 13](13-roadmap.md).

## Não-objetivos

Os do PRD, que valem sem ressalva: inscrição e ingressos, controle de presença, editor gráfico tipo Canva, login de aluno, multi-tenant, assinatura ICP-Brasil.

Os que a arquitetura acrescenta, para que ninguém os construa por engano:

- **API pública de leitura.** Os dados são de pessoas. Cada endpoint é superfície de enumeração ([doc 07](07-apis-e-actions.md)).
- **Busca aproximada para o público.** Nada de "você quis dizer", trigrama ou fonética fora do admin.
- **Texto rico dentro de um campo** (negrito no meio de uma frase). O nome vai em linha própria.
- **Rasterização no servidor.** Nenhum Chromium, `node-canvas` ou `sharp` no runtime.
- **CPF completo impresso no certificado.** Só a máscara `***.***.**1-45`. O completo é decisão futura com ADR.
- **Ambiente de staging com banco.** O plano gratuito não comporta ([doc 02](02-arquitetura.md)).
- **PDF pré-gerado ou cacheado no Storage** (P2 do PRD): o desenho permite, não é construído.

## Princípios de projeto

1. **Simplicidade primeiro.** Um app, um banco, um deploy. Código legível por contribuidor júnior vale mais que código elegante. Abstração só onde há lógica de domínio de verdade: o motor de certificado e o parser de CSV.
2. **O dado pessoal que não existe não vaza.** CPF só em HMAC, arquivo CSV nunca persistido, logs sem PII, nenhuma resposta pública com identificador interno.
3. **O admin vê antes de acontecer.** Importação tem prévia; modelo tem teste com o nome mais longo; publicar é um ato separado de salvar; o que foi visto é o que é aplicado, ou nada é aplicado.
4. **O que está no papel continua valendo.** Código imutável, correção por versão, revogado e removido são estados, não ausências.
5. **O pico é o caso normal.** Duzentas pessoas no mesmo Wi-Fi, no mesmo minuto, é o dia de uso do produto, não uma exceção. Rate limit, cache de módulo e orçamento do PDF foram desenhados para esse minuto.
6. **O gerador não sabe de onde vieram os números.** Formulário e arrastar escrevem a mesma estrutura. Isso é o que permite entregar a fase 1 sem o editor caro.
7. **Mesma casa, mesmos hábitos.** Stack, esqueleto de Server Action, RLS junto da tabela, design system e governança do CF Jobs, sem reinvenção.

## Divergências do PRD, já aprovadas pelo mantenedor

O PRD foi atualizado para a versão 1.1 com estes pontos.

| Ponto | Decisão | Onde |
|---|---|---|
| Busca só por data de nascimento | removida: nascimento é segundo fator, nunca chave | [ADR-0009](adr/0009-data-de-nascimento-nunca-e-chave.md) |
| Rate limit por IP | dois baldes: dispositivo (números do PRD) e IP (largo, só falhas) | [ADR-0006](adr/0006-dois-baldes-de-rate-limit.md) |
| `sha256(cpf + pepper + salt)` | HMAC-SHA256 com o pepper como chave | [ADR-0005](adr/0005-hmac-com-salt-por-evento.md) |
| CSV com colunas fixas | colunas dinâmicas declaradas pelo modelo; conteúdo no certificado | [ADR-0004](adr/0004-payload-dinamico-no-certificado.md) |
| Botão "Meu nome está errado" na fase 1 | grava o pedido e notifica; a fila é fase 2 | [doc 07](07-apis-e-actions.md) |
| CPF no certificado | só mascarado | [doc 05](05-motor-de-certificados.md) |
| "Pixel-equivalente com 1%" | garantido por construção e verificado por números, sem rasterizador no CI | [doc 05](05-motor-de-certificados.md) |
| R16, parâmetros do LinkedIn | o PRD cita o formato legado (`pfCertificationName`, `_ed`); o formato atual usa `startTask=CERTIFICATION_NAME`, `name`, `organizationId`, `issueYear`, `issueMonth`, `certUrl`, `certId`. Conferir na documentação do LinkedIn no M12, antes de implementar. | [doc 09](09-frontend-e-seo.md) |

## Questões em aberto e como o projeto segue sem elas

| Questão | Quem destrava | O que muda com a resposta | Como seguimos enquanto isso |
|---|---|---|---|
| Planilha real do Ferpa Tech Day: colunas, e se tem CPF ou nascimento | organização | **Com CPF:** ele ancora busca e conciliação. **Só nome e e-mail:** regras 3 e 4 da conciliação viram o caminho principal e os avisos de homônimo ganham peso. Nos dois casos, zero mudança de código. | campos de busca são configuração por evento; fixture `ferpa-tech-day.anon.csv` fica pendente |
| Quantos modelos o primeiro evento terá e quais campos de conteúdo cada um pede | organização | define os modelos do seed de desenvolvimento e os textos de ajuda do editor | `data_fields` são dinâmicos: qualquer resposta cabe |
| Formato da arte (PDF vetorial, PNG, Canva) | mantenedor | **PDF:** caminho recomendado. **PNG pesado:** pode estourar os 3 MB e pedir reexportação. | `buildBasePdf` aceita os três e explica o erro |
| Número de participantes | mantenedor | acima de 90, o envio em massa leva mais de um dia no plano gratuito | fila com teto diário desde o início; e-mail é fase 2 |
| Data prometida dos certificados | organização | é o único prazo duro: decide se algo da fase 1 precisa encolher | produção (M9) vem logo depois da fase 1 funcional, antes de qualquer conforto |
| Texto jurídico no verso | organização | nenhum impacto: é arte, e o modelo já suporta duas páginas | |
| Página da Coding Ferpa no LinkedIn | mantenedor | pré-requisito do M12, não de código | |
