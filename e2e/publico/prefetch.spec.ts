import { expect, test, type Request } from '@playwright/test'

/**
 * O catálogo não baixa as rotas dos eventos antes de a pessoa mostrar
 * intenção (ADR-0015). No celular, na rede móvel, cada prefetch de evento que
 * ninguém abre é plano de dados gasto à toa.
 *
 * Só em build de produção: em desenvolvimento o Next não faz prefetch nenhum,
 * e o teste passaria sem provar nada. O CI roda as E2E contra `pnpm start`.
 */
test.skip(!process.env.CI, 'o prefetch só existe no build de produção (CI=1)')

function ehPrefetchDeEvento(requisicao: Request) {
  const url = new URL(requisicao.url())
  return url.pathname.startsWith('/eventos/') && url.searchParams.has('_rsc')
}

test('os cards não fazem prefetch até a pessoa mostrar intenção', async ({
  page,
  isMobile,
}) => {
  const prefetches: string[] = []
  page.on('request', (requisicao) => {
    if (ehPrefetchDeEvento(requisicao)) prefetches.push(requisicao.url())
  })

  await page.goto('/')
  // Todos os cards entram na tela: é aí que o prefetch padrão dispararia.
  // `mouse.wheel` não existe no WebKit de celular; rolar por script vale igual.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForLoadState('networkidle')

  expect(prefetches).toEqual([])

  // No celular não existe ponteiro em cima; o toque já é a navegação.
  if (isMobile) return

  await page.getByRole('link', { name: /Ferpa Tech Day 2026/ }).hover()
  await expect
    .poll(() => prefetches.some((url) => url.includes('/eventos/ferpa-tech-day-2026')))
    .toBe(true)
})
