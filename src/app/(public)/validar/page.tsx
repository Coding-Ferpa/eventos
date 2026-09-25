import type { Metadata } from 'next'
import { JetBrains_Mono } from 'next/font/google'

import { CodeInput } from '@/components/validacao/code-input'

export const metadata: Metadata = {
  title: 'Validar certificado',
  description:
    'Confira se um certificado da comunidade Coding Ferpa é autêntico pelo código impresso nele.',
  alternates: { canonical: '/validar' },
}

// A instância com preload fica aqui, e não no layout raiz: o código aparece
// assim que a página abre, e as outras páginas não pagam por uma fonte que
// não mostram (doc 09). Só o peso 400, o único que o campo usa: um arquivo
// estático de 21 KB, em vez do variável de 31 KB (ADR-0015).
const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: '400',
  display: 'optional',
})

/** Só o formulário, estático. O resultado, `/validar/[codigo]`, chega no M8. */
export default function ValidarPage() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-6 py-16">
      <header className="flex flex-col gap-3">
        <h1 className="text-h2 font-bold">Validar certificado</h1>
        <p className="text-body text-muted-foreground">
          Digite o código impresso no certificado ou aponte a câmera para o QR code.
        </p>
      </header>

      <CodeInput classeDaFonte={jetBrainsMono.className} />
    </div>
  )
}
