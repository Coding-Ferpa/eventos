/**
 * As máscaras do formulário de busca (doc 03, 6b). Recebem o que estiver no
 * campo, digitado ou colado, e devolvem só dígitos na forma da máscara: quem
 * cola "529.982.247-25" ou "52998224725" vê a mesma coisa.
 */

function agrupar(digitos: string, cortes: [number, string][]): string {
  let saida = ''
  let inicio = 0
  for (const [fim, separador] of cortes) {
    if (digitos.length <= fim) return saida + digitos.slice(inicio)
    saida += digitos.slice(inicio, fim) + separador
    inicio = fim
  }
  return saida + digitos.slice(inicio)
}

export function mascararCpf(entrada: string): string {
  const digitos = entrada.replace(/\D/g, '').slice(0, 11)
  return agrupar(digitos, [
    [3, '.'],
    [6, '.'],
    [9, '-'],
  ])
}

export function mascararData(entrada: string): string {
  const digitos = entrada.replace(/\D/g, '').slice(0, 8)
  return agrupar(digitos, [
    [2, '/'],
    [4, '/'],
  ])
}

/**
 * DD/MM/AAAA para o `aaaa-mm-dd` da API, ou `null` se a data não existe no
 * calendário, é anterior a 1900 ou está no futuro: nenhuma delas é data de
 * nascimento, e conferir aqui poupa uma tentativa do rate limit.
 */
export function dataParaIso(entrada: string, hoje: Date = new Date()): string | null {
  const digitos = entrada.replace(/\D/g, '')
  if (digitos.length !== 8) return null
  const dia = Number(digitos.slice(0, 2))
  const mes = Number(digitos.slice(2, 4))
  const ano = Number(digitos.slice(4))
  const data = new Date(Date.UTC(ano, mes - 1, dia))
  // Dia que não existe transborda para outro mês: 31/04 vira 01/05.
  if (ano < 1900 || data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1)
    return null
  const iso = data.toISOString().slice(0, 10)
  return iso > hoje.toISOString().slice(0, 10) ? null : iso
}
