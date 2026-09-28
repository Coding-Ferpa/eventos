# 11 · Qualidade e testes

## Estratégia por camada

| Camada | Ferramenta | O que cobre | Onde roda |
|---|---|---|---|
| Lógica pura | Vitest | `features/certificate`, `features/import`, `lib/` (HMAC, cookies, códigos, formatação) | `pnpm test`, sem banco, sem rede |
| Componentes | Vitest + Testing Library (jsdom) | formulário de busca, campo de código, assistente de importação, painéis do editor | `pnpm test` |
| Banco | pgTAP | matriz de RLS, funções, triggers, `revoke` das `security definer` | `pnpm db:test` (Supabase local) |
| Integração | Vitest (`vitest.integration.config.ts`) contra o Supabase local | Server Actions com sessão real em cada papel (login de senha no GoTrue local, herdado do CF Jobs: é o que prova o gate do `defineAction`), importação de ponta a ponta, conciliação, `apply_import`, `public-lookup`, rate limit, eliminação LGPD | `pnpm test:integration` |
| E2E | Playwright (Chromium e WebKit; viewport de celular nos fluxos públicos) | fluxos de usuário numerados abaixo | `pnpm test:e2e` |
| Acessibilidade | `@axe-core/playwright` | páginas públicas e telas-chave do admin | dentro do E2E |
| Performance | Lighthouse CI | orçamentos do [doc 09](09-frontend-e-seo.md) | job `lighthouse` |
| Carga | `scripts/load-test-download.ts` | 100 downloads simultâneos | manual, no M9, contra produção com o certificado sentinela |

Um passo só está concluído quando `pnpm lint && pnpm typecheck && pnpm test` passam. Passo que toca banco exige também `pnpm db:test` e `pnpm test:integration`; passo que toca fluxo de usuário, `pnpm test:e2e`.

## TDD obrigatório

Teste escrito **antes** da implementação, em commits separados quando possível (`test:` e depois `feat:`), para tudo que é lógica pura:

| Módulo | Por que |
|---|---|
| `features/certificate/layout/*` (ajuste de texto, quebra, coordenadas) | é onde o certificado sai errado em público |
| `features/certificate/tokens.ts`, `format.ts`, `code.ts`, `qr.ts`, `etag.ts` | tabelas de casos fechadas |
| `features/certificate/draw/*`, `base-pdf.ts` | matriz PDF-01 a PDF-24 do [doc 05](05-motor-de-certificados.md) |
| `features/certificate/reserved-keys.ts`, `data-schema.ts` | guardrail do CPF |
| `features/import/decode.ts`, `parse.ts`, `mapping.ts`, `validate-row.ts`, `cpf.ts` | fixtures do [doc 06](06-importacao-csv.md) |
| `lib/hmac.ts`, `lib/cookies/*` | criptografia: ida e volta, adulteração, expiração |
| `normalize_person_name`, `compute_import_diff`, `apply_import`, `check_rate_limit` | SQL com tabela de casos em pgTAP ou integração |

UI e CRUD não exigem TDD: teste junto com o código basta.

## Gates inegociáveis do CI

Dois testes têm passo próprio e nomeado no workflow, para que ninguém os desligue dentro de um `vitest run` genérico:

1. **`pnpm test:gate:pdf`** (`pdf-accents.test.ts`): para **cada fonte curada e cada peso**, gera um PDF com `José Gonçalves de Assunção`, extrai o texto com pdf.js e compara byte a byte, e exige a fonte embutida no PDF. Acento quebrado no certificado é constrangimento público; este teste é o seguro.
2. **`pnpm test:gate:csv`** (`csv-encoding.test.ts`): decodifica e faz o parse de `excel-ptbr-cp1252-semicolon.csv`, `excel-csv-utf8-bom-semicolon.csv`, `google-sheets-utf8-comma.csv` e `excel-unicode-utf16le-tab.txt`, e afirma os mesmos nomes acentuados nos quatro.

Outros testes que funcionam como guarda de projeto:

