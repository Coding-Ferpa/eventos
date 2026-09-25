import { getCurrentUser } from '@/lib/auth'
import { ROTULO_DO_PAPEL } from '@/lib/roles'

export default async function AdminHomePage() {
  // O layout já garantiu a sessão; aqui ela só dá nome à saudação.
  const usuario = await getCurrentUser()

  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-h2 font-bold">Visão geral</h1>
      <p className="text-muted-foreground">
        Você entrou como{' '}
        <strong className="text-foreground font-semibold">
          {usuario ? ROTULO_DO_PAPEL[usuario.role] : ''}
        </strong>
        . Os eventos aparecem aqui assim que a primeira tela de cadastro existir.
      </p>
    </section>
  )
}
