# 07 · APIs e Server Actions

## Estratégia geral

Duas superfícies, separadas de propósito, como no CF Jobs:

1. **Server Actions** para toda mutação do admin. CSRF nativo, tipagem de ponta a ponta, zero superfície REST administrativa.
2. **Route Handlers públicos** para o que o aluno e o validador fazem sem login: buscar, baixar o PDF, pedir correção. São Route Handlers e não Server Actions por três motivos concretos: precisam devolver **status HTTP** (o critério de aceite exige `429`), um deles devolve **binário com ETag**, e o download precisa funcionar como link comum no iOS.

**Não existe API pública de leitura versionada (`/api/v1`)**, ao contrário do CF Jobs. Lá os dados são públicos e a API serve integrações; aqui os dados são de pessoas, e cada endpoint a mais é superfície de enumeração. Se um dia um bot da comunidade precisar validar certificados, entra `/api/v1/validar/{codigo}` com ADR.

As páginas (RSC) chamam `db/queries` diretamente, sem passar por HTTP.

## Esqueleto das Server Actions

Herdado literalmente do CF Jobs: `src/actions/define-action.ts`, `authorize.ts`, `result.ts`. Toda action do admin é declarada com `defineAction`:

```ts
export const revokeCertificate = defineAction({
  nome: 'certificate.revoke',          // verbo do audit_logs, formato entidade.acao
  entidade: 'certificates',
  papelMinimo: 'editor',
  schema: z.object({ id: z.uuid(), reason: z.string().trim().min(10).max(500) }),
  async executar({ entrada, usuario, tx }) {
    // ... operação na transação `tx`
    return { data: { code }, entityId: entrada.id, diff: { status: ['active', 'revoked'] } }
  },
  revalidar: [],                       // tags derrubadas depois do commit, com updateTag
})
```

Ordem fixa: **sessão → papel → Zod → operação em transação → `audit_logs` na mesma transação → `updateTag` depois do commit.** O papel vem antes do Zod para a entrada de quem não tem papel nem ser processada (a ordem do esqueleto desde o M2; este parágrafo dizia o contrário até o M4). A auditoria não é opcional: o tipo de retorno de `executar` exige `entityId` e `diff`, e o insert em `audit_logs` é feito pelo esqueleto. Retorno padronizado `{ ok: true, data } | { ok: false, error: { code, message, fieldErrors? } }`; actions nunca lançam para o cliente. Erro de domínio esperado é `throw new FalhaDaAction(code, mensagem)`.

Duas regras próprias deste projeto para o `diff`: nunca contém CPF (não existe) e, em operações em massa, contém **contadores e ids**, nunca listas de nomes.

Actions **públicas** não existem: tudo o que o público dispara é Route Handler. Isso mantém verdadeira a frase "toda Server Action exige sessão".

## Server Actions por domínio

Papel mínimo entre parênteses. Todas validam a entrada com Zod de `src/lib/schemas/`.

### Eventos (`actions/events.ts`)

