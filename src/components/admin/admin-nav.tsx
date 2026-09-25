'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/cn'
import { hasRole, type UserRole } from '@/lib/roles'

type Item = { href: string; rotulo: string; papelMinimo: UserRole }

// Cada milestone acrescenta a sua entrada: eventos no M4, modelos no M6,
// importação no M7.
const ITENS: Item[] = [
  { href: '/admin', rotulo: 'Visão geral', papelMinimo: 'editor' },
  { href: '/admin/usuarios', rotulo: 'Usuários', papelMinimo: 'admin' },
]

function ativo(pathname: string, href: string) {
  return href === '/admin' ? pathname === href : pathname.startsWith(href)
}

export function AdminNav({ papel }: { papel: UserRole }) {
  const pathname = usePathname()

  return (
    <nav aria-label="Administração">
      <ul className="flex gap-1 overflow-x-auto lg:flex-col">
        {ITENS.filter((item) => hasRole(papel, item.papelMinimo)).map((item) => (
          <li key={item.href}>
            <Link
              aria-current={ativo(pathname, item.href) ? 'page' : undefined}
              className={cn(
                'text-caption block rounded-sm px-3 py-2 whitespace-nowrap transition duration-150',
                ativo(pathname, item.href)
                  ? 'bg-surface text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              href={item.href}
            >
              {item.rotulo}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
