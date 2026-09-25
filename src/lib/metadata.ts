/**
 * Base do Open Graph de todo o site. Uma página que declara o próprio
 * `openGraph` substitui o do layout inteiro, sem mesclar: quem declara espalha
 * esta base, senão o cartão compartilhado perde o nome do site e o idioma.
 */
export const OPEN_GRAPH_BASE = {
  type: 'website',
  locale: 'pt_BR',
  siteName: 'CF Eventos',
} as const