| Action | Entrada | Efeito | Tags |
|---|---|---|---|
| `createEvent` (editor) | `{ title, slug?, starts_at, ends_at?, location_name?, city?, state?, external_url?, description_md? }` | cria em `draft`, gera `cpf_salt`, cria os 4 tipos de participação padrão na mesma transação | `events` |
| `updateEvent` (editor) | `{ id, ...parciais }` | só o que veio muda; campo apagado no formulário chega como `null` e apaga, ausente não muda. `slug` só muda em `draft` (`slug_locked`); término conferido contra o início do banco; configuração de busca validada pelo ADR-0009 (ao menos uma chave independente para liberar). `cover_path` só aponta para a pasta do próprio evento e é conferido pelos primeiros bytes (JPEG, PNG ou WebP); arquivo disfarçado é apagado do bucket | `events`, `event:{slug}` |
| `setEventStatus` (editor) | `{ id, status }` | transições livres entre os estados, **exceto** entrar em `certificates_available`, que só acontece por `releaseCertificates`, e **voltar para `draft`**: o trigger do banco só trava o `slug` fora do rascunho, e voltar a ele destravaria a troca de um endereço que já pode estar em cartaz e em QR. Para tirar um evento do catálogo, arquiva-se (decisão do M4) | `events`, `event:{slug}` |
| `releaseCertificates` (editor) | `{ id }` | pré-condições: ≥ 1 certificado ativo; todo tipo com certificados tem modelo **publicado**; ao menos uma chave de busca habilitada. Efeito: `status = certificates_available`, `certificates_released_at = now()`, `issued_at = now()` onde for null | `events`, `event:{slug}` |
| `cloneEvent` (editor, M11) | `{ source_id, title, slug, starts_at }` | copia evento (em `draft`, `cpf_salt` **novo**), tipos, modelos (arte, `base.pdf`, prévias copiados no Storage; snapshot preservado; `column_mapping` junto) e configuração de busca. Não copia participantes nem certificados. | `events` |
| `deleteEvent` (admin) | `{ id }` | só `draft` sem certificados | `events` |
| `createCoverUploadUrl` (editor) | `{ event_id, content_type, size }` | URL assinada de upload no bucket `covers`, no caminho `{event_id}/{uuid}.{extensão}`; até 5 MB, o teto do bucket. O navegador sobe direto ao Storage, e a origem do Supabase entra no `connect-src` da CSP só nas rotas dinâmicas | nenhuma |

### Tipos de participação (`actions/participation-types.ts`)

`upsertParticipationType` (editor): `{ id?, event_id, slug, label, aliases[], default_hours, certificate_template_id? }`. `deleteParticipationType` (editor): recusa se houver certificados do tipo.

### Modelos (`actions/templates.ts`)

| Action | Entrada | Efeito |
|---|---|---|
| `createTemplate` (editor) | `{ event_id, name }` | cria em `draft`, `schema_version = 1`, listas vazias |
| `createArtUploadUrls` (editor) | `{ template_id, art: { content_type, size }, previews: [{ page }] }` | URLs assinadas: arte original em `templates`, prévias WebP em `previews` |
| `attachArt` (editor) | `{ template_id, art_path, preview_paths[] }` | baixa a arte, confere assinatura de bytes, roda `buildBasePdf` ([doc 05](05-motor-de-certificados.md)), grava `base.pdf`, `pages`, sha256 e tamanho. Erros: `art_encrypted`, `art_rotated`, `art_too_many_pages`, `art_too_small`, `art_too_heavy`, `art_unsupported_type`, `art_unreadable`. `maxDuration = 60`. |
| `saveTemplateDraft` (editor) | `{ id, data_fields, layout_fields }` | valida com o Zod de `schema.ts`: chaves reservadas, placeholders conhecidos, caixas dentro da página. Grava só a cópia de trabalho. **Não afeta downloads.** |
| `publishTemplate` (editor) | `{ id }` | roda as 7 regras de publicação do doc 05; grava `published_snapshot`, `version + 1`, `status = published` |
| `getLongestNameSample` (editor) | `{ template_id, font, transform }` | devolve o nome mais largo do evento para o botão de teste (leitura, mas é action para carregar sessão e papel). Recebe a fonte e a transformação que estão na tela, e não o `field_id`, porque o botão mede o que o admin está vendo, salvo ou não (M6). O nome não vai para a auditoria. |
| `cloneTemplate` (editor) | `{ id, target_event_id }` | copia modelo e arquivos |
| `deleteTemplate` (admin) | `{ id }` | só `draft` sem tipos apontando |
| `createFontUploadUrl` (editor) | `{ extension, size }` | URL assinada no bucket privado `fonts`, até 2 MB |
| `uploadCustomFont` (editor) | `{ storage_path, family?, weight? }` (sem família e peso, valem os do arquivo) | valida assinatura, recusa variável, testa cobertura e subset, grava `custom_fonts`. Arquivo recusado ou repetido (mesmo sha256) sai do bucket; o repetido devolve a fonte que já existe. |
| `createFontReadUrls` (editor) | `{ ids }` | URLs de leitura de uma hora das fontes enviadas, para a prévia do editor rodar o motor no navegador |

`publishTemplate` derruba `event:{slug}`. O PDF não precisa de tag: o ETag inclui `template.version`.

