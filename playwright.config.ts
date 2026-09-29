import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  },
  projects: [
    // O admin é desktop; a área pública é celular em rede móvel (doc 09), e o
    // doc 11 pede os fluxos públicos nos dois motores. Por isso os projetos de
    // celular só rodam o que está em `e2e/publico/`: rodar o admin em três
    // motores triplicaria o tempo sem cobrir nada que o desktop não cubra.
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Exceção no admin: o editor de modelos depende de API que muda por motor
    // (worker do pdf.js, WebP no canvas, createImageBitmap), e a falha seria
    // silenciosa, com arte subindo no formato errado (doc 11, M6).
    {
      name: 'desktop-safari',
      use: { ...devices['Desktop Safari'] },
      testMatch: /admin-modelos\.spec\.ts/,
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
      testMatch: /publico\/.*\.spec\.ts/,
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 14'] },
      testMatch: /publico\/.*\.spec\.ts/,
    },
  ],
  webServer: {
    command: 'pnpm build && pnpm start',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
