'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm, type Resolver } from 'react-hook-form'

import { createEvent, updateEvent } from '@/actions/events'
import type { ActionError, ActionResult } from '@/actions/result'
import { ActionFeedback } from '@/components/admin/action-feedback'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { novoEventoSchema, UFS } from '@/lib/schemas/event'

/**
 * Dados do evento, para criar e para editar. O schema é o mesmo da action,
 * na opção `raw`: o cliente só adianta a mensagem, e o que vai para o servidor
 * é o texto cru, validado de novo lá (doc 09).
 */

export type ValoresDoEvento = {
  title: string
  slug: string
  startsAt: string
  endsAt: string
  locationName: string
  city: string
  state: string
  externalUrl: string
  contactEmail: string
  contactUrl: string
  descriptionMd: string
}

const VAZIO: ValoresDoEvento = {
  title: '',
  slug: '',
  startsAt: '',
  endsAt: '',
  locationName: '',
  city: '',
  state: '',
  externalUrl: '',
  contactEmail: '',
  contactUrl: '',
  descriptionMd: '',
}

/** O `<Select>` do Radix não aceita valor vazio; este sentinela é "sem UF". */
const SEM_UF = '__sem-uf__'

type Props =
  | { modo: 'novo' }
  | { modo: 'editar'; id: string; valores: ValoresDoEvento; slugTravado: boolean }

export function FormularioDeEvento(props: Props) {
  const router = useRouter()
  const [resultado, setResultado] = useState<ActionResult<unknown> | null>(null)

  const form = useForm<ValoresDoEvento>({
    // O cast existe porque os campos com `preprocess` tipam a entrada do schema
    // como `unknown`; no formulário, todos são texto.
    resolver: zodResolver(novoEventoSchema, undefined, {
      raw: true,
    }) as Resolver<ValoresDoEvento>,
    defaultValues: props.modo === 'editar' ? props.valores : VAZIO,
  })

  function marcarErros(erro: ActionError) {
    for (const [campo, mensagens] of Object.entries(erro.fieldErrors ?? {})) {
      form.setError(campo as keyof ValoresDoEvento, { message: mensagens[0] })
    }
  }

  async function enviar(valores: ValoresDoEvento) {
    if (props.modo === 'novo') {
      const resposta = await createEvent(valores)
      setResultado(resposta)
      if (!resposta.ok) return marcarErros(resposta.error)
      router.push(`/admin/eventos/${resposta.data.id}`)
      return
    }

    const resposta = await updateEvent({
      id: props.id,
      ...valores,
      // Travado, o endereço nem vai: não há o que mudar.
      slug: props.slugTravado ? undefined : valores.slug,
    })
    setResultado(resposta)
    if (!resposta.ok) return marcarErros(resposta.error)
    router.refresh()
  }

  const texto = (
    nome: keyof ValoresDoEvento,
    rotulo: string,
    extra: { tipo?: string; ajuda?: string; desabilitado?: boolean } = {},
  ) => (
    <FormField
      control={form.control}
      name={nome}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{rotulo}</FormLabel>
          <FormControl>
            <Input disabled={extra.desabilitado} type={extra.tipo ?? 'text'} {...field} />
          </FormControl>
          {extra.ajuda ? <FormDescription>{extra.ajuda}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  )

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-6"
        noValidate
        onSubmit={form.handleSubmit(enviar)}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">{texto('title', 'Título')}</div>
          <div className="md:col-span-2">
            {texto('slug', 'Endereço', {
              desabilitado: props.modo === 'editar' && props.slugTravado,
              ajuda:
                props.modo === 'editar' && props.slugTravado
                  ? 'O endereço não muda depois que o evento sai do rascunho: ele pode estar em cartaz, em QR ou em link de grupo.'
                  : 'Deixe em branco para gerar a partir do título. Depois que o evento sair do rascunho, o endereço não muda mais.',
            })}
          </div>
          {texto('startsAt', 'Início', {
            tipo: 'datetime-local',
            ajuda: 'Hora de São Paulo.',
          })}
          {texto('endsAt', 'Término', { tipo: 'datetime-local' })}
          {texto('locationName', 'Local', { ajuda: 'Como "Auditório da Faculdade".' })}
          {texto('city', 'Cidade', {
            ajuda: 'Sem cidade, o evento aparece como on-line.',
          })}
          <FormField
            control={form.control}
            name="state"
            render={({ field }) => (
              <FormItem>
                <FormLabel>UF</FormLabel>
                <Select
                  onValueChange={(valor) => field.onChange(valor === SEM_UF ? '' : valor)}
                  value={field.value || SEM_UF}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={SEM_UF}>Não informada</SelectItem>
                    {UFS.map((uf) => (
                      <SelectItem key={uf} value={uf}>
                        {uf}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          {texto('externalUrl', 'Link de inscrição', {
            tipo: 'url',
            ajuda:
              'Aparece no botão "Quero participar" enquanto as inscrições estão abertas.',
          })}
          {texto('contactEmail', 'E-mail de contato', {
            tipo: 'email',
            ajuda:
              'Recebe os pedidos de correção de nome e aparece para quem não se encontrou.',
          })}
          {texto('contactUrl', 'Outro contato', { tipo: 'url' })}
          <div className="md:col-span-2">
            <FormField
              control={form.control}
              name="descriptionMd"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Textarea rows={8} {...field} />
                  </FormControl>
                  <FormDescription>
                    Aceita Markdown: ## para títulos, - para listas e [texto](endereço)
                    para links.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <ActionFeedback
          mensagemDeSucesso={props.modo === 'editar' ? 'Dados salvos.' : undefined}
          resultado={resultado}
        />

        <Button className="w-fit" disabled={form.formState.isSubmitting} type="submit">
          {props.modo === 'novo' ? 'Criar evento' : 'Salvar dados'}
        </Button>
      </form>
    </Form>
  )
}
