# ADR-0002 · `@cantoo/pdf-lib` como motor de PDF

- **Status:** aceita
- **Data:** 2026-09-20
- **Autores:** mantenedor e sessão de arquitetura

## Contexto
O certificado é texto e um QR desenhados **sobre uma arte que já existe** (PDF ou imagem), gerado sob demanda no endpoint que recebe o pico do dia do evento. O PRD cita `pdf-lib` com `@pdf-lib/fontkit`. Verificado no npm em 20/09/2026: `pdf-lib` teve o último publish em 06/11/2021 e `@pdf-lib/fontkit` está parado desde 2022. O fork `@cantoo/pdf-lib` está na 2.11.1 (15/09/2026), mantém a API original, é **MIT** como o original e como este projeto, e recomenda `@cantoo/fontkit` 2.0.x (MIT, 11/09/2026).

## Decisão
Usar `@cantoo/pdf-lib` com `@cantoo/fontkit`. O motor usa apenas a API comum ao original (`PDFDocument.load`, `embedPage`, `embedPng`, `embedJpg`, `embedFont`, `registerFontkit`, `drawText`, `drawSvgPath`, `save`), de modo que voltar ao original ou trocar de fork seja troca de import. `StandardFonts` é proibido por regra de lint.

## Consequências
- Positivas: JavaScript puro, sem binário nativo, cold start baixo; isomórfico (o mesmo motor roda no navegador do admin para a prévia do editor); subset de fonte; biblioteca com manutenção ativa; licença compatível.
- Negativas e trade-offs aceitos: dependemos de um fork mantido por uma empresa pequena; o subset de fontes da família pdf-lib tem histórico de defeito com algumas fontes OTF/CFF, mitigado pelo teste de ida e volta por fonte ([doc 05](../05-motor-de-certificados.md)). O fork traz dependências que não usamos (`culori`, parser de HTML): aceito, não entram no bundle público.

## Alternativas consideradas
- **`pdf-lib` original:** sem manutenção há quase cinco anos em um projeto que vai viver anos.
- **Puppeteer ou Chromium (HTML para PDF):** binário de 50 MB ou mais, cold start de segundos e consumo alto de memória justamente no endpoint do pico.
- **`@react-pdf/renderer`, `pdfkit`, `pdfme`:** geram documentos do zero ou com modelo próprio; não compõem sobre um PDF vetorial existente preservando-o.
- **Serviço externo de PDF:** custo, latência e dado pessoal saindo da infraestrutura.
