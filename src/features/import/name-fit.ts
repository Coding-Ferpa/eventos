import { layout, type FontResolver } from '@/features/certificate/layout/layout'
import type {
  DataField,
  LayoutField,
  TemplatePage,
  TemplateSnapshot,
  TextField,
} from '@/features/certificate/schema'
import type { TokenContext } from '@/features/certificate/tokens'

/**
 * `LAYOUT_BELOW_MIN_SIZE` (doc 06): na prévia, o `layout()` do motor roda só
 * para medir o nome de cada linha nos campos que o imprimem, no modelo do tipo
 * da linha. Nome que precisaria ficar abaixo do mínimo sai pequeno e com
 * aviso, e o aviso chega antes do certificado.
 */

export type NameLayout = {
  pages: TemplatePage[]
  dataFields: DataField[]
  /** Só os campos de texto que citam o nome: medir o resto seria trabalho à toa. */
  nameFields: TextField[]
}

const TOKEN_DO_NOME = '{{participant.full_name}}'

export function nameFields(campos: LayoutField[]): TextField[] {
  return campos.filter(
    (campo): campo is TextField =>
      campo.kind === 'text' && campo.content.includes(TOKEN_DO_NOME),
  )
}

export function nameIsBelowMin(
  nome: string,
  modelo: NameLayout,
  contexto: Omit<TokenContext, 'participant'>,
  fontes: FontResolver,
): boolean {
  if (modelo.nameFields.length === 0) return false
  // O layout só lê páginas, campos de conteúdo e campos posicionados; o resto
  // do snapshot (base.pdf, versão) não existe no rascunho e não importa aqui.
  const parcial = {
    pages: modelo.pages,
    data_fields: modelo.dataFields,
    layout_fields: modelo.nameFields,
  } as unknown as TemplateSnapshot
  const plano = layout(
    parcial,
    { ...contexto, participant: { fullName: nome, cpfLast3: null } },
    fontes,
  )
  return plano.warnings.some((aviso) => aviso.code === 'BELOW_MIN_SIZE')
}
