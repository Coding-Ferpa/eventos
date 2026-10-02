'use client'

import { useQueryStates } from 'nuqs'
import { useEffect, useState } from 'react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { parametrosDosParticipantes } from './parametros'

const ESPERA_DA_BUSCA_MS = 300

/** Lote e nome, na URL: "importados no lote de 12/09 às 23h14" é um link. */
export function FiltrosDeParticipantes({
  lotes,
}: {
  lotes: { id: string; rotulo: string }[]
}) {
  const [filtros, setFiltros] = useQueryStates(parametrosDosParticipantes, {
    shallow: false,
  })
  const [texto, setTexto] = useState(filtros.busca)

  useEffect(() => {
    if (texto === filtros.busca) return
    const espera = setTimeout(() => {
      void setFiltros({ busca: texto || null, pagina: null })
    }, ESPERA_DA_BUSCA_MS)
    return () => clearTimeout(espera)
  }, [texto, filtros.busca, setFiltros])

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="busca-de-participantes">Buscar pelo nome</Label>
        <Input
          id="busca-de-participantes"
          onChange={(evento) => setTexto(evento.target.value)}
          type="search"
          value={texto}
        />
      </div>
      <div className="flex flex-col gap-1.5 sm:w-96">
        <Label htmlFor="lote-de-participantes">Importação</Label>
        <select
          className="border-input bg-background h-9 rounded-md border px-3"
          id="lote-de-participantes"
          onChange={(evento) =>
            void setFiltros({ lote: evento.target.value || null, pagina: null })
          }
          value={filtros.lote ?? ''}
        >
          <option value="">Todas, e os criados à mão</option>
          {lotes.map((lote) => (
            <option key={lote.id} value={lote.id}>
              {lote.rotulo}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
