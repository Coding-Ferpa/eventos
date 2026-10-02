import { expect, test, type Page } from '@playwright/test'

import {
  apagarEventoComCertificados,
  criarEventoComCertificados,
  ipDeTeste,
  PESSOAS,
  type EventoLiberado,
} from '../support/banco'
import { esperarHidratacao } from '../support/sessao'

/**
 * E11, E12, E13 e E22 do doc 11 e o aviso de navegador embutido, no build de
 * produção, pelo formulário de verdade: a busca sai do navegador, passa pela
 * rota e pelo rate limit, e o cookie de retirada abre a tela.
 */

const PREFIXO = 'E2E busca'
const NAO_ENCONTRADO = 'Não encontramos ninguém com esses dados neste evento.'

let evento: EventoLiberado

test.beforeAll(async () => {
  evento = await criarEventoComCertificados(PREFIXO)
})

test.afterAll(async () => {
  await apagarEventoComCertificados(evento.id)
})

// Cada teste tem o seu IP: os baldes valem de verdade, e testes em paralelo
// ou execuções seguidas não podem gastar o balde um do outro.
test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': ipDeTeste() })
})

// O rádio é `sr-only` dentro da pílula: quem toca é a pílula, como a pessoa.
async function escolher(page: Page, metodo: 'CPF' | 'E-mail' | 'Nome') {
  const radio = page.getByRole('radio', { name: metodo })
  await page.locator('label').filter({ has: radio }).click()
  await expect(radio).toBeChecked()
}

async function abrir(page: Page, metodo: 'CPF' | 'E-mail' | 'Nome') {
  await page.goto(`/eventos/${evento.slug}`)
  await esperarHidratacao(page)
  await escolher(page, metodo)
}

const botaoDeBuscar = (page: Page) =>
  page.getByRole('button', { name: 'Buscar meu certificado' })

test.describe('busca por nome (E11)', () => {
  test('"maria" não encontra; o nome sem o "dos" encontra, e a resposta não traz a pessoa', async ({
    page,
  }) => {
    await abrir(page, 'Nome')
    await page.getByRole('textbox', { name: 'Nome completo' }).fill('maria')
    const falha = page.waitForResponse('**/api/certificados/buscar')
    await botaoDeBuscar(page).click()

    expect((await falha).status()).toBe(404)
    const titulo = page.getByRole('heading', { name: NAO_ENCONTRADO })
    await expect(titulo).toBeFocused()
    await expect(page.getByText('Ainda não deu certo? Escreva para')).toBeVisible()
    // Os valores digitados ficam, para corrigir sem digitar tudo de novo.
    await expect(page.getByRole('textbox', { name: 'Nome completo' })).toHaveValue(
      'maria',
    )

    await page
      .getByRole('textbox', { name: 'Nome completo' })
      .fill('MARIA EDUARDA SANTOS')
    const sucesso = page.waitForResponse('**/api/certificados/buscar')
    await botaoDeBuscar(page).click()

    const resposta = await sucesso
    expect(resposta.status()).toBe(200)
    // Nada sobre a pessoa no corpo (doc 07): nem id, nem nome, nem lista.
    expect(await resposta.json()).toEqual({
      ok: true,
      redirect: `/eventos/${evento.slug}/certificado`,
    })
    await expect(page).toHaveURL(`/eventos/${evento.slug}/certificado`)
    await expect(
      page.getByRole('heading', { level: 1, name: 'Encontramos seu certificado' }),
    ).toBeVisible()
    await expect(page.getByText(PESSOAS.maria.nome).first()).toBeVisible()
  })
})

