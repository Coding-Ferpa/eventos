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

| Família    | Arquivos                                                                                     | Versão              | Copyright                                                                                                             | Licença                                    | Origem                                                                                                     |
| ---------- | -------------------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Poppins    | `Poppins-Regular.ttf` (400), `Poppins-SemiBold.ttf` (600), `Poppins-Bold.ttf` (700)          | 4.004               | Copyright 2020 The Poppins Project Authors (https://github.com/itfoundry/Poppins)                                     | SIL OFL 1.1, `LICENSES/OFL-Poppins.txt`    | [google/fonts, `ofl/poppins`](https://github.com/google/fonts/tree/main/ofl/poppins)                       |
| Inter      | `Inter-Regular.ttf` (400), `Inter-SemiBold.ttf` (600), `Inter-Bold.ttf` (700)                | 4.001 (release 4.1) | Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter)                                              | SIL OFL 1.1, `LICENSES/OFL-Inter.txt`      | [rsms/inter, release v4.1](https://github.com/rsms/inter/releases/tag/v4.1), `extras/ttf/` do zip          |
| Montserrat | `Montserrat-Regular.ttf` (400), `Montserrat-SemiBold.ttf` (600), `Montserrat-Bold.ttf` (700) | 9.000               | Copyright 2011 The Montserrat Project Authors (https://github.com/JulietaUla/Montserrat)                              | SIL OFL 1.1, `LICENSES/OFL-Montserrat.txt` | [JulietaUla/Montserrat, `fonts/ttf`](https://github.com/JulietaUla/Montserrat/tree/master/fonts/ttf)       |
| Lora       | `Lora-Regular.ttf` (400), `Lora-SemiBold.ttf` (600), `Lora-Bold.ttf` (700)                   | 3.021               | Copyright 2011 The Lora Project Authors (https://github.com/cyrealtype/Lora-Cyrillic), with Reserved Font Name "Lora" | SIL OFL 1.1, `LICENSES/OFL-Lora.txt`       | [cyrealtype/Lora-Cyrillic, `fonts/ttf`](https://github.com/cyrealtype/Lora-Cyrillic/tree/master/fonts/ttf) |

O copyright da tabela é o que vai dentro de cada fonte (tabela `name`). O
`OFL.txt` do repositório da Montserrat traz outra linha ("Copyright 2024 The
Montserrat.Git Project Authors"); o arquivo em `LICENSES/` é o do projeto, como
ele o distribui. A Lora declara o nome reservado "Lora": versão modificada da
fonte, distribuída como fonte, não pode usar esse nome. Os arquivos aqui são os
originais, sem modificação; o subset que vai dentro do PDF é embutimento em
documento, o caso do parágrafo acima.

O Playfair Display, do catálogo original do doc 05, ficou fora (ADR-0016): só
existe como fonte variável, que o motor não aceita.

`pnpm check:fonts` recusa TTF com tabela `fvar` (fonte variável), arquivo sem
licença em `LICENSES/` e arquivo fora desta tabela.

## Código

Nenhum código de terceiro é vendorizado neste repositório. As dependências são
instaladas pelo pnpm e mantêm as licenças dos próprios pacotes; a lista de
dependências novas, com licença e motivo de escolha, está no
[doc 01](docs/01-stack.md).
