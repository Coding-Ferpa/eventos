import type { ResumoDoEvento as Resumo } from '@/db/queries/admin-events'

const PORCENTAGEM = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  maximumFractionDigits: 0,
})

/** O essencial da fase 1 (doc 10), da `v_event_summary`, numa consulta só. */
export function ResumoDoEvento({ resumo }: { resumo: Resumo }) {
  const itens: [string, string][] = [
    ['Participantes', String(resumo.participantes)],
    ['Certificados ativos', String(resumo.ativos)],
    ['Emitidos', String(resumo.emitidos)],
    [
      'Retirados',
      resumo.taxaDeRetirada === null
        ? String(resumo.retirados)
        : `${resumo.retirados} (${PORCENTAGEM.format(resumo.taxaDeRetirada)})`,
    ],
    ['Pedidos de correção pendentes', String(resumo.correcoesPendentes)],
    [
      'Busca sem resultado, 7 dias',
      resumo.buscaSemResultado === null
        ? 'Sem buscas'
        : PORCENTAGEM.format(resumo.buscaSemResultado),
    ],
  ]
  return (
    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {itens.map(([rotulo, valor]) => (
        <div className="flex flex-col gap-1" key={rotulo}>
          <dt className="text-caption text-muted-foreground">{rotulo}</dt>
          <dd className="text-h3 font-semibold tabular-nums">{valor}</dd>
        </div>
      ))}
    </dl>
  )
}
