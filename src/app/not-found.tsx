import Link from 'next/link'

/**
 * Vale para qualquer caminho que não casa com rota nenhuma, inclusive fora do
 * grupo público, então traz o próprio enquadramento em vez de depender do
 * cabeçalho e do rodapé.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-h2 font-bold">Essa página não existe</h1>

      <p className="text-body text-muted-foreground">Que tal ver os eventos?</p>

      <Link
        className="bg-primary-solid mt-2 inline-flex min-h-11 items-center rounded-full px-6 font-semibold text-white transition duration-150"
        href="/"
      >
        Ver eventos
      </Link>
    </main>
  )
}
