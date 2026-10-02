// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'

import { avisoDePedidoDeCorrecao, enviarEmail } from './email'

vi.mock('server-only', () => ({}))

afterEach(() => {
  vi.unstubAllEnvs()
})

const MENSAGEM = { para: 'contato@evento.org', assunto: 'Assunto', texto: 'Texto' }

describe('enviarEmail', () => {
  it('sem chave ou remetente, não envia e não quebra quem chamou', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    vi.stubEnv('EMAIL_FROM', '')
    const remetente = vi.fn()
    expect(await enviarEmail(MENSAGEM, remetente)).toBe('sem_configuracao')
    expect(remetente).not.toHaveBeenCalled()
  })

  it('evento sem contato cai no e-mail da administração; sem os dois, não envia', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_teste')
    vi.stubEnv('EMAIL_FROM', 'Coding Ferpa <certificados@codingferpa.org>')
    vi.stubEnv('ADMIN_NOTIFICATION_EMAIL', 'admin@codingferpa.org')
    const remetente = vi.fn(async () => {})
    expect(await enviarEmail({ ...MENSAGEM, para: null }, remetente)).toBe('enviado')
    expect(remetente).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'admin@codingferpa.org' }),
    )

    vi.stubEnv('ADMIN_NOTIFICATION_EMAIL', '')
    expect(await enviarEmail({ ...MENSAGEM, para: null }, remetente)).toBe('sem_destino')
  })

  it('falha do provedor vira desfecho, não exceção', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_teste')
    vi.stubEnv('EMAIL_FROM', 'certificados@codingferpa.org')
    const remetente = vi.fn(async () => {
      throw new Error('fora do ar')
    })
    expect(await enviarEmail(MENSAGEM, remetente)).toBe('falhou')
  })
})

describe('avisoDePedidoDeCorrecao', () => {
  it('traz os dois nomes, o contato e o link para o admin', () => {
    const aviso = avisoDePedidoDeCorrecao({
      evento: 'Ferpa Tech Day',
      nomeAtual: 'Jose Goncalves',
      nomePedido: 'José Gonçalves',
      contato: 'jose@exemplo.org',
      mensagem: null,
      link: 'http://localhost:3000/admin/eventos/x/participantes?busca=Jose',
    })
    expect(aviso.assunto).toBe('Pedido de correção de nome: Ferpa Tech Day')
    expect(aviso.texto).toContain('Nome pedido: José Gonçalves')
    expect(aviso.texto).toContain('participantes?busca=Jose')
    expect(aviso.texto).not.toContain('Mensagem:')
  })
})
