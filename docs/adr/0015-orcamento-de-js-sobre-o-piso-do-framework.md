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
| Piso do framework | 132,6 KB (135.796 B) | 132,6 KB | 132,6 KB |
| Nosso código, medido no M3 | 21,8 KB | 20,9 KB | 21,8 KB |
| Busca do certificado, medida no M8 | | 5,3 KB (5.401 B) | |
| Folga de feature | 5 KB | 5 KB | 5 KB |
| **Tripwire** | **159,4 KB** (163.273 B) | **163,7 KB** (167.674 B) | **159,4 KB** (163.273 B) |

A **folga de feature** é de 5 KB porque um commit de feature normal acrescenta 1 a 3 KB de componente cliente, e a menor biblioteca que já pegamos, o `tailwind-merge`, tem 9 KB. O `react-hook-form` tem uns 9 KB, e o Zod, mais de 13. Nenhuma biblioteca nova passa sem disparar.

Quando o tripwire dispara, o PR mostra a medição, diz o porquê e acrescenta aqui uma linha nova com nome. **Nada é pré-alocado:** o formulário de busca do M8 entra na página do evento, que por isso fica apertada agora, e o M8 acrescenta a linha dele com a medição na mão.

**Calibração no CI.** Os números foram medidos numa máquina de desenvolvimento. O throttling simulado escala o tempo de CPU observado, e o runner do GitHub é mais lento. Se a primeira execução no CI divergir, o ADR registra os números do runner, pela mesma regra: a medição é a resposta.

