'use client'

import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useFormContext, useWatch } from 'react-hook-form'

import { createFontReadUrls } from '@/actions/fonts'
import { getLongestNameSample } from '@/actions/templates'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { buildDataSchema } from '@/features/certificate/data-schema'
import type { LayoutWarning } from '@/features/certificate/layout/layout'
import { templateDraftSchema, type TemplateDraft } from '@/features/certificate/publish'
import type { DataField, TemplatePage } from '@/features/certificate/schema'
import type { TokenContext } from '@/features/certificate/tokens'

/**
 * A prévia ao vivo (doc 05): o motor roda no navegador a cada mudança do
 * formulário, sem ida ao servidor. Enquanto o rascunho tem erro, a última
 * prévia válida fica na tela, marcada como desatualizada.
 */

export type EventoDaPrevia = {
  title: string
  locationName: string | null
  city: string | null
  startsAt: string
  endsAt: string | null
}

type Props = {
  templateId: string
  paginas: TemplatePage[]
  fundos: (string | null)[]
  evento: EventoDaPrevia
  tipo: { label: string; defaultHours: string } | null
  siteUrl: string
  pesosDasEnviadas: Record<string, number>
}

const NOME_DE_EXEMPLO = 'José Gonçalves de Assunção'

/** Um valor de exemplo por campo de conteúdo: o padrão, se houver. */
function dadosDeExemplo(campos: DataField[]) {
  const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const brutos = Object.fromEntries(
    campos.map((campo) => [
      campo.key,
      campo.default ??
        { text: `[${campo.label}]`, number: '1', date: hoje, hours: '8' }[campo.type],
    ]),
  )
  const lido = buildDataSchema(campos).safeParse(brutos)
  return lido.success ? lido.data : {}
}

