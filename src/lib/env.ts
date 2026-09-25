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

// Dois contratos públicos em vez de um. A Preview da Vercel sobe sem env de
// banco (doc 02) e serve para revisar a UI: o que toda página precisa, a URL
// do site, não pode depender do que só o login e o admin usam, o Supabase.
// Juntos, um layout que só queria a URL derrubava o build da Preview.
export const siteEnvSchema = z
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

export const supabaseEnvSchema = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    // Pública por construção: a RLS é quem protege os dados, e a Data API fica
    // desligada em produção (ADR-0012).
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  })
  .superRefine((env, ctx) => {
    recusarEnderecoLocal(
      'NEXT_PUBLIC_SUPABASE_URL',
      env.NEXT_PUBLIC_SUPABASE_URL,
      ctx,
      'Use a Project URL do painel do Supabase.',
    )
  })

export const serverEnvSchema = z
  .object({
    // Pooler Supavisor em modo transaction, usado pelo Drizzle (doc 01).
    DATABASE_URL: z.string().min(1),

    // Opcionais: sem elas o login com GitHub simplesmente não é oferecido. Os
    // nomes são os que a CLI do Supabase lê no `config.toml`, então o mesmo
    // par configura o provider local e a detecção do recurso na aplicação.
    SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID: z.string().min(1).optional(),
    SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET: z.string().min(1).optional(),
  })
  .superRefine((env, ctx) => {
    recusarEnderecoLocal(
      'DATABASE_URL',
      env.DATABASE_URL,
      ctx,
      'Copie de Supabase, Connect, Transaction pooler (porta 6543).',
    )
  })

export type SiteEnv = z.infer<typeof siteEnvSchema>
export type SupabaseEnv = z.infer<typeof supabaseEnvSchema>
export type ServerEnv = z.infer<typeof serverEnvSchema>

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

export function parseSiteEnv(source: unknown): SiteEnv {
  return parse(siteEnvSchema, source, 'site')
}

export function parseSupabaseEnv(source: unknown): SupabaseEnv {
  return parse(supabaseEnvSchema, source, 'Supabase')
}

export function parseServerEnv(source: unknown): ServerEnv {
  return parse(serverEnvSchema, source, 'servidor')
}

let cachedSiteEnv: SiteEnv | undefined
let cachedSupabaseEnv: SupabaseEnv | undefined
let cachedServerEnv: ServerEnv | undefined

// O Next só substitui `process.env.NEXT_PUBLIC_*` em build quando o acesso é
// estático: por isso a leitura explícita, chave por chave.

/** URL pública do site: toda página precisa dela. Segura em qualquer runtime. */
export function siteEnv(): SiteEnv {
  cachedSiteEnv ??= parseSiteEnv({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  })
  return cachedSiteEnv
}

/** Endereço e chave pública do Supabase: só quem fala com o Auth pede. */
export function supabaseEnv(): SupabaseEnv {
  cachedSupabaseEnv ??= parseSupabaseEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  })
  return cachedSupabaseEnv
}

/** Variáveis de servidor, incluindo segredos. Nunca chamar em código de cliente. */
export function serverEnv(): ServerEnv {
  if (typeof window !== 'undefined') {
    throw new Error(
      'serverEnv() só pode ser lido no servidor: no navegador, só as variáveis públicas.',
    )
  }
  cachedServerEnv ??= parseServerEnv(process.env)
  return cachedServerEnv
}

/**
 * O login com GitHub só aparece quando há credenciais configuradas: em
 * desenvolvimento a entrada é por e-mail e senha, e o OAuth App é criado na
 * ida para produção (M9).
 */
export function isGithubOAuthEnabled(): boolean {
  return Boolean(serverEnv().SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID)
}
