'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import {
  removeCertificates,
  restoreCertificate,
  revokeCertificate,
} from '@/actions/certificates'
import { falhaDeConexao, type ActionResult } from '@/actions/result'
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
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'

import { EditarParticipante } from './editar-participante'

export type LinhaDeCertificado = {
  certificateId: string
  code: string
  status: 'active' | 'revoked' | 'erased'
  hours: number
  baixado: boolean
  participantId: string
  fullName: string
  email: string | null
  birthDate: string | null
  cpfLast3: string | null
  tipo: string
}

const ROTULO_DO_STATUS = {
  active: 'Válido',
  revoked: 'Revogado',
  erased: 'Removido a pedido',
} as const

/**
 * Lista, seleção e remoção (ADR-0007). A remoção pede que se digite a
 * quantidade; se algum selecionado já pode estar num papel, nada é removido, e
 * a linha passa a oferecer a revogação, com motivo.
 */
export function ListaDeCertificados({
  eventId,
  linhas,
  total,
  liberado,
  podeRemoverDepoisDaLiberacao,
}: {
  eventId: string
  linhas: LinhaDeCertificado[]
  total: number
  liberado: boolean
  podeRemoverDepoisDaLiberacao: boolean
}) {
  const router = useRouter()
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [confirmando, setConfirmando] = useState(false)
  const [confirmacao, setConfirmacao] = useState('')
  const [pedemRevogacao, setPedemRevogacao] = useState<Set<string>>(new Set())
  const [revogando, setRevogando] = useState<LinhaDeCertificado | null>(null)
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [resultado, setResultado] = useState<ActionResult<unknown> | null>(null)

  const todos =
    linhas.length > 0 && linhas.every((linha) => selecionados.has(linha.certificateId))
  const podeRemover = !liberado || podeRemoverDepoisDaLiberacao

  function alternar(id: string) {
    const novo = new Set(selecionados)
    if (novo.has(id)) novo.delete(id)
    else novo.add(id)
    setSelecionados(novo)
  }

  async function remover() {
    setOcupado(true)
    try {
      const resposta = await removeCertificates({
        eventId,
        certificateIds: [...selecionados],
        confirmCount: Number(confirmacao),
      })
      setResultado(resposta)
      setConfirmando(false)
      setConfirmacao('')
      if (resposta.ok) {
        setSelecionados(new Set())
        router.refresh()
      } else if (resposta.error.code === 'must_revoke') {
        setPedemRevogacao(new Set(resposta.error.fieldErrors?.certificateIds ?? []))
      }
    } catch {
      setResultado(falhaDeConexao())
    } finally {
      setOcupado(false)
    }
  }

  async function revogar() {
    if (!revogando) return
    setOcupado(true)
    try {
      const resposta = await revokeCertificate({
        id: revogando.certificateId,
        reason: motivo,
      })
      setResultado(resposta)
      if (resposta.ok) {
        setRevogando(null)
        setMotivo('')
        router.refresh()
      }
    } catch {
      setResultado(falhaDeConexao())
    } finally {
      setOcupado(false)
    }
  }

  async function restaurar(id: string) {
    setOcupado(true)
    try {
      const resposta = await restoreCertificate({ id })
      setResultado(resposta)
      if (resposta.ok) router.refresh()
    } catch {
      setResultado(falhaDeConexao())
    } finally {
      setOcupado(false)
    }
  }

  if (linhas.length === 0) {
    return <p className="text-muted-foreground">Nenhum certificado com esses filtros.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-caption text-muted-foreground">
          {total} {total === 1 ? 'certificado' : 'certificados'}
        </p>
        {podeRemover ? (
          <Button
            disabled={selecionados.size === 0 || ocupado}
            onClick={() => setConfirmando(true)}
            size="sm"
            type="button"
            variant="outline"
          >
            Remover selecionados ({selecionados.size})
          </Button>
        ) : null}
      </div>

      <ActionFeedback mensagemDeSucesso="Pronto." resultado={resultado} />

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  aria-label="Selecionar todos desta página"
                  checked={todos}
                  className="accent-primary size-4"
                  onChange={() =>
                    setSelecionados(
                      todos
                        ? new Set()
                        : new Set(linhas.map((linha) => linha.certificateId)),
                    )
                  }
                  type="checkbox"
                />
              </TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Horas</TableHead>
              <TableHead>Código</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead>
                <span className="sr-only">Ações</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((linha) => (
              <TableRow key={linha.certificateId}>
                <TableCell>
                  <input
                    aria-label={`Selecionar ${linha.fullName}, ${linha.tipo}`}
                    checked={selecionados.has(linha.certificateId)}
                    className="accent-primary size-4"
                    onChange={() => alternar(linha.certificateId)}
                    type="checkbox"
                  />
                </TableCell>
                <TableCell className="font-medium">{linha.fullName}</TableCell>
                <TableCell>{linha.tipo}</TableCell>
                <TableCell>{String(linha.hours).replace('.', ',')}</TableCell>
                <TableCell className="font-mono text-sm">{linha.code}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    <Badge
                      variant={linha.status === 'active' ? 'outline' : 'destructive'}
                    >
                      {ROTULO_DO_STATUS[linha.status]}
                    </Badge>
                    {linha.baixado ? <Badge variant="secondary">Baixado</Badge> : null}
                    {pedemRevogacao.has(linha.certificateId) ? (
                      <Badge variant="destructive">Pede revogação</Badge>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap justify-end gap-2">
                    {linha.status === 'active' ? (
                      <>
                        <EditarParticipante linha={linha} />
                        <Button
                          disabled={ocupado}
                          onClick={() => setRevogando(linha)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          Revogar
                        </Button>
                      </>
                    ) : linha.status === 'revoked' ? (
                      <Button
                        disabled={ocupado}
                        onClick={() => void restaurar(linha.certificateId)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        Restaurar
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog onOpenChange={setConfirmando} open={confirmando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover {selecionados.size} certificados?</AlertDialogTitle>
            <AlertDialogDescription>
              Só sai o que nunca foi baixado, de evento ainda não liberado; a pessoa sai
              junto se ficar sem certificado. Se algum já pode estar num papel, nada é
              removido e a lista mostra quais pedem revogação. Para confirmar, digite{' '}
              {selecionados.size}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirmacao-de-remocao">Quantidade</Label>
            <Input
              id="confirmacao-de-remocao"
              inputMode="numeric"
              onChange={(evento) => setConfirmacao(evento.target.value)}
              value={confirmacao}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={Number(confirmacao) !== selecionados.size || ocupado}
              onClick={(evento) => {
                evento.preventDefault()
                void remover()
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        onOpenChange={(aberto) => (aberto ? null : setRevogando(null))}
        open={revogando !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Revogar o certificado de {revogando?.fullName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              O código continua respondendo na validação, agora como revogado, com o
              motivo. Dá para restaurar depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="motivo-da-revogacao">Motivo</Label>
            <Textarea
              id="motivo-da-revogacao"
              onChange={(evento) => setMotivo(evento.target.value)}
              value={motivo}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={motivo.trim().length < 10 || ocupado}
              onClick={(evento) => {
                evento.preventDefault()
                void revogar()
              }}
            >
              Revogar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
