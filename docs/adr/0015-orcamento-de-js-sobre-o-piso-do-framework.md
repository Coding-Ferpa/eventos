# ADR-0015 · LCP, CLS e TBT como gate; os KB de JavaScript como tripwire sobre o piso do framework

- **Status:** aceita
- **Data:** 2026-09-25
- **Autores:** sessão de execução do M3, com os critérios do mantenedor

## Contexto
O [doc 09](../09-frontend-e-seo.md) fixou o JavaScript de rota em até 110 KB comprimidos para `/` e para a página do evento, e em até 95 KB para `/validar`, com LCP abaixo de 2,0 s em `/validar`. Os números foram escritos antes de existir página para medir. Todas as medidas daqui são do Lighthouse mobile (4G lento, CPU 4x mais lenta, throttling simulado), com build de produção e fontes pré-carregadas como no build em Linux do CI, e 1 KB = 1.024 bytes.

**Só o framework já passa dos 110 KB.** O `react-dom`, o runtime do App Router, o runtime do webpack e o `main-app` somam 130,6 KB (133.713 bytes), carregados em toda página do App Router antes de qualquer linha nossa. A stack é fixa ([ADR-0001](0001-heranca-do-cf-jobs.md)).

**Primeiro, as alavancas que são nossas**, nesta ordem, pedida pelo mantenedor:

1. **Prefetch dos cards só com intenção.** O prefetch padrão baixava a rota de cada card que entrava na tela. O card passou a usar o padrão da documentação do Next para listas de links: prefetch só com o ponteiro em cima ou com foco do teclado. Os links de navegação seguem com o prefetch normal. Em `/`, os prefetches de rota caíram de 8 para 6 (sobram só os da navegação), os bytes deles caíram de 17,0 para 11,1 KB, e o JavaScript caiu 0,8 KB. Na página do evento e em `/validar`, que não têm lista de links, nada mudou. As rotas de evento são leves, cerca de 1,2 KB por card: o ganho cresce com o catálogo, mas não mexe no LCP.
2. **Achado ao dissecar os chunks: o `tailwind-merge` no navegador.** O campo do código de `/validar` usava `cn()` só para juntar duas classes, e isso trazia 9,2 KB de `tailwind-merge` para `/validar` e, pelo prefetch, também para `/`. Agora a junção é simples.
3. **A JetBrains Mono de `/validar` só no peso 400**, que é o único que o campo usa. O arquivo variável de 31 KB virou um estático de 21 KB.

| Página | JS antes | JS depois | Total transferido antes → depois | LCP (5 execuções) | TBT | CLS |
|---|---|---|---|---|---|---|
| `/` | 162,4 KB | 152,4 KB | 296 → 270 KB | 2,40 a 2,49 s | 10 ms | 0 |
| `/eventos/[slug]` | 151,1 KB | 151,4 KB | 214 → 214 KB | 2,32 a 2,48 s | 18 ms | 0 |
| `/validar` | 161,2 KB | 152,4 KB | 247 → 228 KB | 2,48 a 2,49 s | 23 ms | 0 |

Desempenho 0,98, acessibilidade 1, boas práticas 0,96 e SEO 1 nas três. O LCP não se moveu com nenhuma das três alavancas, nem com a retirada da fonte mono da página. (Carregar a capa do primeiro card sem `lazy` também parecia não mover, numa amostra única; o M4 refez o teste e mostrou o contrário, na seção de consequências.) No modelo simulado, o LCP carrega o download de tudo o que começou antes dele, e o grosso disso é o piso do framework. Em `/validar` o elemento do LCP é um parágrafo renderizado no servidor, que o aparelho pinta junto com o FCP, em 0,9 s.

## Decisão
**LCP, CLS e TBT são a asserção principal do gate de performance, e o total de KB de JavaScript é um tripwire de regressão, calculado como piso do framework, mais o nosso código medido, mais uma folga de feature.**

Asserção principal, o que o aluno sente:

| Métrica | `/` | `/eventos/[slug]` | `/validar` |
|---|---|---|---|
| LCP | < 2,5 s | < 2,5 s | < 2,5 s |
| CLS | < 0,05 | < 0,05 | < 0,05 |
| TBT | < 200 ms | < 200 ms | < 150 ms |

