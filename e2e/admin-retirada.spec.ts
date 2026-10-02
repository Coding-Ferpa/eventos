import { readFile } from 'node:fs/promises'

import { expect, test } from '@playwright/test'

import { extrairTexto } from '../tests/support/certificado'
import {
  apagarEventoComCertificados,
  criarEventoComCertificados,
  ipDeTeste,
  PESSOAS,
  type EventoLiberado,
} from './support/banco'
import { CONTAS, entrar, esperarHidratacao } from './support/sessao'

/**
 * O lado do admin do E16 e o E17 do doc 11, no build de produção: o pedido
 * feito na tela pública aparece na lista de participantes; corrigir o nome
 * ali fecha o pedido, mantém o código, e a validação e o PDF passam a dizer o
 * nome novo.
 */

const PREFIXO = 'E2E correção'
const NOME_NOVO = 'Maria Eduarda dos Santos Lima'
let evento: EventoLiberado

test.beforeAll(async () => {
  evento = await criarEventoComCertificados(PREFIXO)
})

test.afterAll(async () => {
  await apagarEventoComCertificados(evento.id)
})

test('o pedido chega ao admin, e a correção mantém o código (E16, E17)', async ({
  browser,
  page,
}) => {
  const codigo = evento.codigos['maria:participante']!

  // A pessoa, no celular dela, pede a correção.
  const aluna = await browser.newContext({
    extraHTTPHeaders: { 'x-forwarded-for': ipDeTeste() },
  })
  const celular = await aluna.newPage()
  await celular.goto(`/eventos/${evento.slug}`)
  await esperarHidratacao(celular)
  const radio = celular.getByRole('radio', { name: 'E-mail' })
  await celular.locator('label').filter({ has: radio }).click()
  await celular.getByRole('textbox', { name: 'E-mail' }).fill(PESSOAS.maria.email)
  await celular.getByRole('button', { name: 'Buscar meu certificado' }).click()
  await expect(celular).toHaveURL(`/eventos/${evento.slug}/certificado`)
  await esperarHidratacao(celular)
  await celular.getByRole('button', { name: 'Meu nome está errado' }).click()
  await celular.getByRole('textbox', { name: 'Nome correto' }).fill(NOME_NOVO)
  await celular
    .getByRole('textbox', { name: 'E-mail ou WhatsApp para contato' })
    .fill(PESSOAS.maria.email)
  await celular.getByRole('button', { name: 'Enviar pedido de correção' }).click()
  await expect(celular.getByText('Pedido enviado.')).toBeVisible()

  // A organização abre o link do aviso: a lista filtrada pelo nome.
  await entrar(page, CONTAS.editor)
  await page.goto(
    `/admin/eventos/${evento.id}/participantes?busca=${encodeURIComponent('Maria Eduarda')}`,
  )
  await esperarHidratacao(page)
  const linha = page.getByRole('row').filter({ hasText: PESSOAS.maria.nome })
  await expect(linha.getByText('Correção pendente')).toBeVisible()
  await expect(linha.getByText(`Pede correção para ${NOME_NOVO}.`)).toBeVisible()

  await linha.getByRole('button', { name: 'Editar' }).click()
  const edicao = page.getByRole('alertdialog')
  await edicao.getByLabel('Nome completo').fill(NOME_NOVO)
  await edicao.getByRole('button', { name: 'Salvar', exact: true }).click()
  const corrigida = page.getByRole('row').filter({ hasText: NOME_NOVO })
  await expect(corrigida.getByRole('cell', { name: codigo })).toBeVisible()
  await expect(corrigida.getByText('Correção pendente')).toHaveCount(0)

  // O mesmo código valida o nome novo, com a data da atualização.
  await page.goto(`/validar/${codigo}`)
  await expect(page.getByRole('heading', { name: 'Certificado válido' })).toBeVisible()
  await expect(page.getByText(NOME_NOVO)).toBeVisible()
  await expect(page.getByText('Dados atualizados em')).toBeVisible()

  // E o PDF novo sai com ele; o pedido fechado devolve o botão à pessoa.
  await celular.reload()
  await expect(celular.getByText(NOME_NOVO).first()).toBeVisible()
  await expect(
    celular.getByRole('button', { name: 'Meu nome está errado' }),
  ).toBeVisible()
  const download = celular.waitForEvent('download')
  await celular.getByRole('link', { name: 'Baixar PDF' }).click()
  const texto = (
    await extrairTexto(new Uint8Array(await readFile(await (await download).path())))
  )
    .flat()
    .map((trecho) => trecho.text)
    .join(' ')
  expect(texto).toContain(NOME_NOVO)
  await aluna.close()
})
