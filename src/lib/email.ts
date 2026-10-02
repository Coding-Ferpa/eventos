import 'server-only'

import { Resend } from 'resend'

import { emailEnv } from '@/lib/env'
import { logger } from '@/lib/logger'

/**
 * Envio de e-mail transacional (doc 10). Fase 1: só a notificação do pedido de
 * correção. Nunca derruba quem chama: sem configuração ou com falha do
 * provedor, devolve o desfecho e loga, sem o conteúdo (que tem nome de pessoa).
 */

export type Mensagem = { para: string | null; assunto: string; texto: string }
export type Envio = 'enviado' | 'sem_configuracao' | 'sem_destino' | 'falhou'

type Remetente = (mensagem: {
  from: string
  to: string
  subject: string
  text: string
}) => Promise<void>

function pelaApiDoResend(apiKey: string): Remetente {
  const resend = new Resend(apiKey)
  return async (mensagem) => {
    const { error } = await resend.emails.send(mensagem)
    if (error) throw new Error(error.name)
  }
}

export async function enviarEmail(
  mensagem: Mensagem,
  remetente?: Remetente,
): Promise<Envio> {
  const config = emailEnv()
  if (!config) {
    logger.warn({ event: 'email.not_configured', route: 'email' })
    return 'sem_configuracao'
  }
  const para = mensagem.para ?? config.adminTo
  if (!para) {
    logger.warn({ event: 'email.no_recipient', route: 'email' })
    return 'sem_destino'
  }
  try {
    await (remetente ?? pelaApiDoResend(config.apiKey))({
      from: config.from,
      to: para,
      subject: mensagem.assunto,
      text: mensagem.texto,
    })
    return 'enviado'
  } catch {
    logger.error({ event: 'email.failed', route: 'email' })
    return 'falhou'
  }
}

/** O aviso à organização (doc 07), com o link para a pessoa no admin. */
export function avisoDePedidoDeCorrecao(pedido: {
  evento: string
  nomeAtual: string
  nomePedido: string
  contato: string
  mensagem: string | null
  link: string
}): { assunto: string; texto: string } {
  return {
    assunto: `Pedido de correção de nome: ${pedido.evento}`,
    texto: [
      `Chegou um pedido de correção de nome no evento ${pedido.evento}.`,
      '',
      `Nome no certificado: ${pedido.nomeAtual}`,
      `Nome pedido: ${pedido.nomePedido}`,
      `Contato: ${pedido.contato}`,
      ...(pedido.mensagem ? [`Mensagem: ${pedido.mensagem}`] : []),
      '',
      `Para corrigir, edite a pessoa no admin: ${pedido.link}`,
      'O código do certificado continua o mesmo depois da correção.',
    ].join('\n'),
  }
}
