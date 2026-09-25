import Markdown from 'react-markdown'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'

/**
 * Descrição do evento em Markdown (doc 04), sanitizada na renderização
 * (doc 08, A03). O `react-markdown` já não renderiza HTML cru, e a lista
 * branca entra como segunda camada, a mesma do CF Jobs.
 *
 * Sem `h1` na lista: o título do evento já é o `h1` da página, e um `#` na
 * descrição vira texto comum em vez de um segundo título principal.
 */

const ESQUEMA = {
  ...defaultSchema,
  tagNames: [
    'p',
    'h2',
    'h3',
    'h4',
    'ul',
    'ol',
    'li',
    'strong',
    'em',
    'code',
    'pre',
    'blockquote',
    'a',
    'br',
    'hr',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
  ],
  attributes: {
    ...defaultSchema.attributes,
    a: [['href'], ['title']],
  },
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto'],
  },
}

export function EventMarkdown({ conteudo }: { conteudo: string }) {
  return (
    <div className="prosa flex flex-col gap-4">
      <Markdown
        components={{
          a: ({ href, children }) => (
            <a
              className="text-primary underline"
              href={href}
              rel="noopener"
              target="_blank"
            >
              {children}
            </a>
          ),
        }}
        rehypePlugins={[[rehypeSanitize, ESQUEMA]]}
        remarkPlugins={[remarkGfm]}
      >
        {conteudo}
      </Markdown>
    </div>
  )
}
