/**
 * Formatação de datas e lugares para a tela (doc 03, seção 6a). O banco guarda
 * tudo em UTC; a exibição é sempre no fuso de São Paulo (doc 02), porque é lá
 * que o evento acontece e é esse o dia que a pessoa lembra.
 */

const FUSO = 'America/Sao_Paulo'

const PARTES_DA_DATA = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: FUSO,
})

type Dia = { dia: string; mes: string; ano: string }

function diaEmSaoPaulo(data: Date): Dia {
  const partes = PARTES_DA_DATA.formatToParts(data)
  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((parte) => parte.type === tipo)?.value ?? ''

  return { dia: valor('day'), mes: valor('month'), ano: valor('year') }
}

/**
 * "12 de setembro de 2026", ou "14 a 16 de março de 2026" quando dura mais de
 * um dia. Montado à mão porque o `formatRange` do Intl junta as pontas com
 * meia-risca, e a interface não usa travessão.
 */
export function formatarPeriodo(inicio: Date, fim: Date | null): string {
  const a = diaEmSaoPaulo(inicio)
  const b = fim ? diaEmSaoPaulo(fim) : a

  if (a.ano !== b.ano) {
    return `${a.dia} de ${a.mes} de ${a.ano} a ${b.dia} de ${b.mes} de ${b.ano}`
  }
  if (a.mes !== b.mes) {
    return `${a.dia} de ${a.mes} a ${b.dia} de ${b.mes} de ${b.ano}`
  }
  if (a.dia !== b.dia) {
    return `${a.dia} a ${b.dia} de ${b.mes} de ${b.ano}`
  }
  return `${a.dia} de ${a.mes} de ${a.ano}`
}

/**
 * "Fernandópolis, SP". O banco não tem um campo "on-line": evento sem cidade
 * é on-line, e o JSON-LD segue a mesma regra (`lib/seo.ts`).
 */
export function formatarLocal(local: { city: string | null; state: string | null }) {
  const cidade = local.city?.trim()
  if (!cidade) return 'On-line'

  const estado = local.state?.trim()
  return estado ? `${cidade}, ${estado}` : cidade
}

const PARTES_ISO = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  timeZone: FUSO,
  timeZoneName: 'longOffset',
})

/**
 * "2026-09-12T08:00:00-03:00": a hora como o evento a anuncia, com o
 * deslocamento explícito, que é como o schema.org mostra datas de evento. O
 * deslocamento vem do Intl, e não de um "-03:00" fixo, para sobreviver a uma
 * volta do horário de verão.
 */
export function isoEmSaoPaulo(data: Date): string {
  const partes = PARTES_ISO.formatToParts(data)
  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((parte) => parte.type === tipo)?.value ?? ''

  const deslocamento = valor('timeZoneName').replace('GMT', '') || '+00:00'
  return (
    `${valor('year')}-${valor('month')}-${valor('day')}` +
    `T${valor('hour')}:${valor('minute')}:${valor('second')}${deslocamento}`
  )
}
