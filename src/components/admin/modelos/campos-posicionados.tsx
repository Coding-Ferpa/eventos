'use client'

import { useFieldArray, useFormContext, useWatch } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  FormControl,
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
import type { LayoutField, QrField, TextField } from '@/features/certificate/schema'

import { CaixaNumerica } from './caixa-numerica'
import { CampoDeTexto, type FonteNoSeletor } from './campo-de-texto'

/**
 * Os campos desenhados sobre a arte (doc 05), por formulário numérico: o
 * arrastar só chega no M10, e este formulário continua sendo o caminho
 * acessível depois dele. Os atalhos criam nome, código e QR já posicionados
 * num lugar razoável, para o admin só ajustar.
 */

const TEXTO_BASE: Omit<TextField, 'id' | 'content' | 'box'> = {
  kind: 'text',
  page: 1,
  font: 'curated:poppins-400',
  size_pt: 14,
  min_size_pt: 9,
  color: '#1E1E1E',
  h_align: 'center',
  v_align: 'middle',
  line_height: 1.15,
  max_lines: 2,
  fit: 'shrink_then_wrap',
  transform: 'none',
}

/** O id aparece nas mensagens para o admin: legível e único no modelo. */
function idLivre(base: string, campos: LayoutField[]) {
  const usados = new Set(campos.map((campo) => campo.id))
  if (!usados.has(base)) return base
  let n = 2
  while (usados.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

function CampoQr({
  indice,
  temVerso,
  aoRemover,
}: {
  indice: number
  temVerso: boolean
  aoRemover: () => void
}) {
  const { control } = useFormContext<TemplateDraft>()
  return (
    <fieldset className="border-border flex flex-col gap-4 rounded-md border p-4">
      <legend className="text-caption px-1 font-semibold">QR de validação</legend>
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
      <p className="text-caption text-muted-foreground">
        O QR ocupa o maior quadrado centrado na caixa. Abaixo de 2 cm de lado, câmera de
        celular barato falha.
      </p>
      <div className="grid grid-cols-2 gap-4 [&>*]:min-w-0">
        <FormField
          control={control}
          name={`layout_fields.${indice}.dark`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cor do QR</FormLabel>
              <FormControl>
                <Input className="h-10 p-1" type="color" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name={`layout_fields.${indice}.light`}
          render={({ field }) => (
            <>
              <FormItem>
                <FormLabel>Fundo do QR</FormLabel>
                <FormControl>
                  <Input
                    className="h-10 p-1"
                    disabled={field.value === null}
                    onChange={field.onChange}
                    type="color"
                    value={field.value ?? '#FFFFFF'}
                  />
                </FormControl>
              </FormItem>
              <FormItem className="flex items-center gap-2 self-end pb-2">
                <FormControl>
                  <Checkbox
                    checked={field.value === null}
                    onCheckedChange={(marcado) =>
                      field.onChange(marcado === true ? null : '#FFFFFF')
                    }
                  />
                </FormControl>
                <FormLabel className="!mt-0">Sem fundo</FormLabel>
              </FormItem>
            </>
          )}
        />
      </div>
      <Button
        className="w-fit"
        onClick={aoRemover}
        size="sm"
        type="button"
        variant="outline"
      >
        Remover o QR
      </Button>
    </fieldset>
  )
}

export function CamposPosicionados({
  temVerso,
  fontes,
}: {
  temVerso: boolean
  fontes: FonteNoSeletor[]
}) {
  const { control } = useFormContext<TemplateDraft>()
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'layout_fields',
    keyName: 'chave',
  })
  const campos = useWatch({ control, name: 'layout_fields' })

  const temQr = campos.some((campo) => campo.kind === 'qr')
  const temNome = campos.some(
    (campo) => campo.kind === 'text' && campo.content.includes('participant.full_name'),
  )
  const temCodigo = campos.some(
    (campo) => campo.kind === 'text' && campo.content.includes('certificate.code'),
  )

  const novoTexto = (base: string, extra: Partial<TextField>) =>
    append({
      ...TEXTO_BASE,
      id: idLivre(base, campos),
      content: '',
      box: { x: 0.1, y: 0.55, w: 0.8, h: 0.15 },
      ...extra,
    } satisfies TextField)

  const novoQr = () =>
    append({
      id: idLivre('qr', campos),
      kind: 'qr',
      page: 1,
      box: { x: 0.82, y: 0.72, w: 0.12, h: 0.2 },
      dark: '#000000',
      light: '#FFFFFF',
    } satisfies QrField)

  return (
    <div className="flex flex-col gap-4">
      {fields.map((item, indice) =>
        item.kind === 'qr' ? (
          <CampoQr
            aoRemover={() => remove(indice)}
            indice={indice}
            key={item.chave}
            temVerso={temVerso}
          />
        ) : (
          <CampoDeTexto
            aoRemover={() => remove(indice)}
            fontes={fontes}
            indice={indice}
            key={item.chave}
            temVerso={temVerso}
          />
        ),
      )}

      <div className="flex flex-wrap gap-2">
        {!temNome ? (
          <Button
            onClick={() =>
              novoTexto('nome', {
                content: '{{participant.full_name}}',
                box: { x: 0.1, y: 0.4, w: 0.8, h: 0.12 },
                font: 'curated:poppins-600',
                size_pt: 32,
                min_size_pt: 14,
              })
            }
            type="button"
            variant="outline"
          >
            Posicionar o nome
          </Button>
        ) : null}
        {!temCodigo ? (
          <Button
            onClick={() =>
              novoTexto('codigo', {
                content:
                  'Código de validação {{certificate.code}} · {{certificate.validation_url}}',
                box: { x: 0.06, y: 0.86, w: 0.55, h: 0.05 },
                size_pt: 10,
                min_size_pt: 7,
                h_align: 'left',
                max_lines: 1,
              })
            }
            type="button"
            variant="outline"
          >
            Posicionar o código
          </Button>
        ) : null}
        {!temQr ? (
          <Button onClick={novoQr} type="button" variant="outline">
            Posicionar o QR
          </Button>
        ) : null}
        <Button
          onClick={() =>
            novoTexto('texto', { v_align: 'top', max_lines: 4, fit: 'wrap_then_shrink' })
          }
          type="button"
          variant="outline"
        >
          Adicionar texto
        </Button>
      </div>
    </div>
  )
}
