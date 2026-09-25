import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

/**
 * Falha em violação `serious` ou `critical` das regras WCAG 2.2 AA (doc 11).
 * A mensagem lista as regras violadas, para o erro dizer o que consertar.
 */
export async function esperarSemViolacoesGraves(page: Page) {
  const resultado = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()

  const graves = resultado.violations
    .filter((violacao) => ['serious', 'critical'].includes(violacao.impact ?? ''))
    .map((violacao) => `${violacao.id} (${violacao.nodes.length}): ${violacao.help}`)

  expect(graves, graves.join('\n')).toEqual([])
}
