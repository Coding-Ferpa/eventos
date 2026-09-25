'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm, type Resolver } from 'react-hook-form'

import {
  deleteParticipationType,
  upsertParticipationType,
} from '@/actions/participation-types'
import type { ActionResult } from '@/actions/result'
import { ActionFeedback } from '@/components/admin/action-feedback'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { tipoDeParticipacaoSchema } from '@/lib/schemas/participation-type'

/**
 * Tipos de participação do evento (doc 04). Cada um tem rótulo, carga horária
 * padrão e os apelidos que a coluna de tipo do CSV pode trazer. Tipo com
 * certificado não se apaga: o certificado aponta para ele.
 */

export type TipoNaTela = {
  id: string
  slug: string
  label: string
  aliases: string[]
  defaultHours: string
  certificados: number
}

type Valores = { label: string; slug: string; aliases: string; defaultHours: string }

function FormularioDeTipo({
  eventId,
  tipo,
  aoTerminar,
}: {
  eventId: string
  tipo?: TipoNaTela
  aoTerminar: () => void
}) {
  const router = useRouter()
  const [resultado, setResultado] = useState<ActionResult<unknown> | null>(null)

  const form = useForm<Valores>({
    // O schema tipa a entrada dos apelidos e das horas como `unknown`; aqui
    // os dois chegam como texto do formulário.
    resolver: zodResolver(
      tipoDeParticipacaoSchema.omit({ eventId: true, id: true }),
      undefined,
      {
        raw: true,
      },
    ) as unknown as Resolver<Valores>,
    defaultValues: {
      label: tipo?.label ?? '',
      slug: tipo?.slug ?? '',
      aliases: tipo?.aliases.join(', ') ?? '',
      defaultHours: tipo ? String(Number(tipo.defaultHours)) : '0',
    },
  })

  async function enviar(valores: Valores) {
    const resposta = await upsertParticipationType({ ...valores, eventId, id: tipo?.id })
    setResultado(resposta)
    if (!resposta.ok) {
      for (const [campo, mensagens] of Object.entries(resposta.error.fieldErrors ?? {})) {
        form.setError(campo as keyof Valores, { message: mensagens[0] })
      }
      return
    }
    router.refresh()
    aoTerminar()
  }

  return (
    <Form {...form}>
      <form
        className="bg-surface flex flex-col gap-4 rounded-md p-4"
        noValidate
        onSubmit={form.handleSubmit(enviar)}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="label"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="slug"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Identificador</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormDescription>Minúsculas e hífens, como palestrante.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="defaultHours"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Carga horária padrão</FormLabel>
                <FormControl>
                  <Input
                    inputMode="decimal"
                    min={0}
                    step={0.5}
                    type="number"
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Em horas. Vale para quem não tiver outra na planilha.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="aliases"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Apelidos na planilha</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormDescription>
                  Separados por vírgula, como ouvinte, speaker.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <ActionFeedback resultado={resultado} />

        <div className="flex gap-2">
          <Button disabled={form.formState.isSubmitting} type="submit">
            {tipo ? 'Salvar tipo' : 'Adicionar tipo'}
          </Button>
          <Button onClick={aoTerminar} type="button" variant="ghost">
            Cancelar
          </Button>
        </div>
      </form>
    </Form>
  )
}

function ApagarTipo({ tipo }: { tipo: TipoNaTela }) {
  const router = useRouter()
  const [resultado, setResultado] = useState<ActionResult<unknown> | null>(null)

  if (tipo.certificados > 0) {
    return (
      <span className="text-caption text-muted-foreground">
        {tipo.certificados === 1 ? '1 certificado' : `${tipo.certificados} certificados`}
      </span>
    )
  }

  return (
    <>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="destructive">
            Apagar
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar o tipo {tipo.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              Ele sai deste evento. Nenhum certificado usa este tipo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const resposta = await deleteParticipationType({ id: tipo.id })
                setResultado(resposta)
                if (resposta.ok) router.refresh()
              }}
            >
              Apagar tipo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ActionFeedback resultado={resultado} />
    </>
  )
}

export function TiposDeParticipacao({
  eventId,
  tipos,
}: {
  eventId: string
  tipos: TipoNaTela[]
}) {
  const [editando, setEditando] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {tipos.map((tipo) => (
          <li
            className="border-border flex flex-col gap-3 rounded-md border p-4"
            key={tipo.id}
          >
            {editando === tipo.id ? (
              <FormularioDeTipo
                aoTerminar={() => setEditando(null)}
                eventId={eventId}
                tipo={tipo}
              />
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <span className="flex items-baseline gap-2">
                    <span className="font-medium">{tipo.label}</span>
                    <span className="text-muted-foreground font-mono text-xs">
                      {tipo.slug}
                    </span>
                  </span>
                  <span className="text-caption text-muted-foreground">
                    {Number(tipo.defaultHours) > 0 ? (
                      `${Number(tipo.defaultHours).toLocaleString('pt-BR')} h por padrão`
                    ) : (
                      <Badge variant="outline">Carga horária a definir</Badge>
                    )}
                    {tipo.aliases.length > 0
                      ? ` · apelidos: ${tipo.aliases.join(', ')}`
                      : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => setEditando(tipo.id)}
                    size="sm"
                    variant="outline"
                  >
                    Editar
                  </Button>
                  <ApagarTipo tipo={tipo} />
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {editando === 'novo' ? (
        <FormularioDeTipo aoTerminar={() => setEditando(null)} eventId={eventId} />
      ) : (
        <Button className="w-fit" onClick={() => setEditando('novo')} variant="outline">
          Adicionar tipo
        </Button>
      )}
    </div>
  )
}
