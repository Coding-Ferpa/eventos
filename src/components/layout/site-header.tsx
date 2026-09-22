import Link from 'next/link'

import { ThemeToggle } from '@/components/layout/theme-toggle'

export function SiteHeader() {
  return (
    <header className="border-border bg-background/90 sticky top-0 z-10 border-b backdrop-blur">
      <div className="mx-auto flex h-[var(--header-height)] w-full max-w-[var(--container-max)] items-center justify-between gap-4 px-6">
        {/* 24px em peso 700 conta como texto grande: o violeta passa no AA
            nesse tamanho, e só nele (doc 03). */}
        <Link className="text-h3 font-bold" href="/">
          CF <span className="text-primary">Eventos</span>
        </Link>

        <nav aria-label="Navegação principal" className="flex items-center gap-3">
          <ThemeToggle />
          {/* Discreto de propósito: a área administrativa é de quem organiza. */}
          <Link
            className="text-caption text-muted-foreground hover:text-foreground transition duration-150"
            href="/login"
          >
            Entrar
          </Link>
        </nav>
      </div>
    </header>
  )
}
