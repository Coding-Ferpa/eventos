# ADR-0013 · Ordem dos milestones: motor antes do editor, produção antes do conforto

- **Status:** aceita
- **Data:** 2026-09-20
- **Autores:** mantenedor e sessão de arquitetura

## Contexto
O esboço de execução do mantenedor previa: M5 modelos por formulário com prévia ao vivo, M6 motor de PDF, M7 CSV, M8 busca, M9 arrastar, M10 fase 2, M11 fase 3, M12 produção. Duas forças pedem ajuste. Primeira: a prévia ao vivo do editor **é** o motor (`layout()` mais o desenhista SVG, [ADR-0003](0003-layout-puro-e-dois-desenhistas.md)); construir o editor antes obrigaria a escrever uma prévia descartável. Segunda: o único prazo duro do projeto é a data prometida dos certificados do Ferpa Tech Day, e ele não espera e-mail em massa, dashboard nem LinkedIn.

## Decisão
| Milestone | Conteúdo |
|---|---|
| M0 a M4 | como no esboço |
| **M5** | **motor de certificado** (puro, TDD, testado contra modelos em JSON) |
| **M6** | modelos, parte 1: arte, campos de conteúdo, layout por formulário, prévia ao vivo usando o motor |
| M7 | importação de CSV |
| M8 | busca, retirada e validação |
| **M9** | **produção** |
| M10 | modelos, parte 2: arrastar |
| M11 | fase 2 do PRD |
| M12 | fase 3 do PRD |

Preservada a exigência do mantenedor: **motor e CSV antes da busca**, porque são o risco técnico real, e **arrastar depois da busca**, porque é conforto. O M5 só fecha com um PDF gerado em uma Preview da Vercel, para que problema de empacotamento de fontes apareça cedo.

## Consequências
- Positivas: nenhum código descartável; o risco maior é atacado mais cedo e sem UI no caminho; a fase 1 vai ao ar assim que fica pronta; M10 a M12 são entregues por PR em um sistema que já está em uso real, com feedback real.
- Negativas e trade-offs aceitos: o M5 não tem tela para mostrar ao mantenedor além da rota de desenvolvimento; evolução de schema depois do M9 acontece com dados reais, e por isso as migrations da fase 2 são só aditivas (tabelas novas `0014` e `0015`).

## Alternativas consideradas
- **Seguir o esboço à risca:** prévia descartável no M5 e produção só depois da fase 3.
- **Produção já no M0, com deploy contínuo:** sem banco de staging (o plano gratuito comporta 2 projetos), expor a fase 1 incompleta em produção não traz benefício; Previews da Vercel cobrem a revisão de UI.
