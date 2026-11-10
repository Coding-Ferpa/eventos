import { describe, expect, it } from 'vitest'

import { embrulhar, lerNome, planejar, sha256 } from './migracoes'

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
