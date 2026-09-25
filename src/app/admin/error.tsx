'use client'

/**
 * Anteparo do admin (doc 02): erro aqui nunca mostra stack trace. O `digest`
 * liga a tela ao log do servidor.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <section className="flex flex-col items-start gap-3">
      <h1 className="text-h3 font-bold">Algo saiu do trilho</h1>
      <p className="text-muted-foreground">
        O problema é do nosso lado. Tente de novo em instantes.
      </p>
      <button
        className="bg-primary-solid text-primary-foreground rounded-full px-5 py-2 font-semibold transition duration-150"
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
    </section>
  )
}
