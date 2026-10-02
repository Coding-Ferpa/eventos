/**
 * As páginas e rotas que leem as fontes curadas do disco: as que geram PDF, a
 * tela de retirada (prévia SVG no servidor) e as páginas do admin cujas Server
 * Actions medem texto (o "nome mais longo" do editor e a prévia da
 * importação). Server Action roda dentro da função da página que a usa.
 *
 * `public/` é servido pela CDN e não entra no pacote da função sozinho
 * (armadilha 14 do doc 14): o `next.config` declara a pasta das fontes em
 * `outputFileTracingIncludes` para cada caminho daqui, e o `check:fonts-trace`
 * confere no rastro do build que as TTFs chegaram. O teste ao lado acha, pelo
 * grafo de imports, quem precisa estar aqui.
 */
export const ROTAS_QUE_LEEM_AS_FONTES = [
  '/api/dev/certificado-exemplo',
  '/api/certificados/[codigo]/pdf',
  '/eventos/[slug]/certificado',
  '/admin/eventos/[id]',
  '/admin/eventos/[id]/modelos/[modeloId]',
  '/admin/eventos/[id]/importar',
] as const

export const FONTES_CURADAS_NO_PACOTE = ['./public/fonts/cert/*.ttf']
