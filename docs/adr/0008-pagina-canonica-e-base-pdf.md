# ADR-0008 · Página canônica e `base.pdf` pré-processado

- **Status:** aceita
- **Data:** 2026-09-20
- **Autores:** mantenedor e sessão de arquitetura

## Contexto
A arte do certificado pode chegar como PDF vetorial, PNG ou JPG, em qualquer tamanho de página (A4 em pt, 1920×1080 do Canva, 300 dpi, 150 dpi). Três problemas decorrem disso: (1) tamanho de fonte em pt significa coisas diferentes em páginas de tamanhos diferentes, então trocar a arte desalinharia visualmente os campos mesmo com caixas normalizadas; (2) embutir um PNG grande no pdf-lib custa segundos de CPU, inaceitável por download no pico; (3) a resposta de uma Vercel Function é limitada a 4,5 MB.

## Decisão
Na publicação do modelo, uma única vez, `buildBasePdf` converte a arte em um **`base.pdf` de página canônica**: `k = 841,89 / max(largura, altura)`, página de `(largura·k, altura·k)` pt. PDF entra por `embedPage` (continua vetorial); PNG por `embedPng`; JPG por `embedJpg`. Limites: 1 ou 2 páginas, sem cifragem, sem `/Rotate`, **até 3 MB**. Nenhuma conversão de formato é feita: arte pesada demais é recusada com a instrução de reexportar como PDF ou JPG.

O caminho quente é sempre o mesmo, qualquer que tenha sido a arte: bytes do `base.pdf` em cache de módulo, `PDFDocument.load`, desenhar texto e QR, salvar. O fundo da prévia (WebP de 1.600 px) é rasterizado no navegador do admin, no upload.

## Consequências
- Positivas: "32 pt" significa o mesmo em qualquer arte; trocar 150 dpi por 300 dpi produz planos de layout idênticos (teste PDF-06); o custo do PNG é pago uma vez; o PDF final cabe em 4,5 MB por construção; JavaScript, formulários e metadados do PDF original não chegam ao certificado; o motor tem um caminho só.
- Negativas e trade-offs aceitos: arte com proporção diferente de A4 gera página de proporção diferente (correto, mas o admin precisa saber); PNG fotográfico em 300 dpi pode estourar os 3 MB e exigir reexportação; o servidor confia na prévia gerada pelo navegador do admin (é cosmética e o admin é autenticado).

## Alternativas consideradas
- **Tamanho de fonte normalizado (fração da altura da página):** resolve o problema 1, mas designer pensa em pt, e não resolve 2 nem 3.
- **Embutir a arte original a cada download:** PNG grande custa segundos por requisição.
- **Converter PNG em JPEG no servidor (`sharp`) ou no navegador (canvas):** binário nativo no runtime, ou recompressão silenciosa de arte com texto fino. O erro com instrução clara é mais honesto.
- **Servir o PDF por URL assinada do Storage para escapar dos 4,5 MB:** é o caminho do cache P2; desnecessário com o orçamento de 3 MB.
