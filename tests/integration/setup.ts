/**
 * Carrega o `.env` local antes dos testes de integração, e recusa rodar contra
 * um banco que não seja local.
 *
 * No CI as variáveis já vêm do ambiente do job, e aí não há `.env` para ler:
 * por isso a falta do arquivo é silenciosa, e não um erro.
 */
try {
  process.loadEnvFile()
} catch {
  // Sem .env: as variáveis vêm do ambiente (CI).
}

/**
 * Esta suíte cria e apaga eventos. Contra o banco de produção seria mexer em
 * dado real, sem confirmação e sem volta. O cenário não é hipotético: no CF
 * Jobs, durante uma ida ao ar, o `.env` local ficou meio produção, meio local.
 *
 * O endereço decide: banco local mora em `localhost` ou `127.0.0.1`. Qualquer
 * outro host exige `PERMITIR_BANCO_REMOTO=1`, que ninguém digita sem querer.
 */
const HOSTS_LOCAIS = new Set(['localhost', '127.0.0.1', '::1', 'host.docker.internal'])

function exigirBancoLocal(): void {
  const url = process.env.DATABASE_URL
  if (!url) return // Sem banco configurado, os testes já falham com a mensagem certa.
  if (process.env.PERMITIR_BANCO_REMOTO === '1') return

  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    return // URL estranha: quem reclama é o cliente do banco, com mais contexto.
  }

  if (HOSTS_LOCAIS.has(host)) return

  throw new Error(
    `Os testes de integração criam e apagam eventos, e o DATABASE_URL aponta para ` +
      `"${host}", que não é local. Se isso é mesmo o que você quer, rode com ` +
      'PERMITIR_BANCO_REMOTO=1.',
  )
}

exigirBancoLocal()
