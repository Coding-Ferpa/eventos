# 09 · Frontend, páginas e SEO

Identidade visual, tokens e especificação de UX dos componentes estão no [doc 03](03-design-system.md). Este documento trata de rotas, renderização, metadados, acessibilidade e orçamento de performance.

## Mapa de rotas

| Rota | Renderização | Indexável | Observações |
|---|---|---|---|
| `/` | ISR (tag `events`, 1 h) | sim | catálogo: eventos fora de `draft` e de `archived`, mais recentes primeiro; hero "Seu certificado, na hora." |
| `/eventos/[slug]` | ISR (tags `events`, `event:{slug}`) | sim | `draft` e inexistente → 404. Bloco de ação conforme o status. |
| `/eventos/[slug]/opengraph-image` | `ImageResponse`, em cache por tag | n/a | 1200×630, título, data, identidade da comunidade |
| `/eventos/[slug]/capa` | `ImageResponse`, em cache por tag | n/a | 1600×900, usada quando `cover_path` é null: nunca há imagem quebrada |
| `/eventos/[slug]/certificado` | **dinâmica** | **não** (`noindex, nofollow`) | tela de retirada; sem cookie válido redireciona para o evento com `?sessao=expirada` |
| `/validar` | estática | sim | formulário de código |
| `/validar/[codigo]` | **dinâmica, nunca em cache** | **não** | exibe nome de pessoa: `noindex` e `X-Robots-Tag` |
| `/certificado/[token]` (P1) | Route Handler | não | troca token por cookie e redireciona |
| `/meus-certificados` (P1) | estática (form) e dinâmica (resultado) | form sim, resultado não | |
| `/privacidade` | estática | sim | o que é coletado, base legal, encarregado, cookies usados |
| `/login` | dinâmica | não | |
| `/admin/**` | dinâmica (`force-dynamic` no layout) | não | `robots.txt` bloqueia; guard de papel no layout |

Regra de ouro herdada: **nada de `cookies()` ou `headers()` em layout ou página pública ISR.** Tema por script inline; cookie de dispositivo pelo proxy; "sessão expirada" lida de `searchParams` só em componente cliente.

### Bloco de ação da página do evento

Os textos de cada estado são a microcopy final do [doc 03](03-design-system.md), seção 7; esta tabela diz só o que aparece.

| `event_status` | O que aparece |
|---|---|
| `registration_open` | texto e botão para `external_url` ("Quero participar", em outra aba) |
| `registration_closed`, `in_progress` | aviso do status; sem formulário |
| `completed` | "Os certificados estão sendo preparados." Sem formulário. |
| `certificates_available` | formulário de busca (componente cliente, hidrata sozinho: o resto da página é RSC) |
| `archived` | aviso de arquivado, com link para `/validar` |

O formulário de busca é a única ilha interativa da página. A página do evento envia um beacon de visita (`navigator.sendBeacon`, [doc 10](10-observabilidade.md)) e, se detectar navegador embutido do Instagram ou do Facebook, mostra a dica de abrir no navegador **antes** da busca ([doc 02](02-arquitetura.md)).

### Admin

Desktop primeiro (o admin trabalha no computador), funcional em tablet. O editor de modelo é só desktop: abaixo de 1024 px mostra um aviso em vez de um editor inutilizável. Tabelas com filtros e paginação na URL (`nuqs`). Todo formulário usa `react-hook-form` com o mesmo schema Zod da action.

## Metadata e Open Graph

- `metadataBase` = `NEXT_PUBLIC_SITE_URL`; `title.template` = `%s · CF Eventos`; `lang="pt-BR"`; `htmlLimitedBots: /.*/` herdado (ADR-0013 do CF Jobs: metadata bloqueante para todo agente).
- Página do evento: `title` = título; `description` = primeiros 155 caracteres da descrição sem Markdown; canonical; Open Graph `type: website` com a capa (ou a capa gerada); `twitter:card = summary_large_image`.
- Tela de retirada e validação: `robots: { index: false, follow: false }`, **sem** Open Graph com nome de pessoa. Se alguém colar o link da validação no WhatsApp, a prévia mostra "Validação de certificado · CF Eventos", não o nome do titular.

## JSON-LD

Na **página do evento**, dois blocos:

