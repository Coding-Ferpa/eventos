import { expect, test } from '@playwright/test'

import { esperarSemViolacoesGraves } from '../support/axe'

/**
 * E02 e E04 do doc 11: o bloco de ação conforme o status, e o SEO da página do
 * evento. Depende do seed de desenvolvimento (`pnpm db:reset`).
 */

test.describe('estados do evento (E02)', () => {
  test('rascunho é 404, como evento que não existe', async ({ page }) => {
    for (const slug of ['hackathon-ferpa-2026', 'evento-que-nao-existe']) {
      const resposta = await page.goto(`/eventos/${slug}`)

      expect(resposta?.status()).toBe(404)
      await expect(
        page.getByRole('heading', { name: 'Essa página não existe' }),
      ).toBeVisible()
    }
  })

  test('realizado avisa que os certificados estão em preparo, sem formulário', async ({
    page,
  }) => {
    await page.goto('/eventos/oficina-de-git')

    await expect(page.getByText('Os certificados estão sendo preparados')).toBeVisible()
    await expect(page.getByRole('main').getByRole('textbox')).toHaveCount(0)
    await expect(page.getByRole('main').locator('form')).toHaveCount(0)
  })

  test('arquivado mostra o aviso próprio e o caminho da validação', async ({ page }) => {
    await page.goto('/eventos/evento-de-demonstracao')

    await expect(page.getByText('Este evento foi arquivado.')).toBeVisible()
    await expect(
      page.getByRole('main').getByRole('link', { name: 'Validar certificado' }),
    ).toHaveAttribute('href', '/validar')
  })

  test('inscrições abertas leva ao formulário externo, em outra aba', async ({
    page,
  }) => {
    await page.goto('/eventos/semana-academica-2026')

    const botao = page.getByRole('link', { name: /Quero participar/ })
    await expect(botao).toHaveAttribute(
      'href',
      'https://inscricoes.example.com/semana-academica-2026',
    )
    await expect(botao).toHaveAttribute('target', '_blank')
  })

  test('cada status tem o seu texto', async ({ page }) => {
    const casos = [
      ['meetup-de-dados', 'As inscrições se encerraram.'],
      ['workshop-de-acessibilidade', 'O evento está acontecendo agora.'],
      ['ferpa-tech-day-2026', 'Os certificados já estão no ar.'],
    ] as const

    for (const [slug, texto] of casos) {
      await page.goto(`/eventos/${slug}`)
      await expect(page.getByText(texto)).toBeVisible()
    }
  })

  test('sem violações graves de acessibilidade', async ({ page }) => {
    await page.goto('/eventos/ferpa-tech-day-2026')
    await esperarSemViolacoesGraves(page)
  })
})

test.describe('SEO da página do evento (E04)', () => {
  test('canonical, Open Graph com imagem e JSON-LD Event válido', async ({
    page,
    request,
    baseURL,
  }) => {
    await page.goto('/eventos/ferpa-tech-day-2026')

    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `${baseURL}/eventos/ferpa-tech-day-2026`,
    )

    const imagemOg = await page
      .locator('meta[property="og:image"]')
      .getAttribute('content')
    expect(imagemOg).toBeTruthy()
    const og = await request.get(imagemOg ?? '')
    expect(og.status()).toBe(200)
    expect(og.headers()['content-type']).toContain('image/png')

    const blocos = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents()
    const dados = blocos.map((bloco) => JSON.parse(bloco) as Record<string, unknown>)
    const evento = dados.find((dado) => dado['@type'] === 'Event')

    expect(evento).toMatchObject({
      '@context': 'https://schema.org',
      name: 'Ferpa Tech Day 2026',
      startDate: '2026-09-12T08:00:00-03:00',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      location: { '@type': 'Place', address: { addressLocality: 'Fernandópolis' } },
    })
    expect(dados.map((dado) => dado['@type'])).toContain(
      'EducationalOccupationalCredential',
    )
  })

  test('evento sem capa serve a capa gerada', async ({ request }) => {
    const capa = await request.get('/eventos/oficina-de-git/capa')

    expect(capa.status()).toBe(200)
    expect(capa.headers()['content-type']).toContain('image/png')
  })

  test('a credencial só aparece depois que o evento emitiu certificados', async ({
    page,
  }) => {
    await page.goto('/eventos/oficina-de-git')

    const blocos = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents()
    const tipos = blocos.map(
      (bloco) => (JSON.parse(bloco) as { '@type': string })['@type'],
    )

    expect(tipos).toEqual(['Event', 'BreadcrumbList'])
  })

  test('sitemap e robots seguem o doc 09', async ({ request }) => {
    const sitemap = await (await request.get('/sitemap.xml')).text()
    expect(sitemap).toContain('/eventos/ferpa-tech-day-2026')
    expect(sitemap).not.toContain('/eventos/hackathon-ferpa-2026')
    expect(sitemap).not.toContain('/eventos/evento-de-demonstracao')

    const robots = await (await request.get('/robots.txt')).text()
    expect(robots).toContain('Disallow: /validar/')
    expect(robots).toContain('Sitemap:')
  })
})
