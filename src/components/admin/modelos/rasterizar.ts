/**
 * O fundo da prévia é gerado no navegador do admin, no envio da arte (doc 05):
 * pdf.js rasteriza cada página do PDF, ou o canvas redimensiona a imagem, em
 * WebP de lado maior 1.600 px e até uns 200 KB. O servidor nunca rasteriza
 * nada: sem Chromium, node-canvas nem sharp no runtime.
 */

const LADO_MAIOR = 1600
const ALVO = 200 * 1024

export class ErroDeArte extends Error {}

async function webp(canvas: HTMLCanvasElement): Promise<Blob> {
  // A qualidade desce até caber no alvo; o piso evita borrar a arte.
  for (const qualidade of [0.85, 0.75, 0.65, 0.55]) {
    const blob = await new Promise<Blob | null>((resolver) =>
      canvas.toBlob(resolver, 'image/webp', qualidade),
    )
    // Navegador que não gera WebP devolve PNG: melhor avisar que subir errado.
    if (!blob || blob.type !== 'image/webp') {
      throw new ErroDeArte(
        'Este navegador não gera a prévia em WebP. Use Chrome, Edge, Firefox ou Safari atualizado.',
      )
    }
    if (blob.size <= ALVO || qualidade === 0.55) return blob
  }
  throw new Error('inalcançável')
}

function canvasDe(largura: number, altura: number) {
  const escala = LADO_MAIOR / Math.max(largura, altura)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(largura * escala)
  canvas.height = Math.round(altura * escala)
  return { canvas, escala }
}

async function paginasDoPdf(arquivo: File): Promise<Blob[]> {
  const pdfjs = await import('pdfjs-dist')
  // O worker sai da própria origem (CSP worker-src 'self'), empacotado pelo
  // webpack, e só existe nesta tela.
  pdfjs.GlobalWorkerOptions.workerPort ??= new Worker(
    new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url),
    { type: 'module' },
  )

  // No pdf.js 6 quem se destrói é a tarefa de carregamento, e não o documento.
  const tarefa = pdfjs.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()) })
  let documento
  try {
    documento = await tarefa.promise
  } catch (erro) {
    await tarefa.destroy()
    if (erro instanceof pdfjs.PasswordException) {
      throw new ErroDeArte(
        'O PDF da arte está protegido por senha. Exporte de novo sem proteção.',
      )
    }
    throw new ErroDeArte('Não conseguimos ler o PDF da arte. Exporte de novo.')
  }

  try {
    if (documento.numPages > 2) {
      throw new ErroDeArte(
        `A arte tem ${documento.numPages} páginas. O certificado aceita frente e verso, no máximo 2.`,
      )
    }
    const previas: Blob[] = []
    for (let numero = 1; numero <= documento.numPages; numero++) {
      const pagina = await documento.getPage(numero)
      const natural = pagina.getViewport({ scale: 1 })
      const { canvas, escala } = canvasDe(natural.width, natural.height)
      await pagina.render({ canvas, viewport: pagina.getViewport({ scale: escala }) })
        .promise
      previas.push(await webp(canvas))
    }
    return previas
  } finally {
    await tarefa.destroy()
  }
}

async function paginaDaImagem(arquivo: File): Promise<Blob[]> {
  const imagem = await createImageBitmap(arquivo)
  const { canvas } = canvasDe(imagem.width, imagem.height)
  canvas.getContext('2d')!.drawImage(imagem, 0, 0, canvas.width, canvas.height)
  imagem.close()
  return [await webp(canvas)]
}

/** Uma prévia WebP por página da arte, na ordem. */
export function rasterizarArte(arquivo: File): Promise<Blob[]> {
  return arquivo.type === 'application/pdf'
    ? paginasDoPdf(arquivo)
    : paginaDaImagem(arquivo)
}