export function PreviaAoVivo(props: Props) {
  const { control } = useFormContext<TemplateDraft>()
  const valores = useWatch({ control }) as TemplateDraft
  const adiado = useDeferredValue(valores)
  const idDoNome = useId()

  const [digitado, setDigitado] = useState(NOME_DE_EXEMPLO)
  const nome = digitado.trim() || NOME_DE_EXEMPLO
  const [pagina, setPagina] = useState(1)
  const [svg, setSvg] = useState<string | null>(null)
  const [avisos, setAvisos] = useState<LayoutWarning[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [buscandoNome, setBuscandoNome] = useState(false)
  const urlsDasEnviadas = useRef(new Map<string, string>())

  // Com erro no rascunho, a última prévia válida fica, marcada como velha.
  const leitura = useMemo(() => templateDraftSchema.safeParse(adiado), [adiado])
  const desatualizada = !leitura.success

  const campoDoNome = adiado.layout_fields.find(
    (campo) => campo.kind === 'text' && campo.content.includes('participant.full_name'),
  )

  useEffect(() => {
    if (props.paginas.length === 0 || !leitura.success) return
    const rascunho = leitura.data
    let cancelado = false

    ;(async () => {
      const referencias = rascunho.layout_fields.flatMap((campo) =>
        campo.kind === 'text' ? [campo.font] : [],
      )
      const faltam = [
        ...new Set(
          referencias
            .filter((ref) => ref.startsWith('custom:'))
            .map((ref) => ref.slice('custom:'.length))
            .filter((id) => !urlsDasEnviadas.current.has(id)),
        ),
      ]
      if (faltam.length > 0) {
        const urls = await createFontReadUrls({ ids: faltam })
        if (!urls.ok) throw new Error(urls.error.message)
        for (const [id, url] of Object.entries(urls.data))
          urlsDasEnviadas.current.set(id, url)
      }

      const motor = await import('./motor-no-navegador')
      const fontes = await motor.prepararFontes(
        referencias,
        [...urlsDasEnviadas.current].map(([id, url]) => ({
          id,
          url,
          weight: props.pesosDasEnviadas[id] ?? 400,
        })),
      )
      const contexto: TokenContext = {
        siteUrl: props.siteUrl,
        participant: { fullName: nome, cpfLast3: '145' },
        event: {
          title: props.evento.title,
          locationName: props.evento.locationName,
          city: props.evento.city,
          startsAt: new Date(props.evento.startsAt),
          endsAt: props.evento.endsAt ? new Date(props.evento.endsAt) : null,
        },
        participation: { label: props.tipo?.label ?? 'Participante' },
        certificate: {
          hours: Number(props.tipo?.defaultHours) || 8,
          code: 'DEM0CF2026',
          issuedAt: new Date(),
          sequence: 42,
          data: dadosDeExemplo(rascunho.data_fields),
        },
      }
      const paginaValida = Math.min(pagina, props.paginas.length)
      const { svg: desenho, warnings } = motor.desenharPrevia({
        snapshot: {
          schema_version: 1,
          version: 1,
          base_pdf_path: 'previa',
          base_pdf_sha256: '0'.repeat(64),
          base_pdf_size_bytes: 1,
          pages: props.paginas,
          ...rascunho,
        },
        context: contexto,
        fonts: fontes,
        page: paginaValida,
        backgroundUrl: props.fundos[paginaValida - 1] ?? null,
      })
      if (cancelado) return
      setSvg(desenho)
      setAvisos(warnings)
      setErro(null)
    })().catch((falha: unknown) => {
      if (!cancelado) setErro(falha instanceof Error ? falha.message : 'A prévia falhou.')
    })

    return () => {
      cancelado = true
    }
  }, [
    leitura,
    nome,
    pagina,
    props.paginas,
    props.fundos,
    props.evento,
    props.tipo,
    props.siteUrl,
    props.pesosDasEnviadas,
  ])

  async function testarNomeMaisLongo() {
    if (!campoDoNome || campoDoNome.kind !== 'text') return
    setBuscandoNome(true)
    const resposta = await getLongestNameSample({
      templateId: props.templateId,
      font: campoDoNome.font,
      transform: campoDoNome.transform,
    })
    setBuscandoNome(false)
    if (resposta.ok) setDigitado(resposta.data.nome)
    else setErro(resposta.error.message)
  }

  if (props.paginas.length === 0) {
    return (
      <p className="text-caption text-muted-foreground border-border rounded-md border border-dashed p-6 text-center">
        Envie a arte para ver a prévia.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {props.paginas.length === 2 ? (
        <div aria-label="Página da prévia" className="flex gap-2" role="group">
          {['Frente', 'Verso'].map((rotulo, i) => (
            <Button
              aria-pressed={pagina === i + 1}
              key={rotulo}
              onClick={() => setPagina(i + 1)}
              size="sm"
              type="button"
              variant={pagina === i + 1 ? 'default' : 'outline'}
            >
              {rotulo}
            </Button>
          ))}
        </div>
      ) : null}

      <div
        className={`border-border overflow-hidden rounded-md border bg-white transition-opacity [&>svg]:block [&>svg]:h-auto [&>svg]:w-full ${desatualizada ? 'opacity-50' : ''}`}
        data-testid="previa-do-modelo"
        // O SVG sai do desenhista do motor, que escapa rótulo e URL (doc 05,
        // teste de injeção em draw/svg.test.ts).
        dangerouslySetInnerHTML={{ __html: svg ?? '' }}
      />
      {desatualizada ? (
        <p className="text-caption text-warning" role="status">
          A prévia está desatualizada: corrija os campos destacados.
        </p>
      ) : null}
      {erro ? (
        <p className="text-caption text-destructive" role="alert">
          {erro}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={idDoNome}>Nome de exemplo</Label>
        <div className="flex gap-2">
          <Input
            id={idDoNome}
            onChange={(evento) => setDigitado(evento.target.value)}
            value={digitado}
          />
          <Button
            disabled={!campoDoNome || buscandoNome}
            onClick={() => void testarNomeMaisLongo()}
            type="button"
            variant="outline"
          >
            Testar com o nome mais longo deste evento
          </Button>
        </div>
      </div>

      {avisos.length > 0 ? (
        <ul className="text-caption text-warning flex flex-col gap-1" role="status">
          {avisos.map((aviso) => (
            <li key={`${aviso.fieldId}-${aviso.code}`}>
              {aviso.fieldId}: {aviso.detail}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
