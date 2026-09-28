'use client'

import { Plus, Trash2 } from 'lucide-react'
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import type { TemplateDraft } from '@/features/certificate/publish'
import type { DataField } from '@/features/certificate/schema'

/**
 * Campos de conteúdo (doc 05): o que o modelo declara que cada certificado
 * traz além do nome, como o título da palestra. Declarados uma vez e usados por
 * placeholder, `{{data.chave}}`, em quantos textos precisar.
 */

const FORMATO_PADRAO: Record<DataField['type'], DataField['format']> = {
  text: { type: 'text', max_length: 120 },
  number: { type: 'number', decimals: 0 },
  date: { type: 'date', style: 'short' },
  hours: { type: 'hours', style: 'long' },
}

const TIPOS: [DataField['type'], string][] = [
  ['text', 'Texto'],
  ['number', 'Número'],
  ['date', 'Data'],
  ['hours', 'Carga horária'],
]

const ESTILOS: Record<Exclude<DataField['type'], 'text'>, [string, string][]> = {
  number: [
    ['0', 'Sem casas decimais'],
    ['1', 'Uma casa decimal'],
    ['2', 'Duas casas decimais'],
  ],
  date: [
    ['short', '12/09/2026'],
    ['long', '12 de setembro de 2026'],
  ],
  hours: [
    ['number', '8'],
    ['short', '8h'],
    ['long', '8 horas'],
  ],
}

/** "Título da palestra" → `titulo_palestra`, no formato de chave do doc 05. */
export function chaveDoRotulo(rotulo: string) {
  const base = rotulo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(de|da|do|das|dos|e)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
  return /^[a-z]/.test(base) ? base : `campo_${base}`.slice(0, 40)
}

function Formato({ indice }: { indice: number }) {
  const { control } = useFormContext<TemplateDraft>()
  const tipo = useWatch({ control, name: `data_fields.${indice}.type` })

  if (tipo === 'text') {
    return (
      <FormField
        control={control}
        name={`data_fields.${indice}.format.max_length`}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Tamanho máximo</FormLabel>
            <FormControl>
              <Input
                max={300}
                min={1}
                onChange={(evento) => field.onChange(evento.target.valueAsNumber)}
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

  const chave = tipo === 'number' ? 'decimals' : 'style'
  return (
    <FormField
      control={control}
      name={
        `data_fields.${indice}.format.${chave}` as `data_fields.${number}.format.style`
      }
      render={({ field }) => (
        <FormItem>
          <FormLabel>Formato</FormLabel>
          <Select
            onValueChange={(valor) =>
              field.onChange(tipo === 'number' ? Number(valor) : valor)
            }
            value={String(field.value)}
          >
            <FormControl>
              <SelectTrigger className="w-full overflow-hidden">
                <SelectValue />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {ESTILOS[tipo].map(([valor, rotulo]) => (
                <SelectItem key={valor} value={valor}>
                  {rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

export function CamposDeConteudo() {
  const { control, getValues, setValue } = useFormContext<TemplateDraft>()
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'data_fields',
    keyName: 'chave',
  })

  return (
    <div className="flex flex-col gap-4">
      {fields.length === 0 ? (
        <p className="text-caption text-muted-foreground">
          Nenhum campo de conteúdo. O nome, o evento, a carga horária e o código já estão
          disponíveis; declare aqui só o que muda por pessoa, como o título da palestra.
        </p>
      ) : null}

      {fields.map((item, indice) => (
        <fieldset
          className="border-border flex flex-col gap-4 rounded-md border p-4"
          key={item.chave}
        >
          <legend className="text-caption px-1 font-semibold">Campo {indice + 1}</legend>
          <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
            <FormField
              control={control}
              name={`data_fields.${indice}.label`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rótulo</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      onChange={(evento) => {
                        const chaveAtual = getValues(`data_fields.${indice}.key`)
                        const anterior = chaveDoRotulo(field.value)
                        field.onChange(evento)
                        // A chave acompanha o rótulo até alguém mexer nela.
                        if (!chaveAtual || chaveAtual === anterior) {
                          setValue(
                            `data_fields.${indice}.key`,
                            chaveDoRotulo(evento.target.value),
                          )
                        }
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name={`data_fields.${indice}.key`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Chave</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormDescription>
                    No texto: <code>{`{{data.${field.value || 'chave'}}}`}</code>
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name={`data_fields.${indice}.type`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo</FormLabel>
                  <Select
                    onValueChange={(valor: DataField['type']) => {
                      field.onChange(valor)
                      setValue(`data_fields.${indice}.format`, FORMATO_PADRAO[valor])
                    }}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full overflow-hidden">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {TIPOS.map(([valor, rotulo]) => (
                        <SelectItem key={valor} value={valor}>
                          {rotulo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Formato indice={indice} />
            <FormField
              control={control}
              name={`data_fields.${indice}.default`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Padrão (opcional)</FormLabel>
                  <FormControl>
                    <Input
                      onChange={(evento) => field.onChange(evento.target.value || null)}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormDescription>
                    Vale quando a planilha vem com a célula vazia.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name={`data_fields.${indice}.required`}
              render={({ field }) => (
                <FormItem className="flex items-center gap-2 self-end pb-2">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(marcado) => field.onChange(marcado === true)}
                    />
                  </FormControl>
                  <FormLabel className="!mt-0">Obrigatório</FormLabel>
                </FormItem>
              )}
            />
          </div>
          <Button
            className="w-fit"
            onClick={() => remove(indice)}
            size="sm"
            type="button"
            variant="outline"
          >
            <Trash2 aria-hidden="true" className="size-4" />
            Remover campo {indice + 1}
          </Button>
        </fieldset>
      ))}

      <Button
        className="w-fit"
        onClick={() =>
          append({
            key: '',
            label: '',
            type: 'text',
            required: false,
            default: null,
            format: FORMATO_PADRAO.text,
          })
        }
        type="button"
        variant="outline"
      >
        <Plus aria-hidden="true" className="size-4" />
        Declarar campo de conteúdo
      </Button>
    </div>
  )
}
