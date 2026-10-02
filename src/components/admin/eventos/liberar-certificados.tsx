'use client'

import { CircleAlert } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { releaseCertificates } from '@/actions/events'
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
import { Button } from '@/components/ui/button'

/**
 * "Liberar certificados" (doc 07): o único caminho para os certificados
 * entrarem no ar. A confirmação diz o que muda; a recusa lista tudo o que
 * falta de uma vez, para ninguém resolver um item e descobrir o seguinte.
 * Fica montado depois de liberar, para a confirmação sobreviver ao refresh.
 */
export function LiberarCertificados({
  id,
  ativos,
  liberadoEm,
}: {
  id: string
  ativos: number
  /** A data da liberação, já formatada, quando os certificados estão no ar. */
  liberadoEm: string | null
}) {
  const router = useRouter()
  const [resultado, setResultado] = useState<ActionResult<{ emitidos: number }> | null>(
    null,
  )
  const pendencias =
    resultado && !resultado.ok && resultado.error.code === 'release_preconditions_failed'
      ? (resultado.error.fieldErrors?.liberar ?? [])
      : []

  return (
    <div className="flex flex-col gap-3">
      {liberadoEm ? (
        <p className="text-caption text-muted-foreground">
          Os certificados estão no ar desde {liberadoEm}.
        </p>
      ) : (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button className="w-fit">Liberar certificados</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Liberar os certificados?</AlertDialogTitle>
              <AlertDialogDescription>
                A busca aparece na página pública do evento, e{' '}
                {ativos === 1
                  ? 'o certificado ativo passa'
                  : ativos > 1
                    ? `os ${ativos} certificados ativos passam`
                    : 'os certificados ativos passam'}{' '}
                a valer na validação. Antes, a plataforma confere se falta alguma coisa.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Agora não</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  const resposta = await releaseCertificates({ id })
                  setResultado(resposta)
                  if (resposta.ok) router.refresh()
                }}
              >
                Liberar certificados
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {pendencias.length > 0 ? (
        <div
          className="text-destructive border-destructive text-caption flex items-start gap-2 rounded-md border px-3 py-2"
          role="alert"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <div className="flex flex-col gap-1">
            <p>{resultado && !resultado.ok ? resultado.error.message : null}</p>
            <ul className="text-foreground list-disc pl-5">
              {pendencias.map((pendencia) => (
                <li key={pendencia}>{pendencia}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <ActionFeedback
          mensagemDeSucesso={
            resultado?.ok
              ? `Certificados no ar. ${resultado.data.emitidos === 1 ? '1 certificado emitido' : `${resultado.data.emitidos} certificados emitidos`} agora.`
              : undefined
          }
          resultado={resultado}
        />
      )}
    </div>
  )
}