```json
{
  "@context": "https://schema.org",
  "@type": "Event",
  "name": "Ferpa Tech Day 2026",
  "description": "...",
  "startDate": "2026-09-12T08:00:00-03:00",
  "endDate": "2026-09-12T18:00:00-03:00",
  "eventStatus": "https://schema.org/EventScheduled",
  "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
  "location": { "@type": "Place", "name": "...", "address": { "@type": "PostalAddress", "addressLocality": "Fernandópolis", "addressRegion": "SP", "addressCountry": "BR" } },
  "image": ["https://eventos.codingferpa.org/eventos/ferpa-tech-day-2026/capa"],
  "organizer": { "@type": "Organization", "name": "Coding Ferpa", "url": "https://codingferpa.org" },
  "isAccessibleForFree": true
}
```

```json
{
  "@context": "https://schema.org",
  "@type": "EducationalOccupationalCredential",
  "name": "Certificado de participação: Ferpa Tech Day 2026",
  "credentialCategory": "certificate",
  "recognizedBy": { "@type": "Organization", "name": "Coding Ferpa", "url": "https://codingferpa.org" },
  "url": "https://eventos.codingferpa.org/eventos/ferpa-tech-day-2026"
}
```

O segundo só entra quando o evento está em `certificates_available` ou `archived`. **Por que a credencial fica na página do evento e não na de validação:** a página de validação é `noindex` e carrega o nome de uma pessoa; dados estruturados ali não serviriam a buscador nenhum e ainda empurrariam dado pessoal para um formato feito para ser colhido. A credencial descrita é a que o evento emite, não a de um indivíduo. Mais `BreadcrumbList` (Início → Evento). O JSON é serializado com escape de `<` para impedir quebra do `<script>`.

## Sitemap e robots

`sitemap.ts` (`revalidate = 3600`): `/`, `/validar`, `/privacidade`, e cada evento fora de `draft` e `archived`, com `lastModified = updated_at`. `robots.ts`: permite tudo, bloqueia `/admin`, `/login`, `/api`, `/eventos/*/certificado`, `/validar/` (com a barra final: o formulário `/validar` segue indexável), `/certificado/`.

## LinkedIn "Adicionar ao perfil" (M12)

Botão na tela de retirada, um por certificado. URL montada no servidor:

`https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name={nome do certificado}&organizationId={LINKEDIN_ORGANIZATION_ID}&issueYear={aaaa}&issueMonth={m}&certUrl={URL de validação}&certId={código}`

**Formato conferido em 2026-09-21** no gerador oficial (`addtoprofile.linkedin.com`), que produz exatamente esses parâmetros e aceita ainda `expirationYear` e `expirationMonth`. O formato `pfCertificationName` com token `_ed`, que o PRD citava, é o legado e não deve ser usado; o PRD foi corrigido. Não é preciso reconferir no M12.

`organizationId` e `organizationName` são mutuamente exclusivos, e o próprio gerador recomenda o `organizationId` quando a organização tem página. A Coding Ferpa tem: `https://www.linkedin.com/company/coding-ferpa/`. O `organizationId` é numérico e sai do próprio gerador (ele busca a organização pelo nome e preenche o campo) ou da URL de administração da página. Enquanto ele não estiver em `LINKEDIN_ORGANIZATION_ID`, o código usa `organizationName=Coding Ferpa`, que funciona mas não vincula o item à página.

`name` = `{participation.label}: {event.title}`. `certUrl` é a URL de validação, que é o que dá valor ao item no perfil.

## Acessibilidade

Meta: WCAG 2.2 AA, verificada por axe no Playwright ([doc 11](11-qualidade.md)).

- Tudo operável por teclado; foco sempre visível (`outline: 2px solid var(--primary)` com offset); ordem de foco igual à visual.
- Formulário de busca: `<label>` visível em todo campo; erro ligado por `aria-describedby`; resultado da busca anunciado em região `aria-live="polite"`; o 429 anuncia o tempo de espera em texto, não só em cor.
- CPF: `inputmode="numeric"`, `autocomplete="off"`, máscara que não quebra colar. E-mail: `type="email"`, `autocomplete="email"`. Nome: `autocomplete="name"`, `autocapitalize="words"`. Data de nascimento: um campo de texto com `inputmode="numeric"`, `autocomplete="bday"` e máscara `DD/MM/AAAA`; `type="date"` foi rejeitado porque o seletor nativo do celular obriga a rolar 20 anos.
- Prévia do certificado: `<svg role="img" aria-label="Prévia do certificado de {nome}">`. O SVG é feito de contornos de glifo, ilegível para leitor de tela, então **toda a informação está repetida em HTML** ao lado: nome, tipo, carga horária, código.
- Código de validação: exibido em `JetBrains Mono` com `aria-label` soletrado por grupos; campo de entrada aceita colar com ou sem hífens.
- Estados de validação têm ícone e texto, nunca só cor.
- `prefers-reduced-motion` desliga o glow animado e as transições.
- Editor do admin: toda ação de arrastar tem equivalente por teclado e por campo numérico (setas movem 0,1%; com Shift, 1%). O formulário numérico do M6 continua existindo depois do M10: ele é o caminho acessível.
- Alvos de toque de no mínimo 44×44 px na área pública.

