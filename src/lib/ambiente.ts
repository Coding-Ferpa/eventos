/**
 * O site está sem banco? (ADR-0014)
 *
 * A Preview da Vercel e o build do job de qualidade do CI sobem sem banco
 * (doc 02). Nesse modo o site é só a casca: as leituras públicas voltam
 * vazias, o beacon não grava e o proxy não emite cookie de dispositivo.
 *
 * Em produção a resposta é sempre "não": lá, faltar o banco é erro de
 * configuração, e a primeira consulta para com a mensagem do `serverEnv()`,
 * em vez de publicar um site vazio.
 *
 * Sem dependência nenhuma de propósito: o proxy também pergunta, e não pode
 * carregar o driver do banco para isso.
 */
export function semBanco(): boolean {
  const temBanco = Boolean(process.env.DATABASE_URL?.trim())
  const emProducao = process.env.VERCEL_ENV === 'production'

  return !temBanco && !emProducao
}