### Importação (`actions/imports.ts`), contrato completo no [doc 06](06-importacao-csv.md)

| Action | Entrada | Saída |
|---|---|---|
| `inspectCsv` (editor) | `FormData { file, event_id, participation_type_id? }` | `{ encoding, delimiter, headers, sample_rows, row_count, file_sha256, suggested_mapping, warnings }`. Não grava nada e, por exceção documentada, **não gera `audit_logs`** (é leitura). |
| `stageImport` (editor) | `FormData { file, event_id, participation_type_id?, mapping }` | `{ batch_id, summary, preview_digest }` |
| `listImportRows` (editor) | `{ batch_id, filter, cursor }` | página de linhas com `issues` |
| `resolveImportRow` (editor) | `{ batch_id, row_number, resolution }` | novo `summary` e `preview_digest` |
| `applyImport` (editor) | `{ batch_id, preview_digest }` | `{ created, updated, unchanged, skipped }` ou erro `preview_stale` (com a nova prévia) ou `decisions_pending` |
| `discardImport` (editor) | `{ batch_id }` | apaga as linhas do staging |

### Participantes e certificados (`actions/certificates.ts`)

| Action | Entrada | Efeito |
|---|---|---|
| `updateParticipant` (editor) | `{ id, full_name?, email?, birth_date?, cpf? }` | `cpf` recalcula HMAC e `cpf_last3`. Mudança de nome incrementa `version` dos certificados e **aprova na mesma transação os pedidos de correção pendentes daquela pessoa** (é o que mantém a fila coerente enquanto a tela de revisão não existe). |
| `updateCertificate` (editor) | `{ id, hours?, data? }` | `data` validado contra as `data_fields` do snapshot do modelo |
| `createCertificateManually` (editor) | `{ event_id, participation_type_id, participant: {...} \| participant_id, hours?, data }` | mesma validação da importação, uma pessoa |
| `revokeCertificate` / `restoreCertificate` (editor) | `{ id, reason }` | `reason` de 10 a 500 caracteres |
| `removeCertificates` (editor antes da liberação, **admin** depois) | `{ event_id, certificate_ids[] (até 500), confirm_count }` | apaga os nunca baixados de evento não liberado; qualquer outro devolve `must_revoke` com a lista. `confirm_count` tem de ser igual ao tamanho da lista. ([ADR-0007](adr/0007-upsert-only-e-remocao-manual.md)) |
| `eraseParticipant` (admin) | `{ participant_id, confirm_name }` | eliminação LGPD ([doc 08](08-seguranca-e-lgpd.md)) |

### Fase 2 e 3

`reviewNameCorrection` (editor): `{ id, decision: 'approve' | 'reject', final_name?, note? }`. `createEmailCampaign`, `pauseEmailCampaign`, `resendFailedDeliveries` (editor). `setUserRole` (admin). Exportações são Route Handlers de `/admin` (abaixo).

## Route Handlers públicos

Convenções: JSON em `snake_case`; erros em **RFC 9457 Problem Details** com `code` adicional e `detail` em pt-BR pronto para exibir; `Cache-Control: no-store` em todos; conferência de `Origin` igual ao site nos `POST`; runtime Node; região `gru1`. O rate limit roda **antes** de qualquer consulta a pessoa.

### `POST /api/certificados/buscar`

```ts
const SearchInput = z.object({
  event_slug: z.string().min(3).max(80),
  method: z.enum(['cpf', 'email', 'name', 'all']),
  cpf: z.string().trim().max(20).optional(),          // aceita máscara; vira 11 dígitos; verificadores conferidos
  email: z.email().max(254).optional(),
  full_name: z.string().trim().min(3).max(120).optional(),
  birth_date: z.iso.date().optional(),                // aaaa-mm-dd
})
```

Refinamentos: o método precisa estar habilitado no evento; `name` exige `birth_date` quando `search_birth_date` é verdadeiro; `all` exige todos os campos habilitados; método `all` só existe em evento `search_mode = 'all'`.