## Consequências
- Positivas: o gate vigia o que o aluno sente, e o tripwire pega qualquer biblioteca nova sem pré-alocar folga para ninguém. O plano de dados do aluno ficou 26 KB mais leve por visita à `/`, e 19 KB mais leve em `/validar`.
- Negativas: o LCP das três páginas está a menos de 0,1 s do limite no modelo simulado, então ele deve ser o primeiro a disparar, antes do tripwire. Quando isso acontecer, o trabalho é tirar bytes do caminho do LCP, e não afrouxar o limite. O piso sobe junto com o React e o Next.
- **Primeiro disparo, no M4.** O LCP de `/` passou a 2,56 s, sem mudança no JavaScript público. No celular, o elemento do LCP é a capa do primeiro card, que carregava `lazy`. Num A/B na mesma sessão, com 5 execuções de cada variante, o `lazy` deu mediana de 2,47 s (2,47 a 2,65 s) e 2,56 s (2,47 a 2,63 s). Com `priority` só no primeiro card, a mediana foi a 2,40 s, com todas as execuções abaixo de 2,5 s (2,40 a 2,49 s). O primeiro card passou a ter `priority`, e os demais seguem `lazy`. O mesmo A/B mostrou que o ruído entre sessões mexe a mediana em até 90 ms, então o Lighthouse passou de 3 para 5 execuções.
- **Segundo disparo, no M8, o previsto.** Com o formulário de busca, a página do evento passou a 160.471 B, 281 B acima do tripwire de 160.190 B; as outras duas ficaram em 156.410 B, abaixo dos 161.190 B delas. A linha nova é a diferença medida sobre o código do M3: 5.401 B, quase tudo o chunk da página do evento (6.326 B, contra o que `/validar` carrega), com o formulário, as máscaras, o dígito verificador do CPF, o aviso de navegador embutido e a marca de hidratação, que passou ao layout raiz (uns 350 B, os mesmos que `/` e `/validar` cresceram desde o M3). Nenhuma biblioteca nova. O que o aluno sente seguiu dentro: na página do evento, LCP de 2,32 a 2,55 s com mediana 2,48 s, TBT de 7,5 ms e CLS 0, desempenho 0,97 e acessibilidade 1 (5 execuções no build de produção, mesma máquina das medições do M3). A folga de 5 KB continua por cima, para a próxima feature.
- **O LCP chegou à beira, e não foi o M8.** Em três execuções seguidas do `lhci autorun` no mesmo build, a primeira passou inteira e as outras duas reprovaram o LCP de `/validar` (mediana 2,61 s), e uma delas também o de `/`, páginas cujo JavaScript o M8 não mudou. As execuções lentas têm as mesmas 27 requisições, os mesmos bytes e o mesmo elemento de LCP das rápidas; só o FCP e o LCP andam juntos, uns 150 e 300 ms, o que é CPU observada e multiplicada pelo throttling simulado. Num A/B na mesma sessão, alternando 7 execuções de cada, `/validar` deu a mesma distribuição no M7 e no M8: 2,31 a 2,33 s ou 2,61 a 2,64 s, mediana 2,325 s nos dois, com 95 B de diferença de JavaScript. É a consequência negativa de cima acontecendo: o job do Lighthouse no CI pode reprovar por ruído. Quando reprovar de forma consistente, o trabalho continua sendo tirar bytes do caminho do LCP.
- **O piso subiu na atualização para o Node 26 (2026-11-10).** Com o Next 16.4.6 e o React 19.3.1, as três páginas cresceram exatamente 2.083 B cada, sem uma linha nossa mudar: é o piso, e não o nosso código. A linha do piso subiu de 133.713 para 135.796 B, e os três tripwires subiram o mesmo, para a folga de feature continuar sendo 5 KB e não ser gasta em silêncio pelo framework. Medido com `lhci autorun`, 5 execuções no build de produção: `/` com 158.493 B, LCP de 2,27 a 2,50 s; a página do evento com 162.549 B, LCP de 2,33 a 2,36 s; `/validar` com 158.493 B, LCP de 0,90 a 0,91 s e TBT de 43 ms. Nesta medição, o LCP de `/validar` não oscilou entre dois patamares: ficou em 0,9 s. A causa não foi investigada; se voltar a oscilar, a consequência de cima continua valendo.
- **Terceiro disparo, no runner do CI (2026-11-11).** O job reprovou o LCP de `/` com mediana 2,58 s (2,57 a 2,60 s, e 2,88 s na primeira execução, com o otimizador de imagem frio). No celular, o elemento do LCP continua a capa do primeiro card, mas as capas dos outros quatro cards do seed (28 KB) começavam a baixar antes dele: o `lazy` do Chrome antecipa imagem a até 1.250 px da tela, e o modelo simulado cobra o download de tudo o que começou antes do LCP. Agora elas montam depois do `load` quando o catálogo tem uma coluna (`ForaDaPrimeiraTela`), e na hidratação com duas colunas ou mais, onde estão na primeira linha. A/B na mesma sessão, 7 execuções de cada, banco só com o seed e `.next` limpo: mediana de 2,51 s para 2,33 s, de 23 para 19 requisições e de 240 para 211 KB antes do LCP, com a dispersão das execuções quentes caindo para 2,32 a 2,40 s. O JavaScript de `/` cresceu 170 B (158.663 B, abaixo do tripwire). Três medições do mesmo dia que valem guardar:
  - O runner cai sempre no patamar lento que nesta máquina só aparece às vezes: aquele em que o favicon, o script do Vercel Analytics e o prefetch dos links do cabeçalho começam antes do LCP observado. São 1 KB cada, mas cada um soma uma ida e volta de 4G lento no modelo. Com as capas fora da disputa, eles saíram de antes do LCP em todas as execuções quentes.
  - Desde o Next 16.4, `priority` gera o preload mas não põe mais `fetchpriority="high"`, e a imagem pré-carregada entra com prioridade baixa. Pôr o `fetchPriority` à mão não moveu o LCP no modelo simulado (2,476 contra 2,472 s, mesma sessão), por isso não entrou.
  - O LCP de `/validar` segue oscilando entre 0,9 e 2,5 s em uma execução de cada sete, igual na `main` e com esta mudança: é a oscilação já registrada acima, e não esta mudança.
- Rever quando o piso do framework cair (numa major do React ou do Next) e apertar a linha do piso no mesmo PR.

## Alternativas consideradas
- **Manter 110 KB e tirar as páginas públicas do App Router:** fere o ADR-0001 e põe dois roteadores no mesmo projeto.
- **O medido mais uma folga proporcional, em torno de 13%** (a proposta anterior deste ADR, com 180, 200 e 175 KB): recusada pelo mantenedor. Pré-alocava 50 KB para o M8, e orçamento com folga antecipada não pega nada.
- **Medir só o JavaScript nosso, excluindo o framework por nome de chunk:** os nomes são hashes, e isso esconderia o crescimento do framework numa atualização. A linha nomeada do piso resolve o mesmo problema sem fragilidade.
- **Cache Components ou partial prefetching,** que reduziriam o prefetch: recusados pelo mantenedor por ora, porque é mudança grande perto da data do evento.
- **Desligar o prefetch dos links de navegação:** eles são o caminho que importa (WhatsApp, evento, retirada), e continuam com o prefetch normal.
