/**
 * As rotas que geram PDF e, por isso, leem as fontes curadas do disco.
 *
 * `public/` é servido pela CDN e não entra no pacote da função sozinho
 * (armadilha 14 do doc 14): o `next.config` declara a pasta das fontes em
 * `outputFileTracingIncludes` para cada rota daqui, e o `check:fonts-trace`
 * confere no rastro do build que as TTFs chegaram. Rota nova que gera PDF
 * entra nesta lista, e as duas coisas vêm juntas.
 */
export const ROTAS_QUE_GERAM_PDF = ['/api/dev/certificado-exemplo'] as const

export const FONTES_CURADAS_NO_PACOTE = ['./public/fonts/cert/*.ttf']
