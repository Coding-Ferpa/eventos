import { expect, test, type Page } from '@playwright/test'

import { formatCode } from '@/features/certificate/code'

import { extrairTexto } from '../../tests/support/certificado'
import { esperarSemViolacoesGraves } from '../support/axe'
import {
  apagarEventoComCertificados,
  criarEventoComCertificados,
  ipDeTeste,
  PESSOAS,
  revogarCertificado,
  type EventoLiberado,
} from '../support/banco'
import { esperarHidratacao } from '../support/sessao'

/**
 * E14, E15, E16 (o lado público), E18, E19 (o lado público) e o E23 das telas
 * de retirada e de validação, no build de produção e nos dois motores: busca
 * de verdade, cookie de verdade, PDF gerado pelo motor de verdade.
 */

const PREFIXO = 'E2E retirada'
let evento: EventoLiberado

test.beforeAll(async () => {
  evento = await criarEventoComCertificados(PREFIXO)
})

test.afterAll(async () => {
  await apagarEventoComCertificados(evento.id)
})

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': ipDeTeste() })
})

async function buscarPorEmail(page: Page, email: string) {
  await page.goto(`/eventos/${evento.slug}`)
  await esperarHidratacao(page)
  const radio = page.getByRole('radio', { name: 'E-mail' })
  await page.locator('label').filter({ has: radio }).click()
  await page.getByRole('textbox', { name: 'E-mail' }).fill(email)
  await page.getByRole('button', { name: 'Buscar meu certificado' }).click()
  await expect(page).toHaveURL(`/eventos/${evento.slug}/certificado`)
  await esperarHidratacao(page)
}

test('retirada: prévia, PDF com o nome acentuado e 304 no segundo pedido (E14)', async ({
  page,
}) => {
  await buscarPorEmail(page, PESSOAS.jose.email)

  const cartao = page.getByRole('listitem').filter({ hasText: 'Palestrante' })
  await expect(
    cartao.getByRole('img', {
      name: `Prévia do certificado de ${PESSOAS.jose.nome}, Palestrante, no evento ${PREFIXO} ${evento.slug}`,
    }),
  ).toBeVisible()
  await expect(cartao.getByText('2 horas')).toBeVisible()
  // Busca por e-mail não mostra o final do CPF (doc 03, 6c).
  await expect(page.getByText(/terminado em/)).toHaveCount(0)

  const baixar = cartao.getByRole('link', { name: 'Baixar PDF' })
  const download = page.waitForEvent('download')
  await baixar.click()
  const arquivo = await download
  expect(arquivo.suggestedFilename()).toMatch(
    new RegExp(`^certificado-${evento.slug}-jos[eé]\\.pdf$`),
  )
  await expect(
    page.getByRole('status').filter({ hasText: 'Download iniciado' }),
  ).toBeVisible()

  const caminho = await arquivo.path()
  const { readFile } = await import('node:fs/promises')
  const texto = (await extrairTexto(new Uint8Array(await readFile(caminho))))
    .flat()
    .map((trecho) => trecho.text)
    .join(' ')
  expect(texto).toContain(PESSOAS.jose.nome)

  const href = (await baixar.getAttribute('href'))!
  const primeira = await page.request.get(href)
  expect(primeira.status()).toBe(200)
  expect(primeira.headers()['content-type']).toBe('application/pdf')
  const etag = primeira.headers()['etag']!
  const segunda = await page.request.get(href, { headers: { 'if-none-match': etag } })
  expect(segunda.status()).toBe(304)

  await esperarSemViolacoesGraves(page)
})

test('pessoa com dois certificados: dois cartões, dois PDFs (E15)', async ({ page }) => {
  await buscarPorEmail(page, PESSOAS.jose.email)

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Encontramos 2 certificados seus neste evento',
  )
  const cartoes = page.getByRole('main').getByRole('list').first().getByRole('listitem')
  await expect(cartoes).toHaveCount(2)
  // A maior carga horária primeiro.
  await expect(cartoes.nth(0)).toContainText('Organizador')
  await expect(cartoes.nth(0)).toContainText('16 horas')
  await expect(cartoes.nth(1)).toContainText('Palestrante')
  await expect(cartoes.nth(1)).toContainText('2 horas')

  const pdfs = await Promise.all(
    [0, 1].map(async (i) => {
      const href = await cartoes
        .nth(i)
        .getByRole('link', { name: 'Baixar PDF' })
        .getAttribute('href')
      const resposta = await page.request.get(href!)
      expect(resposta.status()).toBe(200)
      return { href, etag: resposta.headers()['etag'] }
    }),
  )
  expect(pdfs[0]!.href).toBe(
    `/api/certificados/${evento.codigos['jose:organizador']}/pdf`,
  )
  expect(pdfs[1]!.href).toBe(
    `/api/certificados/${evento.codigos['jose:palestrante']}/pdf`,
  )
  expect(pdfs[0]!.etag).not.toBe(pdfs[1]!.etag)
})

