/**
 * Decodificação do arquivo da importação (doc 06): determinística, sem
 * biblioteca heurística. BOM → UTF-8 estrito → Windows-1252.
 *
 * Funciona sem estatística porque texto em Windows-1252 com acento quase
 * nunca é UTF-8 válido (um `ç` isolado, byte E7, pede dois bytes de
 * continuação que não estarão lá), e o decodificador estrito decide com
 * exatidão o caso que importa. Bibliotecas como `chardet` erram justamente em
 * arquivo pequeno, que é o caso de uma lista de evento.
 */

export type Encoding = 'utf-8' | 'utf-8-bom' | 'utf-16le' | 'utf-16be' | 'windows-1252'
export type DecodeWarning = 'MOJIBAKE_SUSPECTED'
export type Decoded = { text: string; encoding: Encoding; warnings: DecodeWarning[] }

/**
 * Texto que já chegou estragado de outro sistema: UTF-8 lido como Latin-1 e
 * gravado de novo. Não dá para consertar, mas dá para avisar antes de ir para
 * o banco.
 */
const ASSINATURAS_DE_MOJIBAKE = [
  '�',
  'Ã§',
  'Ã£',
  'Ã¡',
  'Ã©',
  'Ãª',
  'Ã­',
  'Ã³',
  'Ãµ',
  'Ãº',
]

function comeca(bytes: Uint8Array, prefixo: number[]) {
  return prefixo.every((byte, i) => bytes[i] === byte)
}

function decodificar(bytes: Uint8Array): Omit<Decoded, 'warnings'> {
  if (comeca(bytes, [0xef, 0xbb, 0xbf])) {
    return {
      text: new TextDecoder('utf-8').decode(bytes.subarray(3)),
      encoding: 'utf-8-bom',
    }
  }
  // "Texto Unicode" do Excel.
  if (comeca(bytes, [0xff, 0xfe])) {
    return {
      text: new TextDecoder('utf-16le').decode(bytes.subarray(2)),
      encoding: 'utf-16le',
    }
  }
  if (comeca(bytes, [0xfe, 0xff])) {
    return {
      text: new TextDecoder('utf-16be').decode(bytes.subarray(2)),
      encoding: 'utf-16be',
    }
  }
  try {
    // ASCII puro cai aqui também.
    return {
      text: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      encoding: 'utf-8',
    }
  } catch {
    // Nunca falha: Windows-1252 é superconjunto imprimível do ISO-8859-1.
    return {
      text: new TextDecoder('windows-1252').decode(bytes),
      encoding: 'windows-1252',
    }
  }
}

export function decodeCsv(bytes: Uint8Array): Decoded {
  const decodificado = decodificar(bytes)
  const estragado = ASSINATURAS_DE_MOJIBAKE.some((assinatura) =>
    decodificado.text.includes(assinatura),
  )
  return { ...decodificado, warnings: estragado ? ['MOJIBAKE_SUSPECTED'] : [] }
}
