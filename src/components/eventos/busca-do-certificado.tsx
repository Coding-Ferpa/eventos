'use client'

import { Check } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'

import {
  camposDoMetodo,
  conferirCampo,
  corpoDaBusca,
  metodosDisponiveis,
  type CampoDaBusca,
  type ConfiguracaoDaBusca,
  type MetodoDaBusca,
} from '@/lib/busca'
import { textoDaContagem } from '@/lib/espera'
import { mascararCpf, mascararData } from '@/lib/mascaras'
import { navegadorEmbutido } from '@/lib/navegador-embutido'

/**
 * O formulário de busca do certificado (doc 03, 6b), a ilha interativa da
 * página do evento (doc 09). A página segue ISR: o que depende de quem visita,
 * o aviso de navegador embutido e o `?sessao=expirada`, é lido aqui, no
 * navegador.
 *
 * Os campos não são controlados: o valor mora no DOM, e quem digita antes da
 * hidratação num celular lento não perde o que digitou. Pelo mesmo motivo, é
 * o rádio marcado, pelo CSS (`.busca` no globals.css), que decide qual campo
 * aparece, e não um estado do React.
 */

type Estado =
  | { tipo: 'pronto' }
  | { tipo: 'buscando' }
  | { tipo: 'nao_encontrado' }
  | { tipo: 'limite'; ate: number; aviso: string }
  | { tipo: 'erro'; mensagem: string }

export type Contato = { texto: string; href: string }

const ROTULO_DO_METODO: Record<MetodoDaBusca, string> = {
  cpf: 'CPF',
  email: 'E-mail',
  name: 'Nome',
}

const ROTULO_DO_CAMPO: Record<CampoDaBusca, string> = {
  cpf: 'CPF',
  email: 'E-mail',
  full_name: 'Nome completo',
  birth_date: 'Data de nascimento',
}

const ATRIBUTOS: Record<CampoDaBusca, React.InputHTMLAttributes<HTMLInputElement>> = {
  cpf: { type: 'text', inputMode: 'numeric', autoComplete: 'off', maxLength: 14 },
  email: {
    type: 'email',
    autoComplete: 'email',
    autoCapitalize: 'none',
    spellCheck: false,
    maxLength: 254,
  },
  full_name: {
    type: 'text',
    autoComplete: 'name',
    autoCapitalize: 'words',
    spellCheck: false,
    maxLength: 120,
  },
  // `type="date"` obriga a rolar anos no Android; 8 números são mais rápidos.
  birth_date: {
    type: 'text',
    inputMode: 'numeric',
    autoComplete: 'bday',
    maxLength: 10,
    placeholder: 'DD/MM/AAAA',
  },
}

const AJUDA_DO_NOME = 'Do jeito que você escreveu na inscrição, com todos os sobrenomes.'
const SEM_CONEXAO =
  'Não conseguimos falar com o servidor. Confira a conexão e tente de novo.'

// Valores que só existem no navegador. O servidor (e a primeira passada da
// hidratação) vê o terceiro argumento; não há o que assinar.
const semAssinatura = () => () => {}