## Orçamento de performance

O público acessa por celular em rede móvel, a partir de um link no WhatsApp. O orçamento é medido no perfil **mobile** do Lighthouse (4G lento, CPU 4x mais lenta) e é bloqueante no CI. A hierarquia é a do [ADR-0015](adr/0015-orcamento-de-js-sobre-o-piso-do-framework.md): **LCP, CLS e TBT são a asserção principal**, porque é o que o aluno sente; os KB de JavaScript são um **tripwire de regressão**, porque são só um indicador indireto.

| Asserção principal | `/` e `/eventos/[slug]` | `/validar` |
|---|---|---|
| LCP | < 2,5 s | < 2,5 s |
| CLS | < 0,05 | < 0,05 |
| TBT | < 200 ms | < 150 ms |
| Desempenho (Lighthouse) | ≥ 90 | ≥ 95 |
| Acessibilidade | ≥ 95 | ≥ 95 |
| Boas práticas e SEO | ≥ 95 | ≥ 95 |

**Tripwire de JavaScript por rota (comprimido)**: piso do framework (130,6 KB: `react-dom`, runtime do App Router, runtime do webpack e `main-app`), mais o nosso código medido, mais uma folga de feature de 5 KB. Hoje: 157,4 KB em `/`, 156,4 KB na página do evento e 157,4 KB em `/validar`. Cada linha, e cada acréscimo futuro com a medição que o justifica, está no ADR-0015. Nada é pré-alocado: o M8 acrescenta a linha do formulário de busca quando ele existir.

Como o orçamento é cumprido:

- **RSC por padrão.** `'use client'` só em: alternador de tema, formulário de busca, campo de código, formulário de correção, aviso de navegador embutido. O admin não entra nessa conta.
- **Nenhum pdf.js, fontkit ou pdf-lib no bundle público.** São carregados por `import()` apenas no editor do admin. Um teste de bundle falha o CI se qualquer um deles aparecer em um chunk de rota pública.
- **Prévia do certificado:** SVG inline de poucos KB mais um WebP de até 200 KB (`loading="eager"`, `fetchpriority="high"`, dimensões explícitas: CLS zero). O PDF de até alguns MB só trafega quando a pessoa clica em baixar.
- **Capa do evento:** `next/image` com `sizes`, `priority` só na página do evento; nos cards, lazy.
- **Prefetch só com intenção nas listas de links:** o card do catálogo usa `HoverPrefetchLink`, que só faz prefetch com o ponteiro em cima ou com foco do teclado. O prefetch padrão baixaria a rota de cada card que entra na tela, gastando o plano de dados do aluno com eventos que ele não vai abrir. Os links de navegação seguem com o prefetch normal. Um teste E2E em build de produção garante que nenhum evento é pré-carregado antes da intenção.
- **Sem `cn()` em componente cliente da área pública:** o `tailwind-merge` custa 9 KB no navegador. Junção de classes que não conflitam é feita com `join(' ')`.
- **Fontes da UI:** Poppins e JetBrains Mono via `next/font/google` com `display: 'optional'` (orçamento de CLS). JetBrains Mono só é pré-carregada em `/validar` e na tela de retirada, que declaram a própria instância com o único peso que usam (400, um arquivo estático de 21 KB, em vez do variável de 31 KB).
- **Sem bibliotecas de animação, de data (usa `Intl`), de máscara (função de 20 linhas) nem de ícones além de `lucide-react` com import nomeado.**
- **Rotas dinâmicas** (retirada e validação) ficam fora do orçamento do Lighthouse CI porque dependem de cookie e de banco; o alvo delas é tempo de servidor: p95 < 400 ms na validação e < 600 ms na tela de retirada (com o layout e o SVG).
