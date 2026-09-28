/**
 * A chave de um campo de conteúdo a partir do rótulo, no formato do doc 05
 * (`^[a-z][a-z0-9_]{1,39}$`): "Título da palestra" vira `titulo_palestra`. O
 * editor a sugere enquanto o admin não mexe na chave; o schema continua sendo
 * quem decide se ela vale (chave reservada, por exemplo, é recusada lá).
 */
export function keyFromLabel(rotulo: string): string {
  const base = rotulo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    // Partículas não ajudam a reconhecer o campo e gastam os 40 caracteres.
    .replace(/\b(de|da|do|das|dos|e)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  const chave = /^[a-z]/.test(base) ? base : `campo_${base}`
  return chave.slice(0, 40).replace(/_+$/, '')
}
