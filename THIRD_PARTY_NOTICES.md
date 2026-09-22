# Avisos de terceiros

Este arquivo lista o que o repositório **redistribui**, e não a árvore de
dependências, que vive no `pnpm-lock.yaml`.

## Fontes do certificado

As fontes usadas pelo motor de certificado são versionadas em
`public/fonts/cert/` como TTF estáticos, porque precisam ser embutidas no PDF
gerado (doc 05). Todas são SIL Open Font License 1.1, que permite
redistribuição e embutimento desde que o texto da licença acompanhe os
arquivos: cada família tem o seu em `public/fonts/cert/LICENSES/`.

O PDF gerado não herda a OFL: embutir fonte em documento é uso permitido, e o
documento não é uma obra derivada da fonte.

| Família                                                    | Arquivos | Versão | Copyright | Licença | Origem |
| ---------------------------------------------------------- | -------- | ------ | --------- | ------- | ------ |
| _as fontes entram no M5, junto com o motor de certificado_ |          |        |           |         |        |

`pnpm check:fonts` recusa TTF com tabela `fvar` (fonte variável), arquivo sem
licença em `LICENSES/` e arquivo fora desta tabela.

## Código

Nenhum código de terceiro é vendorizado neste repositório. As dependências são
instaladas pelo pnpm e mantêm as licenças dos próprios pacotes; a lista de
dependências novas, com licença e motivo de escolha, está no
[doc 01](docs/01-stack.md).
