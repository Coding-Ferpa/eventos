'use client'

import { useEffect, useRef } from 'react'

/**
 * O `<h1>` que recebe o foco ao abrir (doc 03, 6c): quem usa leitor de tela
 * chega da busca e ouve o resultado, em vez do começo da página.
 */
export function FocoNoTitulo({ children }: { children: React.ReactNode }) {
  const titulo = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    titulo.current?.focus()
  }, [])
  return (
    <h1 className="text-h2 font-bold outline-none" ref={titulo} tabIndex={-1}>
      {children}
    </h1>
  )
}
