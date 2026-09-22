'use client'

// O `global-error` substitui o layout raiz inteiro, inclusive o `import` de
// CSS que mora nele: sem esta linha a tela de erro sairia sem estilo nenhum.
import './globals.css'

/**
 * Último anteparo do App Router: erro que estoura durante o render do layout
 * raiz não é pego por `error.tsx` nenhum, porque nesse ponto não existe layout
 * para segurar a tela. O Next substitui o documento inteiro por este
 * componente, e por isso ele traz `<html>` e `<body>` próprios.
 *
 * Fica sem `data-theme`: o script de tema mora no layout público, que é
 * justamente o que não existe aqui. O `:root` já é escuro, que é o padrão do
 * doc 03. O envio para o Sentry entra no M9.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="pt-BR">
      <body className="bg-background text-foreground antialiased">
        <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
          <h1 className="text-h2 font-bold">Algo saiu do trilho</h1>

          <p className="text-body text-muted-foreground">
            O problema é do nosso lado. Tente de novo em instantes.
          </p>

          <button
            className="bg-primary-solid mt-2 min-h-11 rounded-full px-6 font-semibold text-white transition duration-150"
            onClick={reset}
            type="button"
          >
            Tentar de novo
          </button>

          {error.digest ? (
            <p className="text-muted-foreground font-mono text-xs">
              Código do erro: {error.digest}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  )
}
