import { describe, expect, it } from 'vitest'

import { tipoDeParticipacaoSchema } from './participation-type'

const TIPO = {
  eventId: 'de000000-0000-4000-8000-00000000e001',
  slug: 'mediador',
  label: 'Mediador',
  aliases: '',
  defaultHours: '4',
}

describe('tipoDeParticipacaoSchema', () => {
  it('aceita o tipo do formulário e converte a carga horária', () => {
    const tipo = tipoDeParticipacaoSchema.parse(TIPO)

    expect(tipo.defaultHours).toBe(4)
    expect(tipo.aliases).toEqual([])
  })

  it('apelidos chegam como texto e viram lista minúscula, sem repetição', () => {
    const tipo = tipoDeParticipacaoSchema.parse({
      ...TIPO,
      aliases: ' Mediação , mediacao;  MEDIAÇÃO ,, moderador ',
    })

    expect(tipo.aliases).toEqual(['mediação', 'mediacao', 'moderador'])
  })

  it('aceita meia hora, e recusa mais de uma casa decimal', () => {
    expect(
      tipoDeParticipacaoSchema.parse({ ...TIPO, defaultHours: '1.5' }).defaultHours,
    ).toBe(1.5)
    expect(
      tipoDeParticipacaoSchema.safeParse({ ...TIPO, defaultHours: '1.25' }).success,
    ).toBe(false)
  })

  it.each([
    ['defaultHours', '-1'],
    ['defaultHours', 'quatro'],
    ['slug', 'Mediador'],
    ['label', 'M'],
  ])('recusa %s = %j', (campo, valor) => {
    const resultado = tipoDeParticipacaoSchema.safeParse({ ...TIPO, [campo]: valor })

    expect(resultado.success).toBe(false)
    expect(resultado.error?.issues[0]?.path).toEqual([campo])
  })
})
