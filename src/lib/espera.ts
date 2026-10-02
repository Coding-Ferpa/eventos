/**
 * O tempo de espera do rate limit em pt-BR, arredondado para cima: prometer
 * 40 segundos e liberar em 41 faz a pessoa tentar cedo e cair de novo.
 */
export function formatarEspera(segundos: number): string {
  const s = Math.max(1, Math.ceil(segundos))
  if (s < 60) return s === 1 ? '1 segundo' : `${s} segundos`
  if (s < 3600) {
    const minutos = Math.ceil(s / 60)
    return minutos === 1 ? '1 minuto' : `${minutos} minutos`
  }
  const horas = Math.ceil(s / 3600)
  return horas === 1 ? '1 hora' : `${horas} horas`
}

/**
 * A contagem do painel de "muitas tentativas" (doc 03, 6b): segundos exatos
 * até um minuto, e "cerca de" acima disso, porque a contagem em minutos
 * arredonda para cima e só muda de minuto em minuto.
 */
export function textoDaContagem(segundos: number): string {
  const s = Math.max(1, Math.ceil(segundos))
  return s <= 60
    ? s === 1
      ? '1 segundo'
      : `${s} segundos`
    : `cerca de ${formatarEspera(s)}`
}
