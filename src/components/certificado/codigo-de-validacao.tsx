import { formatCode } from '@/features/certificate/code'

/**
 * O código de validação na tela (docs 03 e 09): `<code>` em JetBrains Mono, em
 * grupos, e soletrado por grupo para o leitor de tela. Lido de uma vez,
 * "K7M2X9P" vira uma palavra que ninguém consegue ditar por telefone. Texto
 * escondido, e não `aria-label` num span, que boa parte dos leitores ignora.
 */
export function CodigoDeValidacao({
  code,
  className,
}: {
  code: string
  className?: string
}) {
  const formatado = formatCode(code)
  const soletrado = formatado
    .split('-')
    .map((grupo) => [...grupo].join(' '))
    .join(', ')
  return (
    <code className={['font-mono tracking-wider', className].filter(Boolean).join(' ')}>
      <span aria-hidden="true">{formatado}</span>
      <span className="sr-only">{soletrado}</span>
    </code>
  )
}
