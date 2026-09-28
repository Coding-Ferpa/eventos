import qrcode from 'qrcode-generator'

/**
 * QR do certificado (doc 05): só a matriz vem da biblioteca, e o desenho é
 * nosso, um path único que serve ao PDF e ao SVG, nítido em qualquer tamanho
 * de impressão.
 *
 * Correção de erro M, modo byte. A URL de validação tem 50 caracteres com o
 * domínio de produção, o que dá a versão 4 (33×33 módulos).
 */

/** Módulos de margem em cada lado, dentro da caixa do campo. */
export const QR_QUIET_ZONE = 4

/**
 * Abaixo de 2 cm na página canônica (56,7 pt), o módulo impresso fica menor
 * que 0,5 mm, e câmera de celular barato falha.
 */
export const QR_MIN_SIDE_PT = 56.7

/** O path em unidades de módulo, com a zona de silêncio incluída em `modules`. */
export type QrDrawing = { modules: number; path: string }

export function buildQr(texto: string): QrDrawing {
  const qr = qrcode(0, 'M')
  qr.addData(texto, 'Byte')
  qr.make()

  const tamanho = qr.getModuleCount()
  let path = ''

  for (let linha = 0; linha < tamanho; linha++) {
    let coluna = 0
    while (coluna < tamanho) {
      if (!qr.isDark(linha, coluna)) {
        coluna++
        continue
      }
      // Uma corrida de módulos escuros vira um retângulo só.
      const inicio = coluna
      while (coluna < tamanho && qr.isDark(linha, coluna)) coluna++
      const largura = coluna - inicio
      path += `M${inicio + QR_QUIET_ZONE} ${linha + QR_QUIET_ZONE}h${largura}v1h-${largura}z`
    }
  }

  return { modules: tamanho + 2 * QR_QUIET_ZONE, path }
}
