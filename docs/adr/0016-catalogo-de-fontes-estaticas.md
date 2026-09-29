# ADR-0016 · Catálogo com as quatro famílias que entregam estático

- **Status:** aceita
- **Data:** 2026-09-28
- **Autores:** @eduardovpessoa (decisão), Claude (medição)

## Contexto

O doc 05 listava cinco famílias curadas (Poppins, Inter, Montserrat, Lora, Playfair Display), nos pesos 400, 600 e 700. O M5 entregou só a Poppins: no `google/fonts` as outras quatro existem apenas como variáveis, e o pdf-lib embute a variável sem instanciar o eixo de peso, então tudo sairia 400, sem erro. O M5 também deixou uma lacuna: a reserva de glifo era a Poppins, que não cobre vietnamita, grego nem cirílico.

## Decisão

O catálogo fica com as quatro famílias cuja distribuição do próprio projeto entrega TTF estático por peso, e a Inter é a família de reserva:

| Família | Origem dos estáticos | Versão |
|---|---|---|
| Poppins | `google/fonts`, `ofl/poppins` | 4.004 |
| Inter | `rsms/inter`, release v4.1, `extras/ttf/` | 4.001 |
| Montserrat | `JulietaUla/Montserrat`, `fonts/ttf` | 9.000 |
| Lora | `cyrealtype/Lora-Cyrillic`, `fonts/ttf` | 3.021 |

Medido em 2026-09-28, com os arquivos baixados:

- As doze são estáticas (sem `fvar`), com o `usWeightClass` igual ao peso do catálogo, cobrem os caracteres do português e voltam íntegras da ida e volta do subset pelo pdf.js; o subset de um nome no PDF fica entre 6 e 7 KB.
- Nomes fora do Latin-1 (vietnamita, grego, cirílico, turco, polonês): a Inter cobre os cinco; Montserrat e Lora cobrem todos menos o grego; a Poppins, turco e polonês. Por isso a reserva é a Inter.
- As quatro têm tabela GPOS, e Inter, Montserrat e Lora têm kerning latino: na Inter Regular, "AVATAR Wagon To Yves" a 1000 pt mede 11.839,8 pela soma de avanços e 11.384,8 pelas posições com kerning. É o que o PDF-11 precisava para distinguir as duas contas; o teste agora roda em uma fonte de cada família e cai se a medida trocar de conta.

O Playfair Display sai do catálogo. O projeto só distribui a variável; o zip da release 2.203 é o Playfair 2, um desenho diferente. Reabre se a arte real da comunidade usar aquele desenho.

## Consequências

- Positivas: nenhum passo de build nem ferramenta nova; a lacuna de nome fora do Latin-1 do M5 fecha para vietnamita, grego e cirílico; o PDF-11 passa a ter dentes; a serifada do catálogo é a Lora.
- Negativas e trade-offs aceitos: `public/fonts/cert/` passa de 470 KB a 3,7 MB, que vão no pacote de cada função que gera PDF (bem abaixo do limite de 250 MB) e que o editor baixa só quando o admin escolhe a fonte. Uma display serifada de alto contraste fica de fora até alguém pedir. A Lora declara o nome reservado "Lora": os arquivos vão sem modificação, e o subset dentro do PDF é embutimento em documento (THIRD_PARTY_NOTICES).

## Alternativas consideradas

- **Instanciar as variáveis num passo de build com fonttools:** traria Python e uma ferramenta nova ao build e ao CI, e um ADR próprio, para manter uma display serifada que talvez nunca seja usada. Rejeitada pelo mantenedor.
- **Baixar o zip do Playfair 2 para ver se traz estáticos:** não responde à pergunta, porque é outro desenho.
- **Manter a Poppins como reserva e aceitar a lacuna:** um nome em vietnamita ou grego sairia com quadrados no certificado de alguém. A Inter resolve sem custo extra, já que entra no catálogo de qualquer forma.
