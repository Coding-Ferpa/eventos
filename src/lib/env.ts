import { z } from '@/lib/zod'

/**
 * Contrato de variáveis de ambiente. O contrato completo está no doc 01;
 * este arquivo cresce junto com os milestones, e `.env.example` cresce com
 * ele. `pnpm check:env` falha o CI se os dois divergirem.
 *
 * Declarar agora as variáveis que nenhum código lê ainda esvaziaria o gate:
 * ou elas entrariam como opcionais, e o build deixaria de recusar
 * configuração faltando, ou como obrigatórias, e ninguém conseguiria rodar o
 * projeto sem preencher segredo de recurso que não existe.
 *
 * Segredo só entra no schema de servidor. O que é `NEXT_PUBLIC_` vai para o
 * bundle do navegador e nunca pode conter valor sensível.
 */

/**
 * Endereço local: o que existe na máquina de quem desenvolve e não existe
 * dentro de um contêiner da Vercel.
 */
const HOSTS_LOCAIS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0'])

function hostDe(url: string | undefined): string | undefined {
  if (!url) return undefined
  try {
    return new URL(url).hostname
  } catch {
    return undefined
  }
}

/**
 * `VERCEL` é definida pela plataforma no build e no runtime, e por mais
 * ninguém: local e CI constroem contra o ambiente local de propósito.
 */
function naVercel(): boolean {
  return Boolean(process.env.VERCEL)
}

/**
 * Recusa endereço local quando o código roda na Vercel.
 *
 * Existe por um episódio concreto no CF Jobs: as variáveis do `.env` de
 * desenvolvimento foram coladas no painel, e o build morreu em um
 * `ECONNREFUSED 127.0.0.1` seis passos depois da causa, sem dizer qual
 * variável estava errada. Aqui isso vira uma frase.
 */
function recusarEnderecoLocal(
  chave: string,
  valor: string | undefined,
  ctx: z.RefinementCtx,
  comoCorrigir: string,
): void {
  if (!naVercel()) return

  const host = hostDe(valor)
  if (!host || !HOSTS_LOCAIS.has(host)) return

  ctx.addIssue({
    code: 'custom',
    path: [chave],
    message:
      `aponta para ${host}, que não existe dentro da Vercel: ` +
      `é o valor do ambiente de desenvolvimento. ${comoCorrigir}`,
  })
}

export const clientEnvSchema = z
  .object({
    NEXT_PUBLIC_SITE_URL: z.url(),
  })
  .superRefine((env, ctx) => {
    recusarEnderecoLocal(
      'NEXT_PUBLIC_SITE_URL',
      env.NEXT_PUBLIC_SITE_URL,
      ctx,
      'Use a URL pública do deploy: o domínio final, ou o *.vercel.app do ' +
        'projeto enquanto ele não existe. É o que vai no canonical, no Open ' +
        'Graph e no QR de todo certificado.',
    )
  })

export type ClientEnv = z.infer<typeof clientEnvSchema>

/**
 * `VARIAVEL=` em um arquivo .env significa "não informei", não "informei
 * vazio": sem isto, deixar em branco uma variável opcional quebraria a
 * validação em vez de acionar o padrão.
 */
function semVazios(source: unknown): unknown {
  if (typeof source !== 'object' || source === null) return source

  return Object.fromEntries(
    Object.entries(source as Record<string, unknown>).map(([chave, valor]) => [
      chave,
      typeof valor === 'string' && valor.trim() === '' ? undefined : valor,
    ]),
  )
}

function parse<T extends z.ZodType>(schema: T, source: unknown, scope: string) {
  const result = schema.safeParse(semVazios(source))
  if (result.success) return result.data as z.infer<T>

  const details = result.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n')
  throw new Error(
    `Variáveis de ambiente inválidas (${scope}):\n${details}\n` +
      'Copie .env.example para .env e preencha os valores.',
  )
}

export function parseClientEnv(source: unknown): ClientEnv {
  return parse(clientEnvSchema, source, 'cliente')
}

// O Next só substitui `process.env.NEXT_PUBLIC_*` em build quando o acesso é
// estático: por isso a leitura explícita, chave por chave.
const rawClientEnv = {
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
}

let cachedClientEnv: ClientEnv | undefined

/** Variáveis públicas: seguras em qualquer runtime. */
export function clientEnv(): ClientEnv {
  cachedClientEnv ??= parseClientEnv(rawClientEnv)
  return cachedClientEnv
}
