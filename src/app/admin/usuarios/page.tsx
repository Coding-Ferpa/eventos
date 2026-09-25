import type { Metadata } from 'next'

import { listarContas } from '@/db/queries/users'
import { requireRole } from '@/lib/auth'
import { ROTULO_DO_PAPEL } from '@/lib/roles'

export const metadata: Metadata = { title: 'Usuários' }

export default async function UsuariosPage() {
  // O layout exige `editor`; esta página exige mais. Esconder o link do menu
  // não basta: quem digitar o endereço também precisa ser barrado (doc 08).
  await requireRole('admin')
  const contas = await listarContas()

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-h2 font-bold">Usuários</h1>
        <p className="text-caption text-muted-foreground">
          Toda conta nova entra sem acesso. A mudança de papel ainda é feita direto no
          banco.
        </p>
      </header>

      <table className="text-caption w-full border-collapse">
        <thead>
          <tr className="border-border text-muted-foreground border-b text-left">
            <th className="py-2 pr-4 font-medium" scope="col">
              Nome
            </th>
            <th className="py-2 pr-4 font-medium" scope="col">
              E-mail
            </th>
            <th className="py-2 font-medium" scope="col">
              Papel
            </th>
          </tr>
        </thead>
        <tbody>
          {contas.map((conta) => (
            <tr className="border-border border-b" key={conta.id}>
              <td className="py-2 pr-4">{conta.nome}</td>
              <td className="text-muted-foreground py-2 pr-4">{conta.email}</td>
              <td className="py-2">{ROTULO_DO_PAPEL[conta.papel]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
