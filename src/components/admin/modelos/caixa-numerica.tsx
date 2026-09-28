'use client'

import { useFormContext } from 'react-hook-form'

import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import type { TemplateDraft } from '@/features/certificate/publish'

/**
 * A caixa de um campo em porcentagem da página, com passo de 0,1%. O modelo
 * guarda frações de 0 a 1 (doc 05); a tela mostra porcentagem porque é o que
 * se lê de uma régua. É o caminho acessível que continua valendo depois do
 * arrastar do M10.
 */

const LADOS = [
  ['x', 'Esquerda'],
  ['y', 'Topo'],
  ['w', 'Largura'],
  ['h', 'Altura'],
] as const

const emPorcentagem = (fracao: number) =>
  Number.isFinite(fracao) ? Math.round(fracao * 1000) / 10 : ''

export function CaixaNumerica({ indice }: { indice: number }) {
  const { control, getFieldState, formState } = useFormContext<TemplateDraft>()
  // "Passa da borda" é erro da caixa inteira, e não de um lado.
  const erroDaCaixa = getFieldState(`layout_fields.${indice}.box`, formState).error
  return (
    <fieldset className="grid grid-cols-4 gap-3">
      <legend className="text-caption mb-2 font-medium">Caixa, em % da página</legend>
      {LADOS.map(([lado, rotulo]) => (
        <FormField
          control={control}
          key={lado}
          name={`layout_fields.${indice}.box.${lado}`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{rotulo}</FormLabel>
              <FormControl>
                <Input
                  inputMode="decimal"
                  max={100}
                  min={0}
                  onChange={(evento) => field.onChange(evento.target.valueAsNumber / 100)}
                  step={0.1}
                  type="number"
                  value={emPorcentagem(field.value)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      ))}
      {erroDaCaixa?.message ? (
        <p className="text-destructive text-caption col-span-4" role="alert">
          {erroDaCaixa.message}
        </p>
      ) : null}
    </fieldset>
  )
}
