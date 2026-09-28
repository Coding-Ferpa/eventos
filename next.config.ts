import type { NextConfig } from 'next'

import { FONTES_CURADAS_NO_PACOTE, ROTAS_QUE_GERAM_PDF } from './src/lib/rotas-pdf'
import { staticSecurityHeaders } from './src/lib/security-headers'

/**
 * As capas enviadas ficam no bucket público `covers` do Supabase e passam pelo
 * otimizador do `next/image` (doc 09). O endereço vem da env: sem ela, como na
 * Preview sem banco, não há capa enviada para servir.
 *
 * O Supabase local mora em 127.0.0.1, e o Next 16 recusa otimizar imagem de IP
 * local, uma proteção contra SSRF. A exceção vale só para esse caso, que só
 * existe em desenvolvimento e no CI.
 */
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL)
  : null
const supabaseLocal = supabase
  ? ['localhost', '127.0.0.1'].includes(supabase.hostname)
  : false

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabase
      ? [
          {
            protocol: supabase.protocol.replace(':', '') as 'http' | 'https',
            hostname: supabase.hostname,
            port: supabase.port,
            pathname: '/storage/v1/object/public/covers/**',
          },
        ]
      : [],
    dangerouslyAllowLocalIP: supabaseLocal,
  },
  // `public/` é servido pela CDN e não entra no pacote da função sozinho: as
  // rotas que geram PDF declaram as fontes, e o check:fonts-trace confere.
  outputFileTracingIncludes: Object.fromEntries(
    ROTAS_QUE_GERAM_PDF.map((rota) => [rota, FONTES_CURADAS_NO_PACOTE]),
  ),
  reactStrictMode: true,
  poweredByHeader: false,
  // O Next transmite a metadata em vez de segurar o shell, e quando a página
  // renderiza rápido as tags saem depois do </head>, onde rastreador nenhum
  // garante que lê. Casar todos os user agents devolve a metadata bloqueante
  // para todo mundo (ADR-0013 do CF Jobs, herdado pelo ADR-0001).
  htmlLimitedBots: /.*/,
  async headers() {
    return [{ source: '/:path*', headers: staticSecurityHeaders }]
  },
}

export default nextConfig