export function BuscaDoCertificado({
  slug,
  busca,
  contato,
}: {
  slug: string
  busca: ConfiguracaoDaBusca
  contato: Contato | null
}) {
  const router = useRouter()
  const id = useId()
  const [estado, setEstado] = useState<Estado>({ tipo: 'pronto' })
  const [erros, setErros] = useState<Partial<Record<CampoDaBusca, string>>>({})
  const [agora, setAgora] = useState(0)
  const [anuncio, setAnuncio] = useState('')
  const tituloDoNaoEncontrado = useRef<HTMLHeadingElement>(null)
  const avisoDeExpirada = useRef<HTMLParagraphElement>(null)

  const hidratado = useSyncExternalStore(
    semAssinatura,
    () => true,
    () => false,
  )
  const app = useSyncExternalStore(
    semAssinatura,
    () => navegadorEmbutido(navigator.userAgent),
    () => null,
  )
  const expirada = useSyncExternalStore(
    semAssinatura,
    () => new URLSearchParams(location.search).get('sessao') === 'expirada',
    () => false,
  )

  useEffect(() => {
    if (expirada) avisoDeExpirada.current?.scrollIntoView({ block: 'center' })
  }, [expirada])

  useEffect(() => {
    if (estado.tipo === 'nao_encontrado') tituloDoNaoEncontrado.current?.focus()
    if (estado.tipo !== 'limite') return
    const relogio = setInterval(() => {
      const instante = Date.now()
      if (instante < estado.ate) return setAgora(instante)
      clearInterval(relogio)
      setEstado({ tipo: 'pronto' })
      setAnuncio('Pronto, já dá para buscar de novo.')
    }, 1000)
    return () => clearInterval(relogio)
  }, [estado])

  const metodos = metodosDisponiveis(busca)
  const grupos =
    busca.mode === 'all'
      ? [{ metodo: 'all' as const, campos: camposDoMetodo(busca, 'all') }]
      : metodos.map((metodo) => ({ metodo, campos: camposDoMetodo(busca, metodo) }))
  if (grupos.every((grupo) => grupo.campos.length === 0)) return null

  function focar(formulario: HTMLFormElement, campo: CampoDaBusca) {
    ;(formulario.elements.namedItem(campo) as HTMLInputElement | null)?.focus()
  }

  async function buscar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (estado.tipo === 'buscando' || estado.tipo === 'limite') return
    const formulario = evento.currentTarget
    const dados = new FormData(formulario)
    const metodo = String(dados.get('method') ?? 'all') as MetodoDaBusca | 'all'
    const campos = camposDoMetodo(busca, metodo)
    const valores = Object.fromEntries(
      campos.map((campo) => [campo, String(dados.get(campo) ?? '')]),
    )

    const problemas: Partial<Record<CampoDaBusca, string>> = {}
    for (const campo of campos) {
      const problema = conferirCampo(campo, valores[campo] ?? '')
      if (problema) problemas[campo] = problema
    }
    setErros(problemas)
    const primeiro = campos.find((campo) => problemas[campo])
    if (primeiro) {
      setEstado({ tipo: 'pronto' })
      return focar(formulario, primeiro)
    }

    setAnuncio('')
    setEstado({ tipo: 'buscando' })
    let resposta: Response
    try {
      resposta = await fetch('/api/certificados/buscar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(corpoDaBusca(slug, metodo, campos, valores)),
      })
    } catch {
      return setEstado({ tipo: 'erro', mensagem: SEM_CONEXAO })
    }

    if (resposta.ok) {
      // Fica em "Buscando..." até a tela de retirada abrir.
      const { redirect } = (await resposta.json()) as { redirect: string }
      return router.push(redirect)
    }
    if (resposta.status === 404) return setEstado({ tipo: 'nao_encontrado' })
    if (resposta.status === 429) {
      const segundos = Math.max(1, Number(resposta.headers.get('Retry-After')) || 60)
      const instante = Date.now()
      setAgora(instante)
      return setEstado({
        tipo: 'limite',
        ate: instante + segundos * 1000,
        aviso: `Muitas tentativas seguidas. Você pode tentar de novo em ${textoDaContagem(segundos)}.`,
      })
    }

    const problema = (await resposta.json().catch(() => ({}))) as {
      detail?: string
      field_errors?: Record<string, string[]>
    }
    const doServidor: Partial<Record<CampoDaBusca, string>> = {}
    for (const campo of campos) {
      const mensagem = problema.field_errors?.[campo]?.[0]
      if (mensagem) doServidor[campo] = mensagem
    }
    setErros(doServidor)
    const comErro = campos.find((campo) => doServidor[campo])
    if (comErro) focar(formulario, comErro)
    setEstado({
      tipo: 'erro',
      mensagem:
        problema.detail ?? 'Não conseguimos buscar agora. Tente de novo em instantes.',
    })
  }

  function trocarDeMetodo() {
    setErros({})
    if (estado.tipo === 'nao_encontrado' || estado.tipo === 'erro')
      setEstado({ tipo: 'pronto' })
  }

  const campo = (nome: CampoDaBusca) => {
    const idDoCampo = `${id}-${nome}`
    const erro = erros[nome]
    const descritoPor =
      [nome === 'full_name' && `${idDoCampo}-ajuda`, erro && `${idDoCampo}-erro`]
        .filter(Boolean)
        .join(' ') || undefined
    return (
      <div className="flex flex-col gap-1.5" key={nome}>
        <label className="text-caption font-medium" htmlFor={idDoCampo}>
          {ROTULO_DO_CAMPO[nome]}
        </label>
        <input
          aria-describedby={descritoPor}
          aria-invalid={erro ? true : undefined}
          className={[
            'bg-surface border-subtle-foreground min-h-12 rounded-sm border px-3',
            nome === 'cpf' ? 'font-mono tracking-wide' : '',
          ].join(' ')}
          id={idDoCampo}
          name={nome}
          onBlur={(evento) => {
            // Dígito verificador no blur (doc 03): o erro aparece antes do envio.
            const valor = evento.currentTarget.value
            if (nome !== 'cpf' || !valor.trim()) return
            const problema = conferirCampo('cpf', valor)
            if (problema) setErros((atuais) => ({ ...atuais, cpf: problema }))
          }}
          onChange={(evento) => {
            const entrada = evento.currentTarget
            if (nome === 'cpf') entrada.value = mascararCpf(entrada.value)
            if (nome === 'birth_date') entrada.value = mascararData(entrada.value)
            if (erros[nome]) setErros(({ [nome]: _, ...resto }) => resto)
          }}
          readOnly={estado.tipo === 'buscando'}
          {...ATRIBUTOS[nome]}
        />
        {nome === 'full_name' ? (
          <p className="text-caption text-muted-foreground" id={`${idDoCampo}-ajuda`}>
            {AJUDA_DO_NOME}
          </p>
        ) : null}
        {erro ? (
          <p className="text-caption text-destructive" id={`${idDoCampo}-erro`}>
            {erro}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col gap-5">
      {app ? (
        <p className="border-warning rounded-md border px-4 py-3">
          Você está no navegador do {app}, que costuma falhar ao baixar PDF. Abra o menu
          de três pontos e escolha Abrir no navegador antes de buscar.
        </p>
      ) : null}
      <p
        className={expirada ? 'border-warning rounded-md border px-4 py-3' : 'sr-only'}
        ref={avisoDeExpirada}
        role="status"
      >
        {expirada
          ? 'Por segurança, esta tela expirou. Busque de novo, leva poucos segundos.'
          : ''}
      </p>

      {/* Antes da hidratação o botão fica desligado, e o envio nativo, se
          acontecer, vai por POST: com GET, o CPF iria parar na URL e nos logs. */}
      <form
        action="/api/certificados/buscar"
        className="busca flex flex-col gap-5"
        method="post"
        noValidate
        onSubmit={(evento) => void buscar(evento)}
      >
        {metodos.length > 1 ? (
          <div className="flex flex-col gap-2">
            <span className="text-caption font-medium" id={`${id}-metodo`}>
              Buscar por
            </span>
            <div
              aria-labelledby={`${id}-metodo`}
              className="flex flex-wrap gap-2"
              role="radiogroup"
            >
              {metodos.map((metodo, i) => (
                <label
                  className="border-border text-muted-foreground has-[:checked]:border-primary has-[:checked]:text-foreground has-[:focus-visible]:outline-primary group inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-4 has-[:checked]:font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2"
                  key={metodo}
                >
                  <input
                    className="sr-only"
                    defaultChecked={i === 0}
                    name="method"
                    onChange={trocarDeMetodo}
                    type="radio"
                    value={metodo}
                  />
                  <Check
                    aria-hidden="true"
                    className="text-primary hidden size-4 group-has-[:checked]:block"
                  />
                  {ROTULO_DO_METODO[metodo]}
                </label>
              ))}
            </div>
          </div>
        ) : (
          <input
            name="method"
            type="hidden"
            value={busca.mode === 'all' ? 'all' : metodos[0]}
          />
        )}

        {grupos.map((grupo) => (
          <div
            data-metodo={metodos.length > 1 ? grupo.metodo : undefined}
            key={grupo.metodo}
          >
            <div className="flex flex-col gap-4">{grupo.campos.map(campo)}</div>
          </div>
        ))}

        {estado.tipo === 'limite' ? (
          <div className="border-warning rounded-md border px-4 py-3">
            <p className="sr-only" role="alert">
              {estado.aviso}
            </p>
            {/* A contagem fica fora da região viva: o leitor de tela ouviria
                cada segundo. */}
            <p aria-hidden="true">
              Muitas tentativas seguidas. Você pode tentar de novo em{' '}
              {textoDaContagem((estado.ate - agora) / 1000)}.
            </p>
          </div>
        ) : null}

        {estado.tipo === 'nao_encontrado' ? (
          <div className="border-warning flex flex-col gap-3 rounded-md border px-4 py-4">
            <h3 className="font-semibold" ref={tituloDoNaoEncontrado} tabIndex={-1}>
              Não encontramos ninguém com esses dados neste evento.
            </h3>
            <p>Confira se o nome está igual ao da inscrição. As causas mais comuns:</p>
            <ul className="text-muted-foreground flex list-disc flex-col gap-1 pl-5">
              <li>
                o nome está diferente do da inscrição: falta um sobrenome, ou entrou um
                apelido ou uma abreviação;
              </li>
              <li>a inscrição foi em outro evento da comunidade;</li>
              <li>a organização ainda está completando a lista deste evento.</li>
            </ul>
            <p>
              Ainda não deu certo? Escreva para{' '}
              {contato ? (
                <a className="text-primary underline" href={contato.href}>
                  {contato.texto}
                </a>
              ) : (
                'a organização do evento'
              )}
              .
            </p>
          </div>
        ) : null}

        {estado.tipo === 'erro' ? (
          <p className="text-destructive" role="alert">
            {estado.mensagem}
          </p>
        ) : null}
        <p className="sr-only" role="status">
          {anuncio}
        </p>

        <button
          aria-busy={estado.tipo === 'buscando'}
          className="bg-primary-solid text-primary-foreground min-h-12 w-full rounded-full px-6 font-semibold transition-colors duration-150 disabled:opacity-60 sm:w-fit"
          disabled={!hidratado || estado.tipo === 'limite'}
          type="submit"
        >
          {estado.tipo === 'buscando' ? 'Buscando...' : 'Buscar meu certificado'}
        </button>
      </form>
    </div>
  )
}
