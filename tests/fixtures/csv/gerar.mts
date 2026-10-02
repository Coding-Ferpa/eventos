/**
 * Gerador das fixtures de CSV do doc 06. Os bytes versionados ao lado são a
 * verdade; este arquivo existe para mostrar o que cada byte é, porque
 * Windows-1252 e UTF-16 não se leem num diff. Não roda no CI.
 *
 * Tudo sintético: nomes inventados e CPFs inventados com dígito verificador
 * válido (calculado aqui, a partir de nove dígitos escolhidos à mão).
 *
 * Uso: `npx tsx tests/fixtures/csv/gerar.mts`
 */
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PASTA = path.dirname(fileURLToPath(import.meta.url))

function digitos(base: string) {
  const calcular = (parcial: string) => {
    const soma = [...parcial].reduce((s, d, i) => s + Number(d) * (parcial.length + 1 - i), 0)
    const resto = (soma * 10) % 11
    return resto === 10 ? 0 : resto
  }
  const d1 = calcular(base)
  const d2 = calcular(base + d1)
  return `${base}${d1}${d2}`
}

const mascara = (cpf: string) => `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`

/** As pessoas da fixture principal. O apóstrofo de D’Ávila é o U+2019. */
export const PESSOAS = [
  { nome: 'José Gonçalves de Assunção', cpf: digitos('529982247'), nascimento: '12/09/1990', email: 'jose.assuncao@exemplo.org', horas: '8' },
  { nome: 'Maria Eduarda dos Santos Albuquerque', cpf: digitos('111444777'), nascimento: '03/02/2001', email: 'maria.eduarda@exemplo.org', horas: '8' },
  { nome: 'Ângela Muñoz Ñandú', cpf: digitos('390533447'), nascimento: '25/12/1985', email: 'angela.munoz@exemplo.org', horas: '4,5' },
  { nome: 'João Pedro da Silva', cpf: digitos('123456789'), nascimento: '07/07/1999', email: 'joao.pedro@exemplo.org', horas: '8' },
  { nome: 'Ana-Clara D’Ávila', cpf: digitos('987654321'), nascimento: '15/03/2004', email: 'anaclara@exemplo.org', horas: '8' },
  { nome: 'Conceição Araújo Lima', cpf: digitos('246813579'), nascimento: '30/11/1978', email: 'conceicao.lima@exemplo.org', horas: '8' },
  { nome: 'Luís Antônio Gonçalves', cpf: digitos('135792468'), nascimento: '01/01/1960', email: 'luis.antonio@exemplo.org', horas: '2' },
]

const CABECALHO = ['Nome completo', 'CPF', 'Data de nascimento', 'E-mail', 'Carga horária']
const linhas = (pessoas = PESSOAS) =>
  pessoas.map((p) => [p.nome, mascara(p.cpf), p.nascimento, p.email, p.horas])

/** Como as planilhas exportam: aspas só no campo com delimitador, aspas ou quebra de linha. */
function celula(valor: string, sep: string) {
  return valor.includes(sep) || valor.includes('"') || /[\r\n]/.test(valor)
    ? `"${valor.replaceAll('"', '""')}"`
    : valor
}

function texto(registros: string[][], sep: string, fim: string) {
  return registros.map((r) => r.map((v) => celula(v, sep)).join(sep)).join(fim) + fim
}

/** Windows-1252: Latin-1 nos acentos, e o 0x92 para o apóstrofo tipográfico. */
function cp1252(conteudo: string) {
  const bytes: number[] = []
  for (const c of conteudo) {
    if (c === '’') bytes.push(0x92)
    else {
      const cp = c.codePointAt(0)!
      if (cp > 0xff) throw new Error(`Fora do Windows-1252: ${c}`)
      bytes.push(cp)
    }
  }
  return Buffer.from(bytes)
}

const BOM_UTF8 = Buffer.from([0xef, 0xbb, 0xbf])
const BOM_UTF16LE = Buffer.from([0xff, 0xfe])

function gravar(nome: string, bytes: Buffer) {
  writeFileSync(path.join(PASTA, nome), bytes)
  console.log(`${nome}: ${bytes.byteLength} bytes`)
}

// O caso principal: o "CSV (separado por ponto e vírgula)" do Excel pt-BR.
gravar('excel-ptbr-cp1252-semicolon.csv', cp1252(texto([CABECALHO, ...linhas()], ';', '\r\n')))
gravar('excel-csv-utf8-bom-semicolon.csv', Buffer.concat([BOM_UTF8, Buffer.from(texto([CABECALHO, ...linhas()], ';', '\r\n'), 'utf8')]))
gravar('google-sheets-utf8-comma.csv', Buffer.from(texto([CABECALHO, ...linhas()], ',', '\n'), 'utf8'))
gravar('excel-unicode-utf16le-tab.txt', Buffer.concat([BOM_UTF16LE, Buffer.from(texto([CABECALHO, ...linhas()], '\t', '\r\n'), 'utf16le')]))

gravar(
  'ascii-only.csv',
  Buffer.from(
    texto(
      [
        ['Nome', 'Email'],
        ['Paulo Ricardo Mendes', 'paulo.mendes@exemplo.org'],
        ['Tiago Henrique Rocha', 'tiago.rocha@exemplo.org'],
      ],
      ',',
      '\n',
    ),
    'utf8',
  ),
)