test('pedido de correção: envia, confirma e não aceita outro (E16)', async ({ page }) => {
  await buscarPorEmail(page, PESSOAS.maria.email)

  await page.getByRole('button', { name: 'Meu nome está errado' }).click()
  const nome = page.getByRole('textbox', { name: 'Nome correto' })
  await expect(nome).toHaveValue(PESSOAS.maria.nome)
  await nome.fill('Maria Eduarda dos Santos Lima')
  await page
    .getByRole('textbox', { name: 'E-mail ou WhatsApp para contato' })
    .fill(PESSOAS.maria.email)
  await page.getByRole('button', { name: 'Enviar pedido de correção' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Pedido enviado' })).toHaveText(
    'Pedido enviado. A organização vai revisar, e o certificado corrigido mantém o mesmo código. Não precisa pedir de novo.',
  )

  await page.reload()
  await expect(page.getByText('Pedido de correção em análise')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Meu nome está errado' })).toHaveCount(0)

  const segundo = await page.request.post(
    `/api/certificados/${evento.codigos['maria:participante']}/correcao`,
    {
      headers: { origin: new URL(page.url()).origin },
      data: { requested_name: 'Outro Nome Qualquer', contact: PESSOAS.maria.email },
    },
  )
  expect(segundo.status()).toBe(409)
  const problema = await segundo.json()
  expect(problema.code).toBe('correction_already_pending')
  expect(problema.detail).toMatch(/^Já existe um pedido de correção/)
})

test.describe('validação pelo código (E18)', () => {
  test('válido, forma canônica, inexistente e malformado', async ({ page }) => {
    const codigo = evento.codigos['maria:participante']!
    const resposta = await page.goto(`/validar/${codigo}`)
    expect(resposta?.status()).toBe(200)
    await expect(page.getByRole('heading', { name: 'Certificado válido' })).toBeVisible()
    await expect(page.getByText(PESSOAS.maria.nome)).toBeVisible()
    await esperarSemViolacoesGraves(page)

    // Minúsculas, hífens e as letras que viram dígito: O vira 0, I e L viram 1.
    const digitado = formatCode(codigo)
      .toLowerCase()
      .replace(/0/g, 'o')
      .replace(/1/g, 'l')
    await page.goto(`/validar/${digitado}`)
    await expect(page).toHaveURL(`/validar/${codigo}`)

    const inexistente = await page.goto('/validar/ZZZZZZZZZZ')
    expect(inexistente?.status()).toBe(200)
    await expect(
      page.getByRole('heading', { name: 'Não encontramos esse código' }),
    ).toBeVisible()

    await page.goto('/validar/ABC')
    await expect(
      page.getByRole('heading', { name: 'Esse código não tem o formato certo' }),
    ).toBeVisible()
    await expect(page.getByText('Confira a digitação')).toBeVisible()
  })
})

test('revogado: a validação diz quando, o download é 410 e a tela explica (E19)', async ({
  page,
}) => {
  const codigo = evento.codigos['paulo:participante']!
  await revogarCertificado(codigo, 'Participação não confirmada pela organização')

  await page.goto(`/validar/${codigo}`)
  await expect(page.getByRole('heading', { name: 'Certificado revogado' })).toBeVisible()
  await expect(page.getByText(/Revogado em \d+ de \S+ de \d{4}\./)).toBeVisible()
  // O motivo nunca aparece.
  await expect(page.getByText('Participação não confirmada')).toHaveCount(0)

  await buscarPorEmail(page, PESSOAS.paulo.email)
  await expect(
    page.getByText(
      'Este certificado foi revogado pela organização e não pode mais ser baixado.',
    ),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Baixar PDF' })).toHaveCount(0)
  const download = await page.request.get(`/api/certificados/${codigo}/pdf`, {
    maxRedirects: 0,
  })
  expect(download.status()).toBe(410)
})
