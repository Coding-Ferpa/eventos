'use client'

import { Search } from 'lucide-react'
import { useQueryStates } from 'nuqs'
import { useEffect, useState } from 'react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { STATUS_DO_EVENTO } from '@/lib/schemas/event'

import { parametrosDaLista } from './parametros'
import { ROTULO_DO_STATUS_NO_ADMIN } from './rotulos'

/** O `<Select>` do Radix não aceita valor vazio; este sentinela é "todos". */
const TODOS = '__todos__'
const ESPERA_DA_BUSCA_MS = 300

export function FiltrosDeEventos() {
  // `shallow: false`: a lista é renderizada no servidor, então mudar o filtro
  // precisa buscar a página de novo, e não só trocar a URL.
  const [filtros, setFiltros] = useQueryStates(parametrosDaLista, { shallow: false })
  const [texto, setTexto] = useState(filtros.busca)

  // A busca espera a pessoa parar de digitar, para não buscar a cada letra.
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
        <Label htmlFor="busca-de-eventos">Buscar pelo título</Label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
          />
          <Input
            className="pl-9"
            id="busca-de-eventos"
            onChange={(evento) => setTexto(evento.target.value)}
            type="search"
            value={texto}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5 sm:w-60">
        <Label htmlFor="status-de-eventos">Status</Label>
        <Select
          onValueChange={(valor) =>
            void setFiltros({
              status:
                valor === TODOS ? null : (valor as (typeof STATUS_DO_EVENTO)[number]),
              pagina: null,
            })
          }
          value={filtros.status ?? TODOS}
        >
          <SelectTrigger id="status-de-eventos">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos os status</SelectItem>
            {STATUS_DO_EVENTO.map((status) => (
              <SelectItem key={status} value={status}>
                {ROTULO_DO_STATUS_NO_ADMIN[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
