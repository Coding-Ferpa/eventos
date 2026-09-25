import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacidade',
  description:
    'Quais dados a plataforma de certificados da Coding Ferpa usa, por quê, por quanto tempo e como pedir correção ou remoção.',
  alternates: { canonical: '/privacidade' },
}

/**
 * O que o doc 08 decide sobre LGPD, em linguagem de quem vai ler: o que é
 * coletado, a base legal, a retenção, os cookies e os direitos.
 *
 * O encarregado e o e-mail dele ainda dependem da organização, assim como a
 * validação jurídica deste texto. Os dois são itens do runbook do M9: esta
 * página não vai ao ar sem eles.
 */
const ENCARREGADO: { nome: string; email: string } | null = null

const ATUALIZADA_EM = '25 de setembro de 2026'

export default function PrivacidadePage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-16">
      <header className="flex flex-col gap-3">
        <h1 className="text-h2 font-bold">Privacidade</h1>
        <p className="text-body text-muted-foreground">
          Esta plataforma existe para emitir e validar certificados dos eventos da
          comunidade Coding Ferpa. Ela usa o mínimo de dados para isso, e aqui está cada
          um deles.
        </p>
      </header>

      <section aria-labelledby="quem" className="prosa flex flex-col gap-4">
        <h2 id="quem">Quem cuida dos seus dados</h2>
        <p>
          A organização da Coding Ferpa é a controladora dos dados. Para hospedar a
          plataforma, ela usa a Vercel (site), o Supabase (banco de dados e arquivos), o
          Resend (envio de e-mail) e o Sentry (registro de erros, sem dados pessoais).
        </p>
        {ENCARREGADO ? (
          <p>
            O encarregado pelo tratamento de dados é {ENCARREGADO.nome}, no e-mail{' '}
            <a className="text-primary underline" href={`mailto:${ENCARREGADO.email}`}>
              {ENCARREGADO.email}
            </a>
            . É por ele que você pede acesso, correção ou remoção dos seus dados.
          </p>
        ) : (
          <p>
            O contato do encarregado pelo tratamento de dados será publicado aqui antes do
            primeiro evento.
          </p>
        )}
      </section>

      <section aria-labelledby="dados" className="prosa flex flex-col gap-4">
        <h2 id="dados">O que usamos, e para quê</h2>
        <ul>
          <li>
            <strong>Nome completo:</strong> para emitir o certificado e para quem o recebe
            poder conferir que ele é seu.
          </li>
          <li>
            <strong>CPF, e-mail e data de nascimento</strong>, quando o evento pede: só
            para achar o seu certificado na busca. O CPF nunca fica guardado como você o
            digita: guardamos uma impressão digital dele, que não permite recuperar o
            número, e os três últimos dígitos.
          </li>
          <li>
            <strong>O conteúdo do certificado</strong>, como o título da palestra ou a
            turma: para imprimir no documento.
          </li>
          <li>
            <strong>O contato que você deixar num pedido de correção:</strong> para
            responder ao pedido.
          </li>
          <li>
            <strong>Endereço IP e dispositivo, embaralhados a cada dia:</strong> para
            conter abuso da busca. O IP nunca é guardado como ele é, e o embaralhamento
            muda à meia-noite, então não dá para seguir ninguém de um dia para o outro.
          </li>
        </ul>
        <p>
          A página de validação de um certificado mostra só o nome, o evento, o tipo de
          participação, a carga horária e as datas. Nenhuma página pública mostra CPF,
          e-mail ou data de nascimento, e as páginas com nome de pessoa não aparecem em
          buscadores.
        </p>
      </section>

      <section aria-labelledby="base-legal" className="prosa flex flex-col gap-4">
        <h2 id="base-legal">Por que podemos usar esses dados</h2>
        <ul>
          <li>
            Os dados do certificado: porque você se inscreveu num evento que entrega
            certificado, e emitir e permitir validar esse certificado é o serviço (LGPD,
            art. 7º, V).
          </li>
          <li>
            Os registros de segurança: por legítimo interesse em proteger a busca contra
            abuso, sempre com o dado embaralhado (LGPD, art. 7º, IX).
          </li>
          <li>
            Participantes com menos de 18 anos: os dados são tratados no melhor interesse
            de cada um, com o mínimo necessário (LGPD, art. 14).
          </li>
        </ul>
      </section>

      <section aria-labelledby="prazos" className="prosa flex flex-col gap-4">
        <h2 id="prazos">Por quanto tempo</h2>
        <ul>
          <li>
            CPF, e-mail e data de nascimento: 5 anos depois do fim do evento. Depois
            disso, a busca por esses dados deixa de funcionar para aquele evento, e o
            certificado continua validável pelo código.
          </li>
          <li>
            Nome, certificado e código: enquanto o certificado precisar ser verificável,
            ou até você pedir a remoção.
          </li>
          <li>Registros de busca, de validação e de visita: 90 dias.</li>
          <li>
            A planilha de participantes enviada pela organização nunca é guardada: ela é
            lida, conferida e descartada.
          </li>
        </ul>
      </section>

      <section aria-labelledby="cookies" className="prosa flex flex-col gap-4">
        <h2 id="cookies">Cookies</h2>
        <ul>
          <li>
            <strong>cf-tema:</strong> guarda se você prefere o tema claro ou o escuro.
            Dura um ano.
          </li>
          <li>
            <strong>cf-dispositivo:</strong> identifica o seu navegador para limitar
            tentativas seguidas na busca, sem prejudicar quem está na mesma rede que você.
            É um cookie de segurança, estritamente necessário, e dura 30 dias.
          </li>
          <li>
            Quem entra no painel da organização recebe também os cookies de sessão do
            login.
          </li>
        </ul>
        <p>
          A contagem de visitas do site não usa cookie nem identificador que acompanhe
          você entre páginas ou dias.
        </p>
      </section>

      <section aria-labelledby="direitos" className="prosa flex flex-col gap-4">
        <h2 id="direitos">Seus direitos</h2>
        <p>
          Você pode pedir acesso aos seus dados, correção ou remoção, pelo contato do
          encarregado. Respondemos em até 15 dias. Se o que você quer é só corrigir o nome
          no certificado, o pedido de correção na própria tela do certificado é mais
          rápido, e o certificado corrigido mantém o mesmo código.
        </p>
        <p>
          Antes de remover, explicamos a consequência: o certificado deixa de ser
          validável, e quem conferir o código vai ler que ele foi removido a pedido do
          titular, sem nenhum dado seu.
        </p>
        <p>
          Para conferir se um certificado é autêntico, use{' '}
          <Link className="text-primary underline" href="/validar">
            Validar certificado
          </Link>
          .
        </p>
      </section>

      <p className="text-caption text-muted-foreground">Atualizada em {ATUALIZADA_EM}.</p>
    </div>
  )
}
