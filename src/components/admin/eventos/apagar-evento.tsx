'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { deleteEvent } from '@/actions/events'
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

/** Só aparece para o admin, e só em rascunho sem certificado (doc 08). */
export function ApagarEvento({ id, titulo }: { id: string; titulo: string }) {
  const router = useRouter()
  const [resultado, setResultado] = useState<ActionResult<unknown> | null>(null)

  return (
    <div className="flex flex-col gap-3">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button className="w-fit" variant="destructive">
            Apagar evento
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar {titulo}?</AlertDialogTitle>
            <AlertDialogDescription>
              O evento sai do sistema junto com os tipos de participação e os modelos. Não
              dá para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const resposta = await deleteEvent({ id })
                setResultado(resposta)
                if (resposta.ok) router.push('/admin/eventos')
              }}
            >
              Apagar evento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ActionFeedback resultado={resultado} />
    </div>
  )
}