| Status | `code` | Quando |
|---|---|---|
| 200 | | encontrou **uma** pessoa. `Set-Cookie: cf-retirada`. Corpo: `{ "ok": true, "redirect": "/eventos/{slug}/certificado" }`. **Nada sobre a pessoa no corpo.** |
| 404 | `not_found` | zero **ou mais de uma**. Corpo idêntico nos dois casos. |
| 409 | `event_unavailable` | evento fora de `certificates_available` (ou inexistente, ou em rascunho: mesma resposta) |
| 422 | `validation_error` | entrada inválida, inclusive CPF com dígito verificador errado. Traz `field_errors`. |
| 429 | `rate_limited` | cabeçalho `Retry-After` e `detail` com o tempo em pt-BR |

Sequência: Zod → evento → baldes (dispositivo consome; IP só consulta) → HMAC e consulta em `public-lookup.findParticipant` → grava `search_attempts` → em falha, consome o balde de IP → responde. Tudo em uma transação curta, para custar poucas idas ao banco no pico.

### `GET /api/certificados/{codigo}/pdf`

Autorização: cookie `cf-retirada` válido **e** o certificado pertence a um participante do cookie. Contrato de geração e cabeçalhos no [doc 05](05-motor-de-certificados.md#geração-sob-demanda-o-caminho-quente).

| Status | Quando |
|---|---|
| 200 | PDF. `ETag`, `Content-Disposition: attachment`. |
| 304 | `If-None-Match` igual ao ETag calculado dos metadados. O motor não roda. |
| 303 → `/eventos/{slug}?sessao=expirada` | sem cookie ou cookie vencido. É navegação de usuário, então redireciona em vez de mostrar JSON. |
| 404 | código inexistente, malformado **ou de outra pessoa** (mesma resposta) |
| 410 | certificado `revoked` ou `erased` |
| 429 | limite de download |
| 303 → `/eventos/{slug}/certificado?erro=geracao` | falha do motor. Registra `pdf_failures`, loga sem PII, reporta ao Sentry. A tela mostra o alerta e o botão de tentar de novo. |

O botão da tela é um `<a href>` comum **sem** o atributo `download`: o `Content-Disposition` faz o navegador baixar no sucesso, e o redirecionamento navega normalmente na falha. Com `download`, o navegador salvaria a página de erro como se fosse o PDF.

### `POST /api/certificados/{codigo}/correcao`

Mesma autorização do download. Entrada: `{ requested_name: string (3 a 120), contact: string (5 a 120), message?: string (até 500) }`. Efeito: insere `name_correction_requests` com `pending` e `current_name`; depois do commit, em `after()`, envia o e-mail de notificação ao `contact_email` do evento (ou `ADMIN_NOTIFICATION_EMAIL`) com link para a edição do participante no admin. Falha no envio é logada e **não** desfaz o pedido. Respostas: `201`; `409 correction_already_pending`; `429`; `422`.

Isto existe desde a fase 1: o pedido nunca sai da plataforma, então o histórico nasce inteiro. O que é P1 é a tela de fila (`reviewNameCorrection`).

### Rotas de página com efeito (não são API)

- `/validar` (estática): formulário; o envio normaliza o código no cliente e navega para `/validar/{codigo}`.
- `/validar/[codigo]` (**dinâmica**, nunca em cache): normaliza, aplica o rate limit por IP, consulta `public-lookup.getCertificateForValidation`, grava `validation_checks`, renderiza um dos estados `valid`, `revoked`, `erased`, `not_found`, `malformed`. Se a URL não estiver na forma canônica (minúsculas, hífens, `O` no lugar de `0`), redireciona com 308 para a canônica. Ser dinâmica é requisito triplo: a revogação aparece na hora, o rate limit funciona, e o smoke test diário toca o Postgres ([doc 12](12-open-source-e-governanca.md)).
- `/eventos/[slug]/certificado` (dinâmica): lê o cookie, carrega os certificados da pessoa naquele evento e renderiza a prévia SVG dos ativos no servidor. Certificado revogado aparece como aviso ("foi revogado pela organização"), sem prévia e sem botão; a busca continua encontrando a pessoa, porque "não encontrado" seria mentira.
- `GET /certificado/[token]` (P1, Route Handler): valida o hash do token, emite o cookie de retirada (`src: 'token'`; os valores de `src` estão no [doc 08](08-seguranca-e-lgpd.md)), responde 303. Inválido, vencido ou revogado: página com a explicação e o link para a busca do evento.
- `POST /api/meus-certificados/buscar` (P1): `{ cpf }`; mesmos baldes; sucesso emite cookie com vários `pids` e redireciona para `/meus-certificados/resultado`.
- `POST /api/eventos/{slug}/visita`: beacon (`navigator.sendBeacon`) da página do evento; grava `event_visits` uma vez por dispositivo e dia. Responde 204 sempre.

### Internas e administrativas

| Rota | Proteção | Função |
|---|---|---|
| `POST /api/internal/revalidate` | `Authorization: Bearer {CRON_SECRET}` | herdada; `revalidateTag` disparado de fora |
| `POST /api/internal/email/dispatch` (P1) | idem | envia o próximo lote da fila ([doc 10](10-observabilidade.md)) |
| `POST /api/webhooks/resend` (P1) | assinatura do webhook | atualiza `email_deliveries` |
| `GET /admin/eventos/[id]/exportar/{participantes\|retiradas\|pendentes}.xlsx` (P1) | sessão e papel `editor` | XLSX |
| `GET /admin/eventos/[id]/exportar/relatorio.pdf` (P1) | idem | relatório |
| `GET /api/dev/certificado-exemplo` | só quando `VERCEL_ENV !== 'production'` | gera um PDF a partir de fixture: prova, no M5, que fontes e motor funcionam no runtime real da Vercel |

## Catálogo de erros (`code`)

Comuns: `unauthorized`, `forbidden`, `not_found`, `validation_error`, `rate_limited`, `conflict`.
Eventos: `event_unavailable`, `release_preconditions_failed` (lista o que falta), `slug_locked`.
Modelos: `art_encrypted`, `art_rotated`, `art_too_many_pages`, `art_too_small`, `art_too_heavy`, `art_unsupported_type`, `art_unreadable`, `font_variable`, `font_missing_glyphs`, `template_publish_blocked` (lista as regras violadas), `reserved_key`, `unknown_placeholder`.
Importação: `file_too_large`, `too_many_rows`, `single_column`, `mapping_incomplete`, `preview_stale`, `decisions_pending`, `batch_not_staged`.
Certificados: `must_revoke`, `confirm_count_mismatch`, `correction_already_pending`, `certificate_gone`.
Geração: `pdf_generation_failed`.

A UI mapeia cada `code` para uma mensagem em pt-BR acionável ([doc 03](03-design-system.md)). Mensagem genérica é bug.

## Cache e invalidação

| Dado | Onde | Política |
|---|---|---|
| Catálogo (`/`) | ISR | `unstable_cache` com tag `events`, `revalidate: 3600`; `updateTag('events')` nas actions de evento |
| Página do evento | ISR | tags `events` e `event:{slug}`, `revalidate: 3600` |
| Capa gerada e imagem OG | rota `ImageResponse` | tag `event:{slug}` |
| Sitemap | `revalidate = 3600` | |
| Tela de retirada, validação, busca, download | **dinâmico** | `no-store` (PDF: `private, no-cache` com ETag) |
| Admin | dinâmico | `force-dynamic` no layout |
| `base.pdf` e fontes | cache de módulo da função | chave = sha256; nunca fica obsoleto porque conteúdo novo tem hash novo |
| Fundo da prévia (WebP), capas | CDN do Storage | nome do objeto único (o sha256 no fundo da prévia, um uuid na capa): `immutable`, 1 ano. Capa trocada deixa o objeto anterior sem referência no bucket, sem custo para a página |

`updateTag` (e não `revalidateTag`) dentro de Server Action, pelo motivo do ADR-0014 do CF Jobs: leitura das próprias escritas. `revalidateTag` só na rota interna chamada de fora.

Nada que dependa de cookie roda nas páginas ISR: o tema é resolvido por script inline e o cookie de dispositivo é emitido pelo proxy. Ler `cookies()` em um layout público tornaria o catálogo dinâmico.
