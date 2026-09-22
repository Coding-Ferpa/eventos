import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // O Next transmite a metadata em vez de segurar o shell, e quando a página
  // renderiza rápido as tags saem depois do </head>, onde rastreador nenhum
  // garante que lê. Casar todos os user agents devolve a metadata bloqueante
  // para todo mundo (ADR-0013 do CF Jobs, herdado pelo ADR-0001).
  htmlLimitedBots: /.*/,
}

export default nextConfig
