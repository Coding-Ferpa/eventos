import { dataHoraDeSaoPauloParaUtc } from '@/lib/format'
import { SLUG } from '@/lib/slug'
import { z } from '@/lib/zod'

/**
 * Schemas do evento, os mesmos no formulário (react-hook-form) e na Server
 * Action (doc 09). As mensagens são as que a pessoa lê ao lado do campo.
 */

export const STATUS_DO_EVENTO = [
  'draft',
  'registration_open',
  'registration_closed',
  'in_progress',
  'completed',
  'certificates_available',
  'archived',
] as const

export type StatusDoEvento = (typeof STATUS_DO_EVENTO)[number]

export const UFS = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
] as const

const DATA_E_HORA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

/** Campo em branco no formulário quer dizer "não informei". */
function opcional<T extends z.ZodType>(schema: T) {
  return z.preprocess(
    (valor) => (typeof valor === 'string' && valor.trim() === '' ? undefined : valor),
    schema.optional(),
  )
}

function dataEHora(mensagem: string) {
  return z.string().regex(DATA_E_HORA, mensagem).transform(dataHoraDeSaoPauloParaUtc)
}

function https(mensagem: string) {
  return z
    .url(mensagem)
    .refine(
      (url) => url.startsWith('https://'),
      'O endereço precisa começar com https://.',
    )
}

const camposDoEvento = z.object({
  title: z
    .string()
    .trim()
    .min(3, 'O título precisa de pelo menos 3 caracteres.')
    .max(160, 'O título pode ter até 160 caracteres.'),
  slug: opcional(
    z
      .string()
      .trim()
      .min(3, 'O endereço precisa de pelo menos 3 caracteres.')
      .max(80, 'O endereço pode ter até 80 caracteres.')
      .regex(
        SLUG,
        'Use só letras minúsculas, números e hífens, como ferpa-tech-day-2026.',
      ),
  ),
  startsAt: dataEHora('Informe a data e a hora de início.'),
  endsAt: opcional(dataEHora('Informe a data e a hora de término.')),
  locationName: opcional(
    z.string().trim().max(120, 'O local pode ter até 120 caracteres.'),
  ),
  city: opcional(z.string().trim().max(80, 'A cidade pode ter até 80 caracteres.')),
  state: opcional(z.enum(UFS, 'Escolha a UF.')),
  externalUrl: opcional(https('Informe o endereço completo da inscrição.')),
  // Sem `.default('')` aqui: o padrão sobreviveria ao `.partial()` da
  // atualização, e mudar só a busca apagaria a descrição do evento.
  descriptionMd: z.string().max(20_000, 'A descrição pode ter até 20 mil caracteres.'),
  contactEmail: opcional(z.email('Informe um e-mail válido.')),
  contactUrl: opcional(https('Informe o endereço completo do contato.')),
})

const camposDaBusca = z.object({
  searchByCpf: z.boolean(),
  searchByEmail: z.boolean(),
  searchByName: z.boolean(),
  searchBirthDate: z.boolean(),
  searchMode: z.enum(['any', 'all']),
})

export type ConfiguracaoDeBusca = z.infer<typeof camposDaBusca>

function terminoDepoisDoInicio(
  evento: { startsAt?: Date; endsAt?: Date },
  ctx: z.RefinementCtx,
) {
  if (evento.startsAt && evento.endsAt && evento.endsAt < evento.startsAt) {
    ctx.addIssue({
      code: 'custom',
      path: ['endsAt'],
      message: 'O término não pode ser antes do início.',
    })
  }
}

export const novoEventoSchema = camposDoEvento
  .extend({ descriptionMd: camposDoEvento.shape.descriptionMd.default('') })
  .superRefine(terminoDepoisDoInicio)

export type NovoEvento = z.input<typeof novoEventoSchema>

/**
 * Mudança parcial (doc 07): só o que veio muda. A capa só aponta para a pasta
 * do próprio evento no bucket `covers`, para ninguém pendurar num evento a
 * imagem de outro.
 */
export const atualizacaoDeEventoSchema = camposDoEvento
  .partial()
  .extend(camposDaBusca.partial().shape)
  .extend({
    id: z.uuid(),
    coverPath: z.string().nullable().optional(),
  })
  .superRefine((mudanca, ctx) => {
    terminoDepoisDoInicio(mudanca, ctx)

    if (
      mudanca.coverPath &&
      !new RegExp(`^${mudanca.id}/[0-9a-f-]{36}\\.(jpg|png|webp)$`).test(
        mudanca.coverPath,
      )
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['coverPath'],
        message: 'A capa precisa ser enviada por este evento.',
      })
    }
  })

export type AtualizacaoDeEvento = z.input<typeof atualizacaoDeEventoSchema>

/**
 * O que está errado na configuração de busca (ADR-0009), por campo. CPF,
 * e-mail e nome são chaves independentes; a data de nascimento nunca é chave
 * sozinha: no modo "qualquer um" ela é o segundo fator do nome, e no modo
 * "todos" é mais um campo exigido.
 */
export function problemasDaBusca(
  busca: ConfiguracaoDeBusca,
  status: StatusDoEvento,
): Record<string, string[]> {
  const problemas: Record<string, string[]> = {}
  const temChave = busca.searchByCpf || busca.searchByEmail || busca.searchByName

  if (busca.searchBirthDate && !temChave) {
    problemas.searchBirthDate = [
      'A data de nascimento nunca é chave sozinha: ligue também o CPF, o e-mail ou o nome.',
    ]
  } else if (busca.searchBirthDate && busca.searchMode === 'any' && !busca.searchByName) {
    problemas.searchBirthDate = [
      'No modo "qualquer um", a data de nascimento só entra junto com o nome.',
    ]
  }

  if (status === 'certificates_available' && !temChave) {
    problemas.searchByName = [
      'Com os certificados no ar, a busca precisa de ao menos uma chave: CPF, e-mail ou nome.',
    ]
  }

  return problemas
}

/** Por que a mudança de status não pode acontecer, ou `null` se pode. */
export function problemaNaTransicao(
  de: StatusDoEvento,
  para: StatusDoEvento,
): string | null {
  if (de === para) return null

  if (para === 'certificates_available') {
    return 'Os certificados entram no ar pela liberação, que confere antes se falta alguma coisa.'
  }

  // O trigger do banco só trava o endereço fora do rascunho: voltar para ele
  // destravaria a troca de um endereço que já pode estar em cartaz e em QR.
  if (para === 'draft') {
    return 'Um evento que já saiu do rascunho não volta para ele, porque o endereço dele pode estar em cartaz. Para tirá-lo do catálogo, arquive.'
  }

  return null
}

/**
 * Os quatro tipos que todo evento ganha ao nascer (doc 04), na mesma
 * transação. A carga horária começa em zero, "a definir": um número inventado
 * aqui sairia impresso no certificado de quem ninguém conferiu.
 */
export const TIPOS_PADRAO = [
  {
    slug: 'participante',
    label: 'Participante',
    aliases: ['ouvinte'],
    defaultHours: '0',
    sortOrder: 1,
  },
  {
    slug: 'palestrante',
    label: 'Palestrante',
    aliases: ['speaker'],
    defaultHours: '0',
    sortOrder: 2,
  },
  {
    slug: 'organizador',
    label: 'Organizador',
    aliases: ['organizacao'],
    defaultHours: '0',
    sortOrder: 3,
  },
  { slug: 'monitor', label: 'Monitor', aliases: [], defaultHours: '0', sortOrder: 4 },
] as const
