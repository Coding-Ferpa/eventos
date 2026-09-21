# ADR-0003 · Layout puro e dois desenhistas sobre o mesmo plano

- **Status:** aceita
- **Data:** 2026-09-20
- **Autores:** mantenedor e sessão de arquitetura

## Contexto
O sistema precisa de três saídas coerentes entre si: o PDF baixado, a prévia que o aluno vê no celular antes de baixar e a prévia ao vivo do editor do admin (com critério de aceite de equivalência de 1% em relação ao PDF). A solução ingênua é gerar o PDF e rasterizá-lo em todo lugar, o que põe pdf.js no celular do aluno em rede móvel ou um rasterizador no servidor.

## Decisão
O motor tem duas etapas. `layout(snapshot, contexto, fontes)` é uma função pura que devolve um **plano de renderização** serializável: para cada campo, tamanho final da fonte, linhas e posição da linha de base em pt a partir do topo. Dois desenhistas sem lógica consomem o plano: `draw/pdf.ts` (texto real com fonte embutida) e `draw/svg.ts` (glifos como `<path>` a partir dos contornos do fontkit, sobre um WebP leve da arte). Toda a lógica difícil (encolher, quebrar, alinhar, converter eixo) mora no layout.

A equivalência entre prévia e PDF é garantida por construção e verificada **sem rasterizador**: snapshot numérico do plano; posições do texto extraídas do PDF pelo pdf.js comparadas ao plano; transforms do SVG comparados ao plano.

## Consequências
- Positivas: o celular do aluno recebe um SVG de poucos KB; nenhum Chromium, `node-canvas` ou `sharp` no runtime nem no CI; a lógica mais arriscada do projeto é testável com asserções sobre números, sem abrir PDF; o editor tem prévia instantânea rodando o mesmo código no navegador; nenhuma fonte é servida ao público (sem questão de licença de webfont para fonte enviada pelo admin); formulário e arrastar escrevem a mesma estrutura, e o motor não sabe a diferença.
- Negativas e trade-offs aceitos: são dois desenhistas para manter; o SVG de contornos não é legível por leitor de tela, então a tela repete nome, tipo, carga horária e código em HTML.

## Alternativas consideradas
- **Prévia = PDF real renderizado por pdf.js:** equivalência trivial, mas cerca de 350 KB de JavaScript mais o PDF inteiro no celular antes de a pessoa ver o próprio nome.
- **Rasterizar no servidor:** binário nativo no runtime e CPU por visualização no pico.
- **Prévia em HTML e CSS com webfont:** medida de texto, kerning e ligaduras do navegador divergem do PDF; o "cabe na caixa" da prévia não garantiria o do PDF.
- **Teste visual com comparação de pixels no CI:** exigiria instalar no CI o rasterizador que foi rejeitado no runtime, para provar o que os números já provam.
