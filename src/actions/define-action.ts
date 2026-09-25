import 'server-only'

import { updateTag } from 'next/cache'
import { unstable_rethrow } from 'next/navigation'
import { z } from '@/lib/zod'

import { db, type Transaction } from '@/db/client'
import { auditLogs } from '@/db/schema'
import { getCurrentUser, type CurrentUser } from '@/lib/auth'
import type { UserRole } from '@/lib/roles'

import { autorizar } from './authorize'
import { actionError, actionOk, type ActionErrorCode, type ActionResult } from './result'

/**
 * O esqueleto que o doc 07 exige de toda Server Action do admin:
 * sessão → Zod → papel → operação em transação → audit_logs → updateTag.
 *
 * Está aqui em vez de repetido em cada action por um motivo prático: a etapa
 * mais fácil de esquecer é a auditoria, e é justamente a que ninguém percebe
 * faltando. Com o esqueleto, escrever a action sem auditar dá erro de tipo.
 *
 * A operação e o registro de auditoria rodam na mesma transação: ou os dois
 * acontecem, ou nenhum. Um log que mente é pior que log nenhum.
 *
 * Autorização é de aplicação (doc 08): a conexão do app não carrega JWT, e a
 * RLS baseada em `auth.jwt()` não se aplica a ela. Por isso o `autorizar`
 * daqui é o gate real da escrita, e o guarda do layout do admin é o segundo.
 */

/** Erro de domínio esperado: vira `ActionResult` em vez de estourar. */
export class FalhaDaAction extends Error {
  constructor(
    readonly code: ActionErrorCode,
    message: string,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message)
    this.name = 'FalhaDaAction'
  }
}

type Contexto<TEntrada> = {
  entrada: TEntrada
  usuario: CurrentUser
  tx: Transaction
}

type Efeito<TData> = {
  data: TData
  /** Linha afetada, para o audit_logs apontar para algo. */
  entityId?: string | null
  /**
   * O que mudou, em JSON: o "por quê" de cada linha do log. Nunca CPF, e em
   * operação em massa, contadores e não nomes (doc 07).
   */
  diff?: unknown
}

type Config<TSchema extends z.ZodType, TData> = {
  /** Verbo no audit_logs, no formato `entidade.acao` (ex.: `certificate.revoke`). */
  nome: string
  entidade: string
  papelMinimo: UserRole
  schema: TSchema
  executar: (contexto: Contexto<z.output<TSchema>>) => Promise<Efeito<TData>>
  /** Tags de cache a derrubar depois do commit. */
  revalidar?: string[]
}

export function defineAction<TSchema extends z.ZodType, TData>(
  config: Config<TSchema, TData>,
): (entrada: z.input<TSchema>) => Promise<ActionResult<TData>> {
  return async function executarAction(entrada) {
    const usuario = await getCurrentUser()

    const negado = autorizar(usuario, config.papelMinimo)
    if (negado) return negado as ActionResult<TData>
    // O `autorizar` já garantiu que existe sessão; o TypeScript não sabe disso.
    if (!usuario) return actionError('unauthorized', 'Sua sessão expirou.')

    const validada = config.schema.safeParse(entrada)
    if (!validada.success) {
      return actionError(
        'validation_error',
        'Confira os campos destacados.',
        z.flattenError(validada.error).fieldErrors as Record<string, string[]>,
      )
    }

    let efeito: Efeito<TData>

    try {
      efeito = await db.transaction(async (tx) => {
        const resultado = await config.executar({
          entrada: validada.data as z.output<TSchema>,
          usuario,
          tx,
        })

        await tx.insert(auditLogs).values({
          actorId: usuario.id,
          action: config.nome,
          entity: config.entidade,
          entityId: resultado.entityId ?? null,
          diff: resultado.diff ?? null,
        })

        return resultado
      })
    } catch (erro) {
      // `redirect`/`notFound` sinalizam por exceção: engoli-los quebraria a
      // navegação em silêncio.
      unstable_rethrow(erro)

      if (erro instanceof FalhaDaAction) {
        return actionError(erro.code, erro.message, erro.fieldErrors)
      }

      console.error(`[action:${config.nome}]`, erro)
      return actionError(
        'validation_error',
        'Não conseguimos concluir a operação. Tente de novo em instantes.',
      )
    }

    // Fora da transação: o cache só deve cair depois que o dado existe.
    //
    // `updateTag` e não `revalidateTag`: no Next 16 o segundo purga a tag e
    // deixa a releitura para a próxima requisição, enquanto o primeiro é o que
    // dá read-your-own-writes dentro de uma Server Action, o comportamento de
    // que este admin depende (publicar e ver no catálogo no mesmo passo).
    // ADR-0014 do CF Jobs, herdado pelo ADR-0001.
    for (const tag of config.revalidar ?? []) updateTag(tag)

    return actionOk(efeito.data)
  }
}
