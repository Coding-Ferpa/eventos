'use client'

/**
 * Anteparo das rotas públicas (doc 02): erro aqui nunca mostra stack trace.
 * O `digest` é o que liga esta tela ao log do servidor, e sem ele quem relata
 * o problema não tem como ser encontrado.
 */
export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 px-6 py-24 text-center">
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
    </div>
  )
}
