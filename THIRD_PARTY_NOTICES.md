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

| Família | Arquivos                                                                            | Versão | Copyright                                                                         | Licença                                 | Origem                                                                               |
| ------- | ----------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------ |
| Poppins | `Poppins-Regular.ttf` (400), `Poppins-SemiBold.ttf` (600), `Poppins-Bold.ttf` (700) | 4.004  | Copyright 2020 The Poppins Project Authors (https://github.com/itfoundry/Poppins) | SIL OFL 1.1, `LICENSES/OFL-Poppins.txt` | [google/fonts, `ofl/poppins`](https://github.com/google/fonts/tree/main/ofl/poppins) |

As outras quatro famílias do catálogo do doc 05 (Inter, Montserrat, Lora e
Playfair Display) hoje só são distribuídas pelo Google Fonts como fonte
variável, que o motor não aceita. Entram no M6, com ADR próprio sobre como
obter os estáticos.

`pnpm check:fonts` recusa TTF com tabela `fvar` (fonte variável), arquivo sem
licença em `LICENSES/` e arquivo fora desta tabela.

## Código

Nenhum código de terceiro é vendorizado neste repositório. As dependências são
instaladas pelo pnpm e mantêm as licenças dos próprios pacotes; a lista de
dependências novas, com licença e motivo de escolha, está no
[doc 01](docs/01-stack.md).