// UTF-8 válido, mas o texto já chegou estragado de outro sistema.
gravar(
  'mojibake-upstream.csv',
  Buffer.from(texto([['Nome', 'Email'], ['JosÃ© GonÃ§alves', 'jose@exemplo.org'], ['Ana Lima', 'ana@exemplo.org']], ';', '\n'), 'utf8'),
)

gravar(
  'quoted-delimiter-and-newline.csv',
  Buffer.from(
    'Nome;Observação\r\n' +
      '"Silva; Maria";"primeira linha\r\nsegunda linha"\r\n' +
      'Pedro Alves;"aspas ""duplas"" dentro"\r\n',
    'utf8',
  ),
)

// O Excel come o zero à esquerda de coluna numérica: 9 e 10 dígitos.
const zeros9 = digitos('001234567')
const zeros10 = digitos('012345678')
gravar(
  'cpf-leading-zeros-lost.csv',
  Buffer.from(
    texto(
      [
        ['Nome', 'CPF'],
        ['Rafael Moura Dias', zeros9.replace(/^0+/, '')],
        ['Beatriz Nunes Prado', zeros10.replace(/^0+/, '')],
      ],
      ';',
      '\r\n',
    ),
    'utf8',
  ),
)
gravar(
  'cpf-scientific.csv',
  Buffer.from(texto([['Nome', 'CPF'], ['Rafael Moura Dias', '1,23457E+10'], ['Beatriz Nunes Prado', mascara(zeros10)]], ';', '\r\n'), 'utf8'),
)

// Todos os formatos aceitos para a mesma data, o serial do Excel e o ano com
// dois dígitos, que é recusado.
const serial = String(Math.round((Date.UTC(1990, 8, 12) - Date.UTC(1899, 11, 30)) / 86_400_000))
gravar(
  'dates-mixed.csv',
  Buffer.from(
    texto(
      [
        ['Nome', 'Nascimento'],
        ['Data Com Barras', '12/09/1990'],
        ['Data Com Hifens', '12-09-1990'],
        ['Data Com Pontos', '12.09.1990'],
        ['Data Iso', '1990-09-12'],
        ['Data Serial', serial],
        ['Ano Com Dois Digitos', '12/09/90'],
      ],
      ';',
      '\r\n',
    ),
    'utf8',
  ),
)

const [jose, maria] = PESSOAS
gravar(
  'duplicates-in-file.csv',
  Buffer.from(
    texto(
      [
        ['Nome', 'CPF', 'Tipo'],
        [jose!.nome, mascara(jose!.cpf), 'Participante'],
        [maria!.nome, mascara(maria!.cpf), 'Participante'],
        // Mesma pessoa, outro tipo: não é duplicata.
        [jose!.nome, mascara(jose!.cpf), 'Palestrante'],
        // Mesma pessoa e mesmo tipo da linha 2: é.
        [jose!.nome, mascara(jose!.cpf), 'Participante'],
      ],
      ';',
      '\r\n',
    ),
    'utf8',
  ),
)

gravar(
  'speakers-with-talk-title.csv',
  Buffer.from(
    texto(
      [
        ['Nome', 'CPF', 'Título da palestra'],
        [jose!.nome, mascara(jose!.cpf), 'Git na prática'],
        [maria!.nome, mascara(maria!.cpf), ''],
      ],
      ';',
      '\r\n',
    ),
    'utf8',
  ),
)

gravar(
  'mixed-types-union.csv',
  Buffer.from(
    texto(
      [
        ['Nome', 'CPF', 'Tipo', 'Título da palestra'],
        [jose!.nome, mascara(jose!.cpf), 'Palestrante', 'Git na prática'],
        // Participante com título: o modelo dele não declara a chave.
        [maria!.nome, mascara(maria!.cpf), 'Participante', 'Título que não cabe aqui'],
        [PESSOAS[3]!.nome, mascara(PESSOAS[3]!.cpf), 'Participante', ''],
      ],
      ';',
      '\r\n',
    ),
    'utf8',
  ),
)

gravar(
  'content-looks-like-cpf.csv',
  Buffer.from(texto([['Nome', 'Registro'], [jose!.nome, mascara(maria!.cpf)], [maria!.nome, '2026-0042']], ';', '\r\n'), 'utf8'),
)

gravar(
  'homonyms.csv',
  Buffer.from(
    texto(
      [
        ['Nome', 'CPF'],
        ['João Pedro da Silva', mascara(PESSOAS[3]!.cpf)],
        ['João Pedro da Silva', mascara(digitos('864213579'))],
      ],
      ';',
      '\r\n',
    ),
    'utf8',
  ),
)

// Par com o arquivo principal: a Conceição corrigida para "Conceição Araújo
// Lima Souza" (mesmo CPF) casa por CPF e vira atualização.
const corrigidas = PESSOAS.map((p, i) => (i === 5 ? { ...p, nome: 'Conceição Araújo Lima Souza' } : p))
gravar('reimport-name-fixed.csv', cp1252(texto([CABECALHO, ...linhas(corrigidas)], ';', '\r\n')))

// A segunda planilha, agora com CPF. A primeira é a principal importada com a
// coluna de CPF fora do mapeamento: a pessoa casa por nome e nascimento e
// ganha o CPF, em vez de ser duplicada.
gravar('reimport-cpf-added.csv', cp1252(texto([CABECALHO, ...linhas()], ';', '\r\n')))
