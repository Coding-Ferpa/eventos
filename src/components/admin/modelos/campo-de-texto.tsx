'use client'

import { useRef } from 'react'
import { useFormContext, useWatch } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import {
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
import type { TemplateDraft } from '@/features/certificate/publish'
import { TOKENS } from '@/features/certificate/tokens'

import { CaixaNumerica } from './caixa-numerica'

/**
 * Um campo de texto do modelo (doc 05): o conteúdo com placeholders, a caixa
 * e a tipografia. Os chips inserem o placeholder onde está o cursor.
 */

const ROTULO_DO_TOKEN: Record<string, string> = {
  'participant.full_name': 'Nome',
  'participant.cpf_masked': 'CPF mascarado',
  'event.title': 'Evento',
  'event.location': 'Local',
  'event.city': 'Cidade',
  'event.date_short': 'Data curta',
  'event.date_long': 'Data por extenso',
  'participation.label': 'Tipo de participação',
  'certificate.hours': 'Horas (8)',
  'certificate.hours_short': 'Horas (8h)',
  'certificate.hours_long': 'Horas (8 horas)',
  'certificate.code': 'Código',
  'certificate.validation_url': 'Endereço de validação',
  'certificate.issued_at_short': 'Emissão curta',
  'certificate.issued_at_long': 'Emissão por extenso',
  'certificate.sequence': 'Número (0042)',
  'certificate.sequence_year': 'Número/ano',
}

export type FonteNoSeletor = { ref: string; rotulo: string }

type Opcoes = readonly (readonly [string, string])[]

function Escolha({
  indice,
  campo,
  rotulo,
  opcoes,
  descricao,
}: {
  indice: number
  campo: 'h_align' | 'v_align' | 'fit' | 'transform' | 'font'
  rotulo: string
  opcoes: Opcoes
  descricao?: string
}) {
  const { control } = useFormContext<TemplateDraft>()
  return (
    <FormField
      control={control}
      name={`layout_fields.${indice}.${campo}` as `layout_fields.${number}.font`}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{rotulo}</FormLabel>
          <Select onValueChange={field.onChange} value={field.value}>
            <FormControl>
              <SelectTrigger className="w-full overflow-hidden">
                <SelectValue />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {opcoes.map(([valor, texto]) => (
                <SelectItem key={valor} value={valor}>
                  {texto}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {descricao ? <FormDescription>{descricao}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

function Numero({
  indice,
  campo,
  rotulo,
  passo,
  min,
  max,
}: {
  indice: number
  campo: 'size_pt' | 'min_size_pt' | 'line_height' | 'max_lines'
  rotulo: string
  passo: number
  min: number
  max: number
}) {
  const { control } = useFormContext<TemplateDraft>()
  return (
    <FormField
      control={control}
      name={`layout_fields.${indice}.${campo}` as `layout_fields.${number}.size_pt`}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{rotulo}</FormLabel>
          <FormControl>
            <Input
              inputMode="decimal"
              max={max}
              min={min}
              onChange={(evento) => field.onChange(evento.target.valueAsNumber)}
              step={passo}
              type="number"
              value={Number.isFinite(field.value) ? field.value : ''}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

export function CampoDeTexto({
  indice,
  temVerso,
  fontes,
  aoRemover,
}: {
  indice: number
  temVerso: boolean
  fontes: FonteNoSeletor[]
  aoRemover: () => void
}) {
  const { control, getValues, setValue } = useFormContext<TemplateDraft>()
  const dados = useWatch({ control, name: 'data_fields' })
  const id = useWatch({ control, name: `layout_fields.${indice}.id` })
  const textarea = useRef<HTMLTextAreaElement | null>(null)

  const chips = [
    ...TOKENS.map((token) => [token, ROTULO_DO_TOKEN[token] ?? token] as const),
    ...dados
      .filter((campo) => campo.key)
      .map((campo) => [`data.${campo.key}`, campo.label || campo.key] as const),
  ]

  function inserir(token: string) {
    const caminho = `layout_fields.${indice}.content` as const
    const atual = (getValues(caminho) as string) ?? ''
    const elemento = textarea.current
    const inicio = elemento?.selectionStart ?? atual.length
    const fim = elemento?.selectionEnd ?? atual.length
    const trecho = `{{${token}}}`
    setValue(caminho, atual.slice(0, inicio) + trecho + atual.slice(fim), {
      shouldDirty: true,
      shouldValidate: true,
    })
    // O cursor volta para depois do que entrou.
    requestAnimationFrame(() => {
      elemento?.focus()
      elemento?.setSelectionRange(inicio + trecho.length, inicio + trecho.length)
    })
  }

  return (
    <fieldset className="border-border flex flex-col gap-4 rounded-md border p-4">
      <legend className="text-caption px-1 font-semibold">Texto: {id}</legend>

      <FormField
        control={control}
        name={`layout_fields.${indice}.content`}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Conteúdo</FormLabel>
            <FormControl>
              <Textarea
                {...field}
                ref={(elemento) => {
                  field.ref(elemento)
                  textarea.current = elemento
                }}
                rows={2}
              />
            </FormControl>
            <FormDescription>
              Os botões abaixo inserem os dados onde está o cursor.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <div
        aria-label={`Dados para o texto ${id}`}
        className="flex flex-wrap gap-1.5"
        role="group"
      >
        {chips.map(([token, rotulo]) => (
          <button
            className="border-border hover:border-primary-muted text-caption rounded-full border px-2.5 py-0.5"
            key={token}
            onClick={() => inserir(token)}
            type="button"
          >
            {rotulo}
          </button>
        ))}
      </div>

      {temVerso ? (
        <FormField
          control={control}
          name={`layout_fields.${indice}.page`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Página</FormLabel>
              <Select
                onValueChange={(valor) => field.onChange(Number(valor))}
                value={String(field.value)}
              >
                <FormControl>
                  <SelectTrigger className="w-full overflow-hidden">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="1">Frente</SelectItem>
                  <SelectItem value="2">Verso</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />
      ) : null}

      <CaixaNumerica indice={indice} />

      <div className="grid grid-cols-2 gap-4 [&>*]:min-w-0">
        <Escolha
          campo="font"
          indice={indice}
          opcoes={fontes.map((f) => [f.ref, f.rotulo] as const)}
          rotulo="Fonte"
        />
        <Numero
          campo="size_pt"
          indice={indice}
          max={200}
          min={6}
          passo={0.5}
          rotulo="Tamanho (pt)"
        />
        <Numero
          campo="min_size_pt"
          indice={indice}
          max={200}
          min={6}
          passo={0.5}
          rotulo="Tamanho mínimo (pt)"
        />
        <FormField
          control={control}
          name={`layout_fields.${indice}.color`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cor</FormLabel>
              <FormControl>
                <Input className="h-10 p-1" type="color" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Escolha
          campo="h_align"
          indice={indice}
          opcoes={[
            ['left', 'À esquerda'],
            ['center', 'Ao centro'],
            ['right', 'À direita'],
          ]}
          rotulo="Alinhamento"
        />
        <Escolha
          campo="v_align"
          indice={indice}
          opcoes={[
            ['top', 'No topo'],
            ['middle', 'No meio'],
            ['bottom', 'Embaixo'],
          ]}
          rotulo="Na altura"
        />
        <Numero
          campo="line_height"
          indice={indice}
          max={2}
          min={1}
          passo={0.05}
          rotulo="Entrelinha"
        />
        <Numero
          campo="max_lines"
          indice={indice}
          max={8}
          min={1}
          passo={1}
          rotulo="Máximo de linhas"
        />
        <Escolha
          campo="fit"
          indice={indice}
          descricao="Nomes: encolher primeiro. Parágrafos: quebrar primeiro."
          opcoes={[
            ['shrink_then_wrap', 'Encolher e quebrar'],
            ['wrap_then_shrink', 'Quebrar e encolher'],
          ]}
          rotulo="Quando não cabe"
        />
        <Escolha
          campo="transform"
          indice={indice}
          opcoes={[
            ['none', 'Como veio'],
            ['uppercase', 'MAIÚSCULAS'],
            ['title_pt_br', 'Iniciais Maiúsculas'],
          ]}
          rotulo="Letras"
        />
      </div>

      <Button
        className="w-fit"
        onClick={aoRemover}
        size="sm"
        type="button"
        variant="outline"
      >
        Remover o texto {id}
      </Button>
    </fieldset>
  )
}