- **`no-plain-cpf`** (integração): CPF marcador percorre a importação inteira e não aparece em nenhuma tabela nem no log.
- **`public-projection`** (unidade): nenhuma função de `public-lookup.ts` devolve `id`, `participant_id`, `cpf_hash`, `email` ou `birth_date`.
- **`public-bundle`** (`check:public-bundle`, pós-build, desde o M6): nenhum chunk de rota fora de `/admin` contém `pdfjs-dist`, `@cantoo/pdf-lib` ou `@cantoo/fontkit`, nem os carrega por `import()`. Cada biblioteca é reconhecida por uma string que sobrevive à minificação; o chunk que a contém fica marcado, e o que carrega um marcado por `import()` também, até o fecho. O script confere que a string ainda existe no pacote (atualização que a mude faria o guarda passar cego) e que todo chunk do manifesto existe no disco. Provado com dois builds sabotados: import estático no `/validar` e `import()` escondido na página do evento. O segundo escapava na primeira versão, porque o manifesto guarda `[slug]` como `%5Bslug%5D`.
- **`env-example`**, **`check:schema`**, **`check:migrations`**: herdados do CF Jobs.
- **`check:fonts`**: toda fonte do catálogo existe em `public/fonts/cert/` e todo TTF da pasta está no catálogo, é TTF estático, tem o peso que o catálogo declara (`usWeightClass`; arquivo trocado de peso sai errado sem erro), cobre os caracteres do português e tem licença em `LICENSES/` e linha no `THIRD_PARTY_NOTICES.md`.
- **`check:fonts-trace`** (pós-build): as TTFs estão no rastro (`.nft.json`) de cada rota de `src/lib/rotas-pdf.ts`, e nenhum `.env` ou `.git/` foi traçado junto ([doc 05](05-motor-de-certificados.md)). Um teste unitário garante que toda rota que chama `generateCertificatePdf` está na lista.

## pgTAP: o que a matriz de RLS afirma

Para cada tabela do [doc 04](04-banco-de-dados.md), com `set role` e claims simulados para `anon`, `reader`, `editor` e `admin`:

- `anon` e `reader` leem `events` fora de `draft` e **nada mais**: zero linhas em `participants`, `certificates`, `import_rows`, `name_correction_requests`, logs e `audit_logs`; nenhum insert, update ou delete aceito em tabela nenhuma.
- `editor` lê e escreve o que a matriz permite e **não** apaga o que é só de `admin`.
- `audit_logs` não aceita update nem delete de ninguém.
- toda função `security definer` tem `execute` revogado de `anon`, `authenticated` e `public`, exceto `check_rate_limit`.
- `certificates.code` e `sequence_number` não mudam por update; `version` sobe quando nome, `hours` ou `data` mudam.
- `normalize_person_name`: a tabela de casos do doc 04.
- toda tabela do schema `public` tem RLS habilitada (consulta ao catálogo: tabela nova sem RLS quebra o CI).

## Specs E2E

Numeradas: os milestones do [doc 14](14-prompt-de-execucao-opus-5.md) citam estes números no Definition of Done.

| # | Spec | Verifica |
|---|---|---|
| E01 | Catálogo | lista eventos publicados; `draft` não aparece; card leva à página do evento |
| E02 | Estados do evento | `draft` → 404; `completed` mostra "Os certificados estão sendo preparados" e nenhum formulário; `archived` mostra o aviso próprio |
| E03 | Tema | escuro por padrão; alternar persiste no cookie `cf-tema` após recarregar; sem flash na primeira pintura |
| E04 | SEO | página do evento tem canonical, Open Graph com capa, JSON-LD `Event` válido; evento sem capa serve a capa gerada (200, imagem) |
| E05 | Login e guarda | `reader` não entra em `/admin`; `editor` entra; `editor` não vê gestão de usuários |
| E06 | CRUD de evento | criar, editar, mudar status; aparece no catálogo na mesma navegação; os 4 tipos padrão existem; a capa enviada sobe ao Storage e a página pública a serve pelo `next/image`; apagar é do admin, só em rascunho. As E2E que criam dados os apagam no fim, direto no banco local |
| E07 | Modelo por formulário | subir arte, declarar um campo de conteúdo, posicionar nome, código e QR por números, ver a prévia mudar, testar o nome mais longo, publicar; modelo sem nome não publica |
| E08 | Importação feliz | CSV do Excel pt-BR: inspeção mostra acentos certos; mapeamento sugerido; prévia com contadores; aplicar; participantes na lista |
| E09 | Reimportação | mesmo arquivo: 0 a criar, 0 a atualizar; arquivo com nome corrigido: 1 a atualizar, com antes e depois |
| E10 | Importação com erros | linha com CPF inválido aparece com número e motivo; as demais entram; possível duplicata bloqueia até decidir |
| E11 | Busca por nome | "maria" não encontra; "MARIA EDUARDA SANTOS" encontra "Maria Eduarda dos Santos"; a resposta de rede não tem id nem lista |
| E12 | Busca por CPF e por e-mail | com e sem máscara; CPF com dígito errado é erro de validação, não "não encontrado" |
| E13 | Rate limit | 6ª tentativa no mesmo minuto recebe 429 com mensagem em pt-BR e tempo de espera; outro dispositivo no mesmo IP continua buscando |
| E14 | Retirada | prévia com o nome, carga horária e tipo; baixar entrega `application/pdf` com o nome de arquivo certo; o texto extraído contém o nome acentuado; segunda requisição com `If-None-Match` recebe 304 |
| E15 | Pessoa com dois certificados | palestrante e organizador: dois cartões, dois PDFs, cargas horárias diferentes |
| E16 | Pedido de correção | abrir o formulário, enviar, ver a confirmação; pedido aparece na página do participante no admin; segundo pedido é recusado com mensagem própria |
| E17 | Correção mantém o código | admin corrige o nome; o mesmo código valida e mostra o nome novo com "dados atualizados"; o PDF novo sai com o nome novo |
| E18 | Validação | código válido; código com `o` no lugar de `0` e minúsculas redireciona para a forma canônica; inexistente mostra "não encontrado" (200, não 500); malformado mostra dica de digitação |
| E19 | Revogação | revogar com motivo; validação mostra "revogado em {data}"; download responde 410; a busca encontra a pessoa e a tela explica |
| E20 | Remoção | antes da liberação: remove selecionados; depois da liberação com download: recusa e oferece revogar |
| E21 | Liberação | `releaseCertificates` falha com a lista do que falta; com tudo certo, muda o status e a busca aparece na página pública |
| E22 | Sessão expirada | tela de retirada sem cookie volta ao evento com aviso |
| E23 | Acessibilidade | axe sem violações sérias ou críticas em `/`, evento, `/validar`, validação, tela de retirada, login, importação e editor |
| E24 | Arrastar (M10) | arrastar e redimensionar a caixa do nome muda os números do formulário; setas do teclado movem 0,1%; o PDF reflete |
| E25 | Link direto (M11) | `/certificado/{token}` abre a retirada sem busca; token revogado mostra a explicação |
| E26 | Fila de correção (M11) | aprovar e rejeitar; aprovado muda o nome e mantém o código |
| E27 | Meus certificados (M11) | CPF com certificados em dois eventos lista os dois; CPF sem nada responde como não encontrado |
| E28 | Exportações e LinkedIn (M12) | XLSX baixa e abre; célula iniciada por `=` sai como texto; o link do LinkedIn tem `certUrl` e `certId` corretos |