test.describe('busca por CPF e por e-mail (E12)', () => {
  test('CPF digitado ganha a máscara, colado sem pontuação também, e encontra', async ({
    page,
  }) => {
    await abrir(page, 'CPF')
    const cpf = page.getByRole('textbox', { name: 'CPF' })
    await cpf.pressSequentially('52998224725')
    await expect(cpf).toHaveValue(PESSOAS.jose.cpf)

    await botaoDeBuscar(page).click()
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Encontramos 2 certificados seus neste evento',
      }),
    ).toBeVisible()
    // Quem buscou pelo CPF vê os três últimos dígitos (doc 03, 6c).
    await expect(page.getByText('terminado em 725').first()).toBeVisible()

    await abrir(page, 'CPF')
    await cpf.fill('52998224725')
    await expect(cpf).toHaveValue(PESSOAS.jose.cpf)
    await botaoDeBuscar(page).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Encontramos 2 certificados seus neste evento',
    )
  })

  test('CPF com dígito errado é erro de validação, e não "não encontrado"', async ({
    page,
  }) => {
    await abrir(page, 'CPF')
    const cpf = page.getByRole('textbox', { name: 'CPF' })
    await cpf.fill('529.982.247-24')
    await cpf.blur()
    await expect(
      page.getByText('Esse CPF não parece válido. Confira os números.'),
    ).toBeVisible()
    await expect(cpf).toHaveAttribute('aria-invalid', 'true')

    // O formulário nem gasta a tentativa; a rota, se chamada, também recusa.
    let buscou = false
    page.on('request', (pedido) => {
      if (pedido.url().endsWith('/api/certificados/buscar')) buscou = true
    })
    await botaoDeBuscar(page).click()
    await expect(cpf).toBeFocused()
    expect(buscou).toBe(false)
    await expect(page.getByText(NAO_ENCONTRADO)).toHaveCount(0)

    const direta = await page.request.post('/api/certificados/buscar', {
      headers: { origin: new URL(page.url()).origin },
      data: { event_slug: evento.slug, method: 'cpf', cpf: '529.982.247-24' },
    })
    expect(direta.status()).toBe(422)
    expect((await direta.json()).code).toBe('validation_error')
  })

  test('e-mail com maiúsculas encontra', async ({ page }) => {
    await abrir(page, 'E-mail')
    await page.getByRole('textbox', { name: 'E-mail' }).fill('MARIA.E2E@Example.com')
    await botaoDeBuscar(page).click()
    // O título, e não só a URL: sem o cookie, a URL passa por aqui e volta.
    await expect(
      page.getByRole('heading', { level: 1, name: 'Encontramos seu certificado' }),
    ).toBeVisible()
    await expect(page).toHaveURL(`/eventos/${evento.slug}/certificado`)
  })
})

test.describe('rate limit (E13)', () => {
  test('a 6ª tentativa no minuto recebe 429; outro dispositivo no mesmo IP segue buscando', async ({
    browser,
    page,
  }) => {
    const ip = ipDeTeste()
    await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': ip })
    await abrir(page, 'E-mail')
    const email = page.getByRole('textbox', { name: 'E-mail' })
    await email.fill('ninguem@example.com')
    for (let i = 0; i < 5; i++) {
      const resposta = page.waitForResponse('**/api/certificados/buscar')
      await botaoDeBuscar(page).click()
      expect((await resposta).status()).toBe(404)
    }

    const limitada = page.waitForResponse('**/api/certificados/buscar')
    await botaoDeBuscar(page).click()
    const resposta = await limitada
    expect(resposta.status()).toBe(429)
    expect(Number(resposta.headers()['retry-after'])).toBeGreaterThan(0)
    // O anúncio do roteador do Next também é `role=alert`.
    await expect(
      page.getByRole('alert').filter({ hasText: 'Muitas tentativas' }),
    ).toHaveText(
      /Muitas tentativas seguidas\. Você pode tentar de novo em \d+ segundos?\./,
    )
    await expect(botaoDeBuscar(page)).toBeDisabled()

    // Outro celular no mesmo Wi-Fi: cookie de dispositivo próprio, mesmo IP.
    const outro = await browser.newContext({
      extraHTTPHeaders: { 'x-forwarded-for': ip },
    })
    const outraPagina = await outro.newPage()
    await outraPagina.goto(`/eventos/${evento.slug}`)
    await esperarHidratacao(outraPagina)
    await escolher(outraPagina, 'E-mail')
    await outraPagina.getByRole('textbox', { name: 'E-mail' }).fill('ninguem@example.com')
    const deOutro = outraPagina.waitForResponse('**/api/certificados/buscar')
    await botaoDeBuscar(outraPagina).click()
    expect((await deOutro).status()).toBe(404)
    await outro.close()
  })
})

test('tela de retirada sem cookie volta ao evento com o aviso (E22)', async ({
  page,
}) => {
  await page.goto(`/eventos/${evento.slug}/certificado`)

  await expect(page).toHaveURL(`/eventos/${evento.slug}?sessao=expirada`)
  await expect(
    page.getByRole('status').filter({ hasText: 'esta tela expirou' }),
  ).toHaveText('Por segurança, esta tela expirou. Busque de novo, leva poucos segundos.')
})

test('no navegador do Instagram, o aviso aparece antes da busca', async ({ browser }) => {
  const instagram = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 302.0.0.23.114 (iPhone14,5; iOS 17_0; pt_BR; pt; scale=3.00; 1170x2532; 518092734)',
  })
  const page = await instagram.newPage()
  await page.goto(`/eventos/${evento.slug}`)

  const aviso = page.getByText('Você está no navegador do Instagram')
  await expect(aviso).toBeVisible()
  // Antes da busca, na ordem de leitura.
  const [doAviso, doBotao] = await Promise.all([
    aviso.boundingBox(),
    botaoDeBuscar(page).boundingBox(),
  ])
  expect(doAviso!.y).toBeLessThan(doBotao!.y)
  await instagram.close()
})
