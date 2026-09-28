import { formatarPeriodo } from '@/lib/format'

/**
 * Formatação do que o certificado imprime, em pt-BR (doc 05). Datas de
 * instante (início do evento, emissão) são lidas em São Paulo; datas de
 * conteúdo (`aaaa-mm-dd`, sem hora) são o dia como foi digitado, sem fuso.
 */

const FUSO = 'America/Sao_Paulo'

const CURTA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: FUSO,
})
const LONGA = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: FUSO })

/** Data de conteúdo vira meio-dia UTC, que é o mesmo dia em qualquer fuso do Brasil. */
function comoInstante(data: Date | string): Date {
  return typeof data === 'string' ? new Date(`${data}T12:00:00Z`) : data
}

export function formatDateShort(data: Date | string): string {
  return CURTA.format(comoInstante(data))
}

export function formatDateLong(data: Date | string): string {
  return LONGA.format(comoInstante(data))
}

export function formatEventDateShort(inicio: Date, fim: Date | null): string {
  const a = formatDateShort(inicio)
  const b = fim ? formatDateShort(fim) : a
  return a === b ? a : `${a} a ${b}`
}

/** "12 a 14 de setembro de 2026", a mesma regra da área pública. */
export function formatEventDateLong(inicio: Date, fim: Date | null): string {
  return formatarPeriodo(inicio, fim)
}

export function formatNumber(valor: number, casas: number): string {
  return valor.toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })
}

export type HoursStyle = 'number' | 'short' | 'long'

/** `8` · `8h` · `8 horas`, com `1 hora` e `1,5 hora` no singular. */
export function formatHours(horas: number, estilo: HoursStyle): string {
  const numero = horas.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
  if (estilo === 'number') return numero
  if (estilo === 'short') return `${numero}h`
  return `${numero} ${horas < 2 ? 'hora' : 'horas'}`
}

/**
 * `***.***.**1-45`. Só os 3 últimos dígitos existem (doc 05): guardar os do
 * meio derrubaria o espaço de busca do hash para mil candidatos.
 */
export function formatCpfMasked(ultimos3: string | null): string {
  if (!ultimos3) return ''
  return `***.***.**${ultimos3.slice(0, 1)}-${ultimos3.slice(1)}`
}

export function formatSequence(numero: number, ano?: number): string {
  const sequencia = String(numero).padStart(4, '0')
  return ano === undefined ? sequencia : `${sequencia}/${ano}`
}

const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e'])
const APOSTROFOS = /['’]/

function capitalizar(parte: string): string {
  return parte.charAt(0).toLocaleUpperCase('pt-BR') + parte.slice(1)
}

function capitalizarPalavra(palavra: string): string {
  // Cada parte de um hifenizado, e o que vem depois de um apóstrofo.
  return palavra
    .split('-')
    .map((parte) =>
      parte
        .split(APOSTROFOS)
        .map(capitalizar)
        .join(parte.match(APOSTROFOS)?.[0] ?? ''),
    )
    .join('-')
}

/**
 * Tudo em minúsculas, inicial maiúscula em cada palavra, menos as partículas
 * (`de da do das dos e`) que não abrem o nome (doc 05).
 */
export function titleCasePtBr(texto: string): string {
  return texto
    .toLocaleLowerCase('pt-BR')
    .split(/\s+/)
    .filter(Boolean)
    .map((palavra, i) =>
      i > 0 && PARTICULAS.has(palavra) ? palavra : capitalizarPalavra(palavra),
    )
    .join(' ')
}

export type TextTransform = 'none' | 'uppercase' | 'title_pt_br'

export function applyTransform(texto: string, transformacao: TextTransform): string {
  if (transformacao === 'uppercase') return texto.toLocaleUpperCase('pt-BR')
  if (transformacao === 'title_pt_br') return titleCasePtBr(texto)
  return texto
}
