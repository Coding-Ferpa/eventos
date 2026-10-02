import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * Cookie de retirada (doc 08, ADR-0010): o sucesso da busca vira
 * `{ v: 1, pids, src, exp }` cifrado com AES-256-GCM, e é ele que autoriza a
 * tela de retirada, o download e o pedido de correção por 30 minutos.
 *
 * Cifrado, e não só assinado: "nenhuma resposta expõe id de participante"
 * vale até para quem abre o DevTools. Sem estado no servidor; a revogação
 * dentro dos 30 minutos é coberta porque o download sempre relê o certificado.
 */

export const COOKIE_DE_RETIRADA = 'cf-retirada'

const TRINTA_MINUTOS_S = 30 * 60
const MAXIMO_DE_PESSOAS = 40
const ROTULO = Buffer.from(COOKIE_DE_RETIRADA)

export const OPCOES_DO_COOKIE_DE_RETIRADA = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  maxAge: TRINTA_MINUTOS_S,
  path: '/',
} as const

/** Como a pessoa chegou: decide a métrica de origem e se o fim do CPF aparece. */
export type OrigemDaRetirada =
  'search_cpf' | 'search_email' | 'search_name' | 'search_all' | 'token' | 'mine'

export type Retirada = { pids: string[]; src: OrigemDaRetirada; exp: number }

const ORIGENS = new Set<string>([
  'search_cpf',
  'search_email',
  'search_name',
  'search_all',
  'token',
  'mine',
])
const PARTE = /^[A-Za-z0-9_-]+$/

export function selarRetirada(
  chave: Buffer,
  { pids, src }: Pick<Retirada, 'pids' | 'src'>,
  agora: Date = new Date(),
): string {
  if (pids.length === 0 || pids.length > MAXIMO_DE_PESSOAS) {
    throw new Error(`O cookie de retirada leva de 1 a ${MAXIMO_DE_PESSOAS} pessoas.`)
  }
  const exp = Math.floor(agora.getTime() / 1000) + TRINTA_MINUTOS_S
  const iv = randomBytes(12)
  const cifra = createCipheriv('aes-256-gcm', chave, iv)
  cifra.setAAD(ROTULO)
  const conteudo = Buffer.concat([
    cifra.update(JSON.stringify({ v: 1, pids, src, exp }), 'utf8'),
    cifra.final(),
    cifra.getAuthTag(),
  ])
  return `v1.${iv.toString('base64url')}.${conteudo.toString('base64url')}`
}

/** A retirada, ou `null` quando o cookie falta, foi adulterado, é de outra chave ou venceu. */
export function abrirRetirada(
  valor: string | undefined,
  chave: Buffer,
  agora: Date = new Date(),
): Retirada | null {
  const partes = valor?.split('.') ?? []
  if (
    partes.length !== 3 ||
    partes[0] !== 'v1' ||
    !PARTE.test(partes[1]!) ||
    !PARTE.test(partes[2]!)
  ) {
    return null
  }
  const iv = Buffer.from(partes[1]!, 'base64url')
  const conteudo = Buffer.from(partes[2]!, 'base64url')
  if (iv.length !== 12 || conteudo.length <= 16) return null

  let dados: { v?: unknown; pids?: unknown; src?: unknown; exp?: unknown }
  try {
    const decifra = createDecipheriv('aes-256-gcm', chave, iv)
    decifra.setAAD(ROTULO)
    decifra.setAuthTag(conteudo.subarray(-16))
    const texto = Buffer.concat([
      decifra.update(conteudo.subarray(0, -16)),
      decifra.final(),
    ])
    dados = JSON.parse(texto.toString('utf8')) as typeof dados
  } catch {
    return null
  }
  if (
    dados.v !== 1 ||
    !Array.isArray(dados.pids) ||
    !dados.pids.every((pid) => typeof pid === 'string') ||
    typeof dados.src !== 'string' ||
    !ORIGENS.has(dados.src) ||
    typeof dados.exp !== 'number'
  ) {
    return null
  }
  if (dados.exp <= Math.floor(agora.getTime() / 1000)) return null
  return {
    pids: dados.pids as string[],
    src: dados.src as OrigemDaRetirada,
    exp: dados.exp,
  }
}
