import { SiteFooter } from '@/components/layout/site-footer'
import { SiteHeader } from '@/components/layout/site-header'
import { SCRIPT_DE_TEMA } from '@/lib/theme'

export default function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col">
      {/* Aplica o tema antes da primeira pintura, senão a página pisca clara
          antes de escurecer. Fica no layout público porque só aqui a CSP
          permite script inline: /admin e /login passam a usar nonce no M2 e
          ficam no tema escuro padrão (ADR-0012 do CF Jobs). */}
      <script dangerouslySetInnerHTML={{ __html: SCRIPT_DE_TEMA }} />

      {/* Primeiro elemento focável da página (doc 03). Invisível até receber
          o foco, e aí visível de verdade, não só para leitor de tela. */}
      <a
        className="bg-card text-foreground focus:ring-primary sr-only rounded-md px-4 py-2 focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-20 focus:ring-2"
        href="#conteudo"
      >
        Pular para o conteúdo
      </a>

      <SiteHeader />
      <main className="flex-1" id="conteudo">
        {children}
      </main>
      <SiteFooter />
    </div>
  )
}
