import type { TokenContext } from './tokens'

/**
 * ETag do PDF do certificado (doc 05): a rota responde 304 sem rodar o motor
 * quando o navegador já tem o PDF certo. Também é a chave prevista para o
 * cache do PDF pronto (P2).
 *
 * As versões não bastam: o PDF imprime título, datas, cidade e local do
 * evento, e o rótulo do tipo de participação, que mudam sem mudar nenhuma
 * versão. Por isso o ETag inclui tudo o que o `layout()` lê do contexto, em
 * ordem fixa. A rota já tem esses dados antes de calcular o ETag.
 */

/**
 * Sobe quando uma mudança no motor, na formatação ou nas fontes curadas muda
 * o PDF de um certificado que não mudou.
 */
export const ENGINE_VERSION = 1

export type EtagInput = {
  basePdfSha256: string
  templateVersion: number
  certificateVersion: number
  context: TokenContext
}

const instante = (data: Date | null) => (data ? data.toISOString() : null)

/** O contexto em ordem fixa: a mesma impressão dá a mesma lista. */
function impresso(c: TokenContext) {
  return [
    c.siteUrl,
    c.participant.fullName,
    c.participant.cpfLast3,
    c.event.title,
    c.event.locationName,
    c.event.city,
    instante(c.event.startsAt),
    instante(c.event.endsAt),
    c.participation.label,
    c.certificate.hours,
    c.certificate.code,
    instante(c.certificate.issuedAt),
    c.certificate.sequence,
    Object.entries(c.certificate.data).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  ]
}

export async function certificateEtag(
  entrada: EtagInput,
  versaoDoMotor = ENGINE_VERSION,
): Promise<string> {
  // JSON de uma lista: cada valor tem as suas aspas, e nenhum separador
  // dentro de um valor cola dois campos.
  const texto = JSON.stringify([
    versaoDoMotor,
    entrada.basePdfSha256,
    entrada.templateVersion,
    entrada.certificateVersion,
    impresso(entrada.context),
  ])
  const resumo = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
  const hex = Array.from(new Uint8Array(resumo), (b) => b.toString(16).padStart(2, '0'))
  return `"${hex.join('')}"`
}
