/**
 * Log estruturado em JSON no stdout, que a Vercel coleta (doc 10).
 *
 * Só os campos da lista branca chegam à linha. O tipo recusa os outros, e o
 * filtro em tempo de execução descarta o que escapar por um cast: logar um
 * nome, um CPF ou um e-mail fica impossível por descuido. IDs internos podem:
 * não são dado pessoal por si e nunca saem em resposta pública.
 */

const CAMPOS_PERMITIDOS = [
  'event',
  'route',
  'code',
  'status',
  'duration_ms',
  'event_id',
  'template_id',
  'certificate_id',
  'batch_id',
  'actor_id',
  'outcome',
] as const

type Campo = (typeof CAMPOS_PERMITIDOS)[number]

export type RegistroDeLog = { event: string } & Partial<
  Record<Exclude<Campo, 'event'>, string | number | boolean | null>
>

type Nivel = 'info' | 'warn' | 'error'

const SAIDA: Record<Nivel, (linha: string) => void> = {
  info: (linha) => console.log(linha),
  warn: (linha) => console.warn(linha),
  error: (linha) => console.error(linha),
}

function escrever(nivel: Nivel, registro: RegistroDeLog) {
  const permitidos = Object.fromEntries(
    Object.entries(registro).filter(([campo]) =>
      (CAMPOS_PERMITIDOS as readonly string[]).includes(campo),
    ),
  )

  SAIDA[nivel](
    JSON.stringify({ level: nivel, time: new Date().toISOString(), ...permitidos }),
  )
}

export const logger = {
  info: (registro: RegistroDeLog) => escrever('info', registro),
  warn: (registro: RegistroDeLog) => escrever('warn', registro),
  error: (registro: RegistroDeLog) => escrever('error', registro),
}