O LCP de `/validar` passa de 2,0 para 2,5 s, o limite "bom" das Core Web Vitals, porque o piso o prende em 2,48 s. As notas de categoria continuam as do doc 09.

Tripwire, cada linha com nome:

| Linha | `/` | `/eventos/[slug]` | `/validar` |
|---|---|---|---|
| Piso do framework | 130,6 KB | 130,6 KB | 130,6 KB |
| Nosso código, medido no M3 | 21,8 KB | 20,9 KB | 21,8 KB |
| Folga de feature | 5 KB | 5 KB | 5 KB |
| **Tripwire** | **157,4 KB** (161.190 B) | **156,4 KB** (160.190 B) | **157,4 KB** (161.190 B) |

A **folga de feature** é de 5 KB porque um commit de feature normal acrescenta 1 a 3 KB de componente cliente, e a menor biblioteca que já pegamos, o `tailwind-merge`, tem 9 KB. O `react-hook-form` tem uns 9 KB, e o Zod, mais de 13. Nenhuma biblioteca nova passa sem disparar.

Quando o tripwire dispara, o PR mostra a medição, diz o porquê e acrescenta aqui uma linha nova com nome. **Nada é pré-alocado:** o formulário de busca do M8 entra na página do evento, que por isso fica apertada agora, e o M8 acrescenta a linha dele com a medição na mão.

**Calibração no CI.** Os números foram medidos numa máquina de desenvolvimento. O throttling simulado escala o tempo de CPU observado, e o runner do GitHub é mais lento. Se a primeira execução no CI divergir, o ADR registra os números do runner, pela mesma regra: a medição é a resposta.

## Consequências
- Positivas: o gate vigia o que o aluno sente, e o tripwire pega qualquer biblioteca nova sem pré-alocar folga para ninguém. O plano de dados do aluno ficou 26 KB mais leve por visita à `/`, e 19 KB mais leve em `/validar`.
- Negativas: o LCP das três páginas está a menos de 0,1 s do limite no modelo simulado, então ele deve ser o primeiro a disparar, antes do tripwire. Quando isso acontecer, o trabalho é tirar bytes do caminho do LCP, e não afrouxar o limite. O piso sobe junto com o React e o Next.
- **Primeiro disparo, no M4.** O LCP de `/` passou a 2,56 s, sem mudança no JavaScript público. No celular, o elemento do LCP é a capa do primeiro card, que carregava `lazy`. Num A/B na mesma sessão, com 5 execuções de cada variante, o `lazy` deu mediana de 2,47 s (2,47 a 2,65 s) e 2,56 s (2,47 a 2,63 s). Com `priority` só no primeiro card, a mediana foi a 2,40 s, com todas as execuções abaixo de 2,5 s (2,40 a 2,49 s). O primeiro card passou a ter `priority`, e os demais seguem `lazy`. O mesmo A/B mostrou que o ruído entre sessões mexe a mediana em até 90 ms, então o Lighthouse passou de 3 para 5 execuções.
- Rever quando o piso do framework cair (numa major do React ou do Next) e apertar a linha do piso no mesmo PR.

## Alternativas consideradas
- **Manter 110 KB e tirar as páginas públicas do App Router:** fere o ADR-0001 e põe dois roteadores no mesmo projeto.
- **O medido mais uma folga proporcional, em torno de 13%** (a proposta anterior deste ADR, com 180, 200 e 175 KB): recusada pelo mantenedor. Pré-alocava 50 KB para o M8, e orçamento com folga antecipada não pega nada.
- **Medir só o JavaScript nosso, excluindo o framework por nome de chunk:** os nomes são hashes, e isso esconderia o crescimento do framework numa atualização. A linha nomeada do piso resolve o mesmo problema sem fragilidade.
- **Cache Components ou partial prefetching,** que reduziriam o prefetch: recusados pelo mantenedor por ora, porque é mudança grande perto da data do evento.
- **Desligar o prefetch dos links de navegação:** eles são o caminho que importa (WhatsApp, evento, retirada), e continuam com o prefetch normal.
