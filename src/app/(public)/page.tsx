export default function HomePage() {
  return (
    // O container fica na página, e não no `<main>` do layout: telas de tarefa
    // única (busca, retirada, validação) usam largura menor (doc 03).
    <div className="mx-auto w-full max-w-[var(--container-max)] px-6 py-24">
      <h1 className="text-display font-bold">
        Seu certificado, <span className="text-primary">na hora.</span>
      </h1>
      <p className="text-body text-muted-foreground mt-6 max-w-2xl">
        Ache o evento, confirme seus dados e baixe o PDF. Sem cadastro.
      </p>
    </div>
  )
}
