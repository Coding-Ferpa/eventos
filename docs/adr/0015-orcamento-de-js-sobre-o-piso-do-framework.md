# ADR-0015 · Orçamento de JavaScript e de LCP medidos sobre o piso do framework

- **Status:** proposta, aguardando o mantenedor
- **Data:** 2026-09-25
- **Autores:** sessão de execução do M3

## Contexto
O [doc 09](../09-frontend-e-seo.md) fixou o JavaScript de rota em até 110 KB comprimidos para `/` e para a página do evento, e em até 95 KB para `/validar`, com LCP abaixo de 2,0 s em `/validar`. Os números foram escritos antes de existir página para medir. No M3, o Lighthouse mobile (4G lento, CPU 4x mais lenta, 3 execuções, mediana, build de produção) mediu:

| Página | JS total | Desempenho | LCP | FCP | TBT | CLS |
|---|---|---|---|---|---|---|
| `/` | 162 KB | 0,98 | 2,40 s | 0,91 s | 11 ms | 0 |
| `/eventos/ferpa-tech-day-2026` | 151 KB | 0,98 | 2,32 s | 0,91 s | 12 ms | 0 |
| `/validar` | 161 KB | 0,98 | 2,47 s | 0,90 s | 7 ms | 0 |

Acessibilidade 1, boas práticas 0,96 e SEO 1 nas três. Todo o resto do orçamento cabe com folga.

**Só o framework já passa dos 110 KB.** O `react-dom` (64 KB), o runtime do App Router (66 KB), o runtime do webpack (2,4 KB) e o `main-app` (1,1 KB) somam 134 KB comprimidos, antes de qualquer linha nossa. O nosso código acrescenta cerca de 20 KB, e o prefetch dos links visíveis traz os chunks das rotas vizinhas. A stack é fixa ([ADR-0001](0001-heranca-do-cf-jobs.md)), então o número do doc 09 é inalcançável como está escrito. O CF Jobs, com a mesma stack, usa 250 KB.

O LCP tem a mesma raiz. Em `/validar` o elemento do LCP é um parágrafo renderizado no servidor, pintado junto com o FCP numa rede de verdade. No modelo simulado do Lighthouse, a pintura fica dependente do download e da execução do JavaScript do framework, e o LCP cai no mesmo patamar das outras páginas. Dois experimentos, desfeitos depois, não o moveram: tirar a fonte mono da página e carregar a capa do primeiro card sem `lazy`.

## Decisão (proposta)
**O orçamento de JavaScript passa a ser o total da rota, com o piso do framework declarado, e o LCP de `/validar` fica igual ao das demais.**

| Métrica | `/` | `/eventos/[slug]` | `/validar` |
|---|---|---|---|
| JavaScript da rota (comprimido) | ≤ 180 KB | ≤ 200 KB | ≤ 175 KB |
| LCP | < 2,5 s | < 2,5 s | < 2,5 s |

Desempenho, acessibilidade, boas práticas, SEO, CLS e TBT ficam como no doc 09. A página do evento tem mais folga porque o formulário de busca do M8 entra nela. Os números são o medido mais uma folga de cerca de 15 KB, e não um alvo: servem para pegar crescimento, e o PR que os ultrapassar diz o porquê.

## Consequências
- Positivas: o gate do Lighthouse volta a ser um sinal, e não um vermelho permanente. Um salto de dezenas de KB, que é o que uma biblioteca pesada no bundle público causaria, reprova. A proteção específica contra pdf.js, fontkit e pdf-lib continua sendo o teste de bundle público do M5.
- Negativas: o orçamento deixa de prometer uma página leve em termos absolutos. Ele vigia o crescimento sobre um piso que não controlamos, e esse piso sobe junto com o React e o Next.
- Rever quando o piso do framework cair, por exemplo numa major do React ou do Next, e apertar os números no mesmo PR.

## Alternativas consideradas
- **Manter 110 KB e tirar as páginas públicas do App Router:** fere o ADR-0001 e põe dois roteadores no mesmo projeto.
- **Medir só o JavaScript nosso, excluindo os chunks do framework:** os nomes dos chunks são hashes, e separar o que é framework dependeria do conteúdo. Seria frágil, e ainda esconderia o crescimento do framework numa atualização.
- **Desligar o prefetch dos links na área pública:** economiza uns 5 KB e deixa mais lenta a navegação do WhatsApp para o evento e dele para a retirada, que é o caminho que importa.
- **Throttling aplicado pelo DevTools em vez do simulado:** números mais próximos do real, mas com ruído demais para um gate de CI.
