/**
 * O navegador de dentro do Instagram e do Facebook (docs 02 e 03), pelo user
 * agent. Baixar PDF nele é instável, e trocar de navegador depois da busca
 * perde o cookie de retirada: por isso o aviso vem antes da busca. O Instagram
 * é testado primeiro porque é o mesmo grupo e o caso mais comum.
 */
export function navegadorEmbutido(userAgent: string): 'Instagram' | 'Facebook' | null {
  if (/\bInstagram\b/.test(userAgent)) return 'Instagram'
  if (/FBAN\/|FBAV\/|FB_IAB\//.test(userAgent)) return 'Facebook'
  return null
}
