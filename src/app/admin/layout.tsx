import type { Metadata } from 'next'
import Link from 'next/link'
import { NuqsAdapter } from 'nuqs/adapters/next/app'

import { sair } from '@/actions/auth'
import { AdminNav } from '@/components/admin/admin-nav'
import { requireRole } from '@/lib/auth'
import { MIN_ADMIN_ROLE, ROTULO_DO_PAPEL } from '@/lib/roles'

export const metadata: Metadata = {
  title: { default: 'Administração', template: '%s · Administração' },
  robots: { index: false, follow: false },
}

// Dados do admin são sempre frescos (doc 09): nada de cache aqui.
export const dynamic = 'force-dynamic'

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // O proxy já manda para o login quem não entrou, mas a autorização de
  // verdade acontece aqui, no servidor, a cada renderização (doc 08).
  const usuario = await requireRole(MIN_ADMIN_ROLE)

  return (
    // Mais denso que a área pública, com raio menor (doc 03): o `--radius-md`
    // local encolhe tudo que usa `rounded-md` aqui dentro, sem tocar em cada
    // componente.
    //
    // O `data-theme` fixo existe porque o admin não roda o script de tema (a
    // CSP com nonce não o deixa, ADR-0012 do CF Jobs): sem ele, as cores já
    // saem escuras pelo `:root`, mas as variantes `dark:` dos componentes do
    // shadcn nunca se aplicariam.
    <div className="min-h-dvh [--radius-md:0.5rem]" data-theme="dark">
      <header className="border-border bg-card border-b">
        <div className="mx-auto flex h-[var(--header-height)] w-full max-w-[var(--container-max)] items-center justify-between gap-4 px-6">
          <Link className="font-semibold" href="/admin">
            CF Eventos <span className="text-muted-foreground font-normal">· admin</span>
          </Link>

          <div className="flex items-center gap-4">
            <span className="text-caption text-muted-foreground">
              {usuario.email}
              <span className="bg-surface text-muted-foreground ml-2 rounded-full px-2 py-0.5 font-mono text-xs">
                {ROTULO_DO_PAPEL[usuario.role]}
              </span>
            </span>

            <form action={sair}>
              <button
                className="border-border hover:border-primary-muted text-caption rounded-full border px-4 py-1.5 transition duration-150"
                type="submit"
              >
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[var(--container-max)] flex-col gap-6 px-6 py-8 lg:flex-row lg:gap-8">
        <aside className="border-border border-b pb-4 lg:w-[200px] lg:shrink-0 lg:border-b-0 lg:pb-0">
          <div className="lg:sticky lg:top-8">
            <AdminNav papel={usuario.role} />
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col gap-6">
          {/* Filtros e paginação das tabelas moram na URL (doc 09). */}
          <NuqsAdapter>{children}</NuqsAdapter>
        </main>
      </div>
    </div>
  )
}
