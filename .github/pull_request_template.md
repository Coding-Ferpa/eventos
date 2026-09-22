## O que muda

<!-- Uma frase. O título do PR já diz o assunto; aqui vai o conteúdo. -->

## Por quê

<!-- O motivo, não a descrição do diff. Se houver ADR, cite. -->

## Como testar

<!-- Os passos que você rodou. Comandos, rota, dado do seed. -->

## Screenshots

<!-- Quando a mudança é visual. Use o seed local: nada de participante real. -->

## Checklist

- [ ] `pnpm lint`, `pnpm typecheck` e `pnpm test` passam, e os testes cobrem a mudança
- [ ] Tabela nova nasce com RLS, `grant` e pgTAP na mesma migration
- [ ] Toda entrada externa passa por Zod
- [ ] Toda mutação grava `audit_logs` pelo esqueleto padrão de Server Action
- [ ] `docs/`, `.env.example` e ADR atualizados quando a mudança pede
- [ ] Sem dado pessoal real e sem segredo no diff, nas fixtures e nos screenshots
