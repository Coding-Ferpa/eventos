/**
 * Arte da capa gerada e do cartão de compartilhamento (doc 03, 6a; doc 09),
 * desenhada pelo `ImageResponse` do `next/og`.
 *
 * Os hex daqui são a exceção à regra dos tokens: o renderizador do `next/og`
 * não lê variável CSS, e o doc 03 fixa estas cores para a capa gerada. São os
 * mesmos valores do tema escuro do `globals.css`.
 *
 * A fonte é a padrão do `next/og`. A Poppins 600 que o doc 03 pede chega com o
 * catálogo de fontes do motor, no M5 (`public/fonts/cert/`).
 */

const FUNDO = '#0d0d0d'
const TEXTO = '#f5f5f5'
const TEXTO_APAGADO = '#a3a3a3'
const VIOLETA = '#8b5cf6'
// O mesmo violeta a 35%, para o brilho radial.
const BRILHO = 'rgba(139, 92, 246, 0.35)'

export function CapaGerada({
  titulo,
  detalhe,
  escala,
}: {
  titulo: string
  /** Linha de apoio, como a data. A capa do card não tem: o card já mostra. */
  detalhe?: string
  /** 1 para 1200 px de largura; a capa de 1600 px usa 4/3. */
  escala: number
}) {
  const px = (valor: number) => `${Math.round(valor * escala)}px`

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: FUNDO,
        backgroundImage: `radial-gradient(circle at 85% 15%, ${BRILHO}, transparent 55%)`,
        padding: px(64),
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: px(24) }}>
        <div style={{ display: 'flex', color: TEXTO_APAGADO, fontSize: px(30) }}>
          Comunidade Coding Ferpa
        </div>
        <div
          style={{
            display: 'flex',
            color: TEXTO,
            fontSize: px(68),
            fontWeight: 600,
            lineHeight: 1.15,
          }}
        >
          {titulo}
        </div>
        {detalhe ? (
          <div style={{ display: 'flex', color: TEXTO_APAGADO, fontSize: px(34) }}>
            {detalhe}
          </div>
        ) : null}
      </div>

      <div
        style={{
          display: 'flex',
          alignSelf: 'flex-end',
          color: TEXTO,
          fontSize: px(34),
          fontWeight: 700,
        }}
      >
        CF&nbsp;<span style={{ color: VIOLETA }}>Eventos</span>
      </div>
    </div>
  )
}
