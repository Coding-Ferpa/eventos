import { describe, expect, it } from 'vitest'

import {
  embrulhar,
  historicoAusente,
  lerNome,
  linhasDaConsulta,
  planejar,
  sha256,
} from './migracoes'

describe('lerNome', () => {
  it('separa versão e nome', () => {
    expect(lerNome('0001_extensions.sql')).toEqual({ versao: '0001', nome: 'extensions' })
    expect(lerNome('0013_cron.sql')).toEqual({ versao: '0013', nome: 'cron' })
  })

  it('recusa o que não segue o padrão, em vez de ordenar errado', () => {
    for (const nome of [
      '1_x.sql',
      '0001-x.sql',
      '0001_X.sql',
      '0001_x.txt',
      'leia-me.md',
    ]) {
      expect(() => lerNome(nome)).toThrow(/não segue o padrão/)
    }
  })
})

describe('planejar', () => {
  const arquivo = (versao: string, conteudo = versao) => ({
    versao,
    nome: `m${versao}`,
    sha256: sha256(conteudo),
  })

  it('banco novo: tudo pendente, na ordem das versões', () => {
    const plano = planejar([arquivo('0002'), arquivo('0000'), arquivo('0001')], [])
    expect(plano.pendentes.map((m) => m.versao)).toEqual(['0000', '0001', '0002'])
  })

  it('só o que falta, quando parte já foi aplicada', () => {
    const plano = planejar(
      [arquivo('0000'), arquivo('0001'), arquivo('0002')],
      [
        { version: '0000', sha256: sha256('0000') },
        { version: '0001', sha256: sha256('0001') },
      ],
    )
    expect(plano.pendentes.map((m) => m.versao)).toEqual(['0002'])
  })

  it('em dia: nada pendente', () => {
    expect(
      planejar([arquivo('0000')], [{ version: '0000', sha256: sha256('0000') }])
        .pendentes,
    ).toEqual([])
  })

  it('recusa migration aplicada que mudou de conteúdo', () => {
    expect(() =>
      planejar(
        [arquivo('0000', 'conteúdo novo')],
        [{ version: '0000', sha256: sha256('conteúdo de antes') }],
      ),
    ).toThrow(/0000.*mudou depois de aplicada/)
  })

  it('recusa banco com migration que o repositório não tem', () => {
    expect(() =>
      planejar(
        [arquivo('0000')],
        [
          { version: '0000', sha256: sha256('0000') },
          { version: '0007', sha256: 'x' },
        ],
      ),
    ).toThrow(/0007.*não existe neste repositório/)
  })

  it('recusa migration nova com versão anterior à última aplicada', () => {
    expect(() =>
      planejar(
        [arquivo('0000'), arquivo('0001'), arquivo('0002')],
        [
          { version: '0000', sha256: sha256('0000') },
          { version: '0002', sha256: sha256('0002') },
        ],
      ),
    ).toThrow(/0001.*anterior à última aplicada/)
  })
})

describe('embrulhar', () => {
  const sql = 'create table eventos.x (id int);\nselect 1;'

  it('põe a migration inteira num bloco só, com o registro no histórico', () => {
    const bloco = embrulhar(sql, { versao: '0003', nome: 'perfis', sha256: 'abc' })
    expect(bloco.startsWith('do $migracao_eventos$')).toBe(true)
    expect(bloco).toContain(`execute $sql_eventos$\n${sql}\n$sql_eventos$;`)
    expect(bloco).toContain(
      "insert into eventos.schema_migrations (version, name, sha256) values ('0003', 'perfis', 'abc');",
    )
    // A trava e a conferência vêm antes do conteúdo: duas execuções ao mesmo
    // tempo não aplicam a mesma migration duas vezes.
    const antesDoConteudo = (trecho: string) => {
      expect(bloco).toContain(trecho)
      expect(bloco.indexOf(trecho)).toBeLessThan(bloco.indexOf(sql))
    }
    antesDoConteudo("pg_advisory_xact_lock(hashtext('cf-eventos:migrar'))")
    antesDoConteudo("where version = '0003'")
  })

  it('seed: o mesmo bloco, sem histórico', () => {
    const bloco = embrulhar(sql)
    expect(bloco).toContain(sql)
    expect(bloco).not.toContain('schema_migrations')
  })

  it('recusa SQL com os delimitadores do próprio bloco', () => {
    expect(() => embrulhar('select $sql_eventos$x$sql_eventos$')).toThrow(/delimitador/)
    expect(() => embrulhar('do $migracao_eventos$ begin end $migracao_eventos$')).toThrow(
      /delimitador/,
    )
  })

  it('recusa versão ou nome que quebrariam o literal do insert', () => {
    expect(() => embrulhar(sql, { versao: "0001'", nome: 'x', sha256: 'abc' })).toThrow()
    expect(() =>
      embrulhar(sql, { versao: '0001', nome: "x'); drop", sha256: 'abc' }),
    ).toThrow()
  })
})

describe('historicoAusente', () => {
  it('reconhece o banco sem o Eventos nos dois formatos da CLI', () => {
    // Banco local: a CLI fala direto com o Postgres.
    expect(
      historicoAusente(
        'failed to execute query: error: relation "eventos.schema_migrations" does not exist',
      ),
    ).toBe(true)
    // Projeto hospedado: passa pela API de gerenciamento, com aspas escapadas.
    expect(
      historicoAusente(
        'unexpected status 400: {"message":"Failed to run sql query: ERROR:  42P01: relation \\"eventos.schema_migrations\\" does not exist\nLINE 1: select version"}',
      ),
    ).toBe(true)
    expect(historicoAusente('ERROR:  3F000: schema "eventos" does not exist')).toBe(true)
    expect(
      historicoAusente(
        'unexpected status 400: {"message":"Failed to run sql query: ERROR:  3F000: schema \\"eventos\\" does not exist"}',
      ),
    ).toBe(true)
  })

  it('não confunde outro erro com banco vazio', () => {
    expect(historicoAusente('permission denied for schema eventos')).toBe(false)
    expect(historicoAusente('relation "eventos.events" does not exist')).toBe(false)
    expect(historicoAusente('connection refused')).toBe(false)
  })
})

describe('linhasDaConsulta', () => {
  // Os dois formatos medidos na CLI 3.1: ela muda a saída conforme acha que
  // quem roda é uma pessoa ou um agente.
  const linhas = [
    { version: '0000', sha256: 'a' },
    { version: '0001', sha256: 'b' },
  ]

  it('lê a lista pura, que é o que a pessoa no terminal recebe', () => {
    expect(linhasDaConsulta(JSON.stringify(linhas, null, 2))).toEqual(linhas)
  })

  it('lê o envelope com rows, que é o que um agente recebe', () => {
    const envelope = { boundary: 'x', rows: linhas, warning: 'dados não confiáveis' }
    expect(linhasDaConsulta(JSON.stringify(envelope, null, 2))).toEqual(linhas)
  })

  it('aceita texto antes do JSON e lista vazia', () => {
    expect(linhasDaConsulta('Aviso qualquer\n[]')).toEqual([])
    expect(linhasDaConsulta('{"rows": []}')).toEqual([])
  })

  it('recusa o que não é resultado de consulta, em vez de seguir sem histórico', () => {
    expect(() => linhasDaConsulta('sem json nenhum')).toThrow(/resposta/)
    expect(() => linhasDaConsulta('{"_tag":"Error"}')).toThrow(/resposta/)
  })
})
