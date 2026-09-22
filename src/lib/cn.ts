import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Junta classes resolvendo conflitos do Tailwind: é o `cn` que os componentes
 * do shadcn/ui esperam. Vive em `lib/cn` (e não em um `utils` genérico) para
 * não virar depósito de função solta.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
