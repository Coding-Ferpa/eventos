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

/** Deslocamento de São Paulo naquele instante, em minutos (-180 hoje). */
function deslocamentoDeSaoPaulo(instante: Date): number {
  const nome =
    PARTES_ISO.formatToParts(instante).find((parte) => parte.type === 'timeZoneName')
      ?.value ?? 'GMT'
  const casamento = /GMT([+-])(\d{2}):(\d{2})/.exec(nome)
  if (!casamento) return 0

  const sinal = casamento[1] === '-' ? -1 : 1
  return sinal * (Number(casamento[2]) * 60 + Number(casamento[3]))
}

/**
 * O valor de um `<input type="datetime-local">` ("2026-09-12T08:00") é hora de
 * parede, sem fuso. Aqui ele é lido como hora de São Paulo, que é onde o
 * evento acontece, e vira o instante em UTC que o banco guarda.
 */
export function dataHoraDeSaoPauloParaUtc(local: string): Date {
  const [data = '', hora = ''] = local.split('T')
  const [ano, mes, dia] = data.split('-').map(Number)
  const [horas, minutos] = hora.split(':').map(Number)

  const comoSeFosseUtc = Date.UTC(
    ano ?? 0,
    (mes ?? 1) - 1,
    dia ?? 1,
    horas ?? 0,
    minutos ?? 0,
  )
  // O deslocamento é o do instante resultante, e não o do palpite: numa virada
  // de horário de verão os dois diferem, e a segunda conta acerta.
  const palpite =
    comoSeFosseUtc - deslocamentoDeSaoPaulo(new Date(comoSeFosseUtc)) * 60_000
  return new Date(comoSeFosseUtc - deslocamentoDeSaoPaulo(new Date(palpite)) * 60_000)
}

/** O inverso: o instante em UTC, como o campo `datetime-local` o mostra. */
export function utcParaDataHoraDeSaoPaulo(instante: Date): string {
  return isoEmSaoPaulo(instante).slice(0, 16)
}