Os fluxos públicos (E11 a E19, E22) rodam em viewport de celular (390×844) no WebKit e no Chromium.

## Cobertura mínima

| Escopo | Linhas | Ramos |
|---|---|---|
| `src/features/certificate`, `src/features/import` | 90% | 85% |
| `src/lib` | 80% | 75% |
| `src/actions`, `src/db/queries` | 70% (a integração cobre o resto) | |
| Global | sem meta: cobertura global premia teste inútil de componente | |

Configurado em `vitest.config.ts` com `thresholds` por glob; abaixo disso o CI falha.

## Lighthouse e acessibilidade

`lighthouserc.json` com as URLs `/`, `/eventos/{slug-do-seed}` e `/validar`, perfil mobile, 5 execuções, mediana (com 3, o ruído do modelo simulado mexia a mediana do LCP em até 90 ms entre sessões), asserções do [doc 09](09-frontend-e-seo.md): LCP, CLS e TBT como asserção principal, e os KB de JavaScript como tripwire de regressão ([ADR-0015](adr/0015-orcamento-de-js-sobre-o-piso-do-framework.md)). Rode o Lighthouse no Linux, como o CI: no Windows, o build do Next 16.3 com webpack não pré-carrega fonte nenhuma, porque o plugin do manifesto de fontes compara o caminho do módulo com barra normal, e o FCP local sai uns 300 ms pior.

A E03 verifica o tema na primeira pintura de fato: um `requestAnimationFrame` agendado antes de qualquer script da página tem de encontrar o `data-theme` já aplicado. Os atributos do cookie de dispositivo são conferidos no `Set-Cookie` da resposta, e não no pote de cookies do navegador, porque o WebKit do Playwright fora do macOS reporta todo cookie como `SameSite=None`. axe no Playwright falha em violação `serious` ou `critical`. Revisão manual com leitor de tela (NVDA ou VoiceOver) do fluxo busca → retirada → download, uma vez, no M8, registrada no PR.

## Verificações manuais que não se automatizam

Registradas no runbook, feitas no M9 com um certificado real:

1. O PDF abre no Chrome, no Acrobat, no visualizador nativo do Android e no do iOS (critério de aceite do R3).
2. O QR impresso em papel comum, em A4, é lido pela câmera de um celular de entrada.
3. Alguém da organização que não é dev cadastra um evento e importa uma planilha sozinho, com cronômetro (risco "ninguém além do Edu consegue").
4. Teste de carga: 100 downloads simultâneos do certificado sentinela, p95 < 3 s, zero erro.
5. Fluxo completo aberto a partir de um link no WhatsApp e de um link no Instagram, em Android e iOS.

## Revisão de código

Todo PR responde ao checklist do template ([doc 12](12-open-source-e-governanca.md)): testes, RLS junto da tabela, Zod na entrada, `audit_logs` em toda mutação, nenhum dado pessoal em fixture ou log, texto da UI em pt-BR, documentação e ADR atualizados. A régua de legibilidade é explícita: um contribuidor júnior precisa conseguir ler o diff e entender o porquê.
