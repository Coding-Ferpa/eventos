'use client'

import Link from 'next/link'
import { useState } from 'react'

/**
 * Link que só faz prefetch quando a pessoa mostra intenção: ponteiro em cima
 * ou foco pelo teclado. É o padrão da documentação do Next para listas de
 * links ("Preventing too many prefetches").
 *
 * Existe para o catálogo: o prefetch padrão baixa a rota inteira de cada card
 * que entra na tela, e o aluno no celular, na rede móvel do doc 09, pagaria no
 * plano de dados por eventos que não vai abrir. Links de navegação comuns
 * continuam com o `Link` de sempre.
 */
export function HoverPrefetchLink({
  href,
  className,
  children,
}: {
  href: string
  className?: string
  children: React.ReactNode
}) {
  const [comIntencao, setComIntencao] = useState(false)

  return (
    <Link
      className={className}
      href={href}
      onFocus={() => setComIntencao(true)}
      onMouseEnter={() => setComIntencao(true)}
      prefetch={comIntencao ? null : false}
    >
      {children}
    </Link>
  )
}
