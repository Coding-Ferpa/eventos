import type { MetadataRoute } from 'next'

import { siteEnv } from '@/lib/env'

/**
 * Tudo aberto, menos o que é da organização e o que tem nome de pessoa
 * (doc 09). `/validar/`, com a barra, bloqueia só as páginas de resultado: o
 * formulário `/validar` continua indexável.
 */
export default function robots(): MetadataRoute.Robots {
  const base = siteEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/admin',
        '/login',
        '/api',
        '/eventos/*/certificado',
        '/validar/',
        '/certificado/',
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  }
}
