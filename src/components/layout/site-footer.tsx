const LINKS = [
  { href: 'https://codingferpa.org/', rotulo: 'Comunidade Coding Ferpa' },
  { href: 'https://github.com/Coding-Ferpa/eventos', rotulo: 'Código no GitHub' },
]

export function SiteFooter() {
  return (
    <footer className="border-border mt-16 border-t">
      <div className="mx-auto flex w-full max-w-[var(--container-max)] flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-caption text-muted-foreground">
          Certificados emitidos pela comunidade{' '}
          <strong className="font-semibold">Coding Ferpa</strong>. Projeto open source,
          sob licença MIT.
        </p>

        <nav aria-label="Links da comunidade">
          <ul className="text-caption flex flex-wrap gap-4">
            {LINKS.map((link) => (
              <li key={link.href}>
                <a
                  className="text-muted-foreground hover:text-foreground transition duration-150"
                  href={link.href}
                  rel="noopener"
                  target="_blank"
                >
                  {link.rotulo}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  )
}
