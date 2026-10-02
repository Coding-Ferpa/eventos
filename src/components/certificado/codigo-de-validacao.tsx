import { formatCode } from '@/features/certificate/code'

/**
 * O código de validação na tela (doc 09): em JetBrains Mono, em grupos, e
 * soletrado por grupo para o leitor de tela. Lido de uma vez, "K7M2X9P" vira
 * uma palavra que ninguém consegue ditar por telefone. Texto escondido, e não
 * `aria-label` num span, que boa parte dos leitores ignora.
 */
export function CodigoDeValidacao({ code }: { code: string }) {
  const grupos = formatCode(code).split('-')
  const soletrado = grupos.map((grupo) => [...grupo].join(' ')).join(', ')
  return (
    <>
      <span aria-hidden="true" className="font-mono tracking-wider">
        {formatCode(code)}
      </span>
      <span className="sr-only">{soletrado}</span>
    </>
  )
}
