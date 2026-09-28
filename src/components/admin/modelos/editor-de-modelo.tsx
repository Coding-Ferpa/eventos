'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm, type Resolver } from 'react-hook-form'

import type { ActionResult } from '@/actions/result'
import { publishTemplate, saveTemplateDraft } from '@/actions/templates'
import { ActionFeedback } from '@/components/admin/action-feedback'
import { Button } from '@/components/ui/button'
import { Form } from '@/components/ui/form'
import { CURATED_FONTS } from '@/features/certificate/fonts/catalog'
import { templateDraftSchema, type TemplateDraft } from '@/features/certificate/publish'
import type { TemplatePage } from '@/features/certificate/schema'

import { ArteDoModelo } from './arte-do-modelo'
import { CamposDeConteudo } from './campos-de-conteudo'
import { CamposPosicionados } from './campos-posicionados'
import { FontesEnviadas, type FonteNaLista } from './fontes-enviadas'
import { PreviaAoVivo, type EventoDaPrevia } from './previa-ao-vivo'

/**
 * O editor de modelo do M6 (doc 05): formulário numérico, prévia ao vivo com
 * o motor rodando no navegador, rascunho e publicação. O rascunho nunca afeta
 * downloads; o PDF só muda com "Publicar".
 */

type Props = {
  templateId: string
  paginas: TemplatePage[]
  fundos: (string | null)[]
  rascunho: TemplateDraft
  evento: EventoDaPrevia
  tipo: { label: string; defaultHours: string } | null
  siteUrl: string
  fontesEnviadas: FonteNaLista[]
}

function Secao({
  titulo,
  descricao,
  children,
}: {
  titulo: string
  descricao?: string
  children: React.ReactNode
}) {
  const id = `secao-${titulo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z]+/g, '-')}`
  return (
    <section
      aria-labelledby={id}
      className="border-border bg-card flex flex-col gap-4 rounded-md border p-5"
    >
      <header className="flex flex-col gap-1">
        <h2 className="text-h3 font-semibold" id={id}>
          {titulo}
        </h2>
        {descricao ? (
          <p className="text-caption text-muted-foreground">{descricao}</p>
        ) : null}
      </header>
      {children}
    </section>
  )
}

export function EditorDeModelo(props: Props) {
  const router = useRouter()
  const [salvo, setSalvo] = useState<ActionResult<unknown> | null>(null)
  const [publicado, setPublicado] = useState<ActionResult<unknown> | null>(null)
  const [problemas, setProblemas] = useState<string[]>([])

  const form = useForm<TemplateDraft>({
    // Os padrões do schema (entrelinha, linhas) tipam a entrada como opcional.
    resolver: zodResolver(templateDraftSchema) as Resolver<TemplateDraft>,
    defaultValues: props.rascunho,
    mode: 'onChange',
  })

  async function salvar(valores: TemplateDraft) {
    setPublicado(null)
    const resposta = await saveTemplateDraft({ id: props.templateId, ...valores })
    setSalvo(resposta)
    if (resposta.ok) {
      form.reset(valores)
      router.refresh()
    }
  }

  async function publicar() {
    setSalvo(null)
    setProblemas([])
    const resposta = await publishTemplate({ id: props.templateId })
    setPublicado(resposta)
    if (!resposta.ok) setProblemas(resposta.error.fieldErrors?.publicar ?? [])
    else router.refresh()
  }

  const fontes = [
    ...CURATED_FONTS.map((fonte) => ({
      ref: fonte.ref,
      rotulo: `${fonte.family} ${fonte.weight}`,
    })),
    ...props.fontesEnviadas.map((fonte) => ({
      ref: `custom:${fonte.id}`,
      rotulo: `${fonte.family} ${fonte.weight} (enviada)`,
    })),
  ]
  const alterado = form.formState.isDirty

  return (
    <>
      <p
        className="text-caption border-border rounded-md border p-4 lg:hidden"
        role="status"
      >
        O editor de modelos precisa de uma tela com pelo menos 1024 px de largura. Abra no
        computador.
      </p>

      <Form {...form}>
        <form
          className="hidden gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
          noValidate
          onSubmit={form.handleSubmit(salvar)}
        >
          <div className="flex flex-col gap-6">
            <Secao
              descricao="A arte do certificado, sem nenhum nome escrito."
              titulo="Arte"
            >
              <ArteDoModelo paginas={props.paginas} templateId={props.templateId} />
            </Secao>
            <Secao
              descricao="O que cada certificado traz além do nome, vindo da planilha."
              titulo="Campos de conteúdo"
            >
              <CamposDeConteudo />
            </Secao>
            <Secao
              descricao="O que é escrito sobre a arte, e onde."
              titulo="Campos posicionados"
            >
              <CamposPosicionados fontes={fontes} temVerso={props.paginas.length === 2} />
            </Secao>
            <Secao
              descricao="Além da Poppins, as fontes que a organização enviou."
              titulo="Fontes"
            >
              <FontesEnviadas fontes={props.fontesEnviadas} />
            </Secao>
          </div>

          <div className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
            <PreviaAoVivo
              evento={props.evento}
              fundos={props.fundos}
              paginas={props.paginas}
              pesosDasEnviadas={Object.fromEntries(
                props.fontesEnviadas.map((fonte) => [fonte.id, fonte.weight]),
              )}
              siteUrl={props.siteUrl}
              templateId={props.templateId}
              tipo={props.tipo}
            />

            <div className="flex flex-wrap items-center gap-3">
              <Button disabled={form.formState.isSubmitting || !alterado} type="submit">
                Salvar rascunho
              </Button>
              <Button
                disabled={alterado}
                onClick={() => void publicar()}
                type="button"
                variant="outline"
              >
                Publicar
              </Button>
              {alterado ? (
                <span className="text-caption text-muted-foreground">
                  Salve antes de publicar.
                </span>
              ) : null}
            </div>
            <ActionFeedback
              mensagemDeSucesso="Rascunho salvo. Os downloads não mudam até publicar."
              resultado={salvo}
            />
            <ActionFeedback
              mensagemDeSucesso="Modelo publicado: os próximos PDFs já saem com ele."
              resultado={publicado}
            />
            {problemas.length > 0 ? (
              <ul className="text-caption text-destructive flex list-disc flex-col gap-1 pl-5">
                {problemas.map((problema) => (
                  <li key={problema}>{problema}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </form>
      </Form>
    </>
  )
}
