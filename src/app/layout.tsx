import { Analytics } from '@vercel/analytics/next'
import type { Metadata } from 'next'
import { JetBrains_Mono, Poppins } from 'next/font/google'

import { siteEnv } from '@/lib/env'
import { OPEN_GRAPH_BASE } from '@/lib/metadata'

import './globals.css'

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  // `optional` em vez de `swap`: a troca tardia da fonte reflowa o título e
  // estoura o orçamento de CLS do doc 09. Quem não recebe a Poppins a tempo
  // fica na fonte do sistema e não vê o texto pular.
  display: 'optional',
})

// Sem preload aqui: só `/validar` e a tela de retirada mostram código logo de
// cara, e elas declaram a própria instância com preload (doc 09). As demais
// páginas baixam a fonte só se chegarem a usá-la.
const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-jetbrains-mono',
  display: 'optional',
  preload: false,
})

export const metadata: Metadata = {
  // Base para canonical e Open Graph resolverem URL relativa.
  metadataBase: new URL(siteEnv().NEXT_PUBLIC_SITE_URL),
  title: {
    default: 'CF Eventos: certificados da comunidade Coding Ferpa',
    template: '%s · CF Eventos',
  },
  description:
    'Ache o evento, confirme seus dados e baixe o certificado em PDF. Sem cadastro.',
  openGraph: OPEN_GRAPH_BASE,
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // Sai do servidor sem `data-theme`: quem o aplica é o script inline do
    // doc 03, antes da primeira pintura. Ler o cookie aqui tornaria toda
    // página dinâmica e mataria o ISR da área pública.
    <html
      className={`${poppins.variable} ${jetBrainsMono.variable}`}
      lang="pt-BR"
      suppressHydrationWarning
    >
      <body>
        {children}

        {/* Visão de páginas sem cookie e sem identificador persistente
            (doc 10). Fora da Vercel o script responde 404 e o pacote loga o
            motivo: é barulho em desenvolvimento, não erro. */}
        <Analytics />
      </body>
    </html>
  )
}
