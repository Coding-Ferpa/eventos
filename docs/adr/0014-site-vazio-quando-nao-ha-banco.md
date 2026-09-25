# ADR-0014 · Fora da produção, sem banco o site renderiza vazio

- **Status:** aceita
- **Data:** 2026-09-25
- **Autores:** mantenedor e sessão de execução do M3

## Contexto
O [doc 02](../02-arquitetura.md) decide que a Preview da Vercel sobe sem banco: o plano gratuito do Supabase comporta dois projetos, e eles já são o CF Jobs e o CF Eventos. Desde o M2 o job de qualidade do CI faz esse build sem banco a cada PR. A partir do M3, `/`, `/eventos/[slug]` e o sitemap são ISR e leem o banco no build ([doc 09](../09-frontend-e-seo.md)), então o gate do M2 bloquearia o próprio M3. A saída que tornaria a Preview útil, apontá-la para o Supabase de produção com a chave anon, foi descartada pelo mantenedor: poria dado de participante real numa URL de Preview sem proteção, e isso é problema de LGPD.

## Decisão
**Fora da produção, a falta de `DATABASE_URL` é um modo, e não um erro: as leituras públicas voltam vazias e o site renderiza o que renderizaria sem nenhum evento.** Um predicado só decide: `semBanco()`, em `src/lib/ambiente.ts`, verdadeiro quando `DATABASE_URL` falta **e** `VERCEL_ENV` não é `production`.

Nesse modo, antes de abrir qualquer conexão e antes de consultar o cache de dados do Next (o `.next/cache` sobrevive entre builds, na máquina e no cache de build da Vercel, e um build sem banco não pode servir o que um build com banco guardou; foi assim que o M3 flagrou o catálogo de um build anterior aparecendo num build sem banco):
- as consultas públicas de `src/db/queries` devolvem lista vazia ou `null`: `/` mostra o estado vazio do [doc 03](../03-design-system.md), `/eventos/[slug]` responde 404, `generateStaticParams` devolve `[]`, e o sitemap lista só as páginas fixas;
- o beacon de visita responde 204 sem gravar;
- o proxy não emite o cookie de dispositivo, porque sem banco não há busca nem rate limit para ele servir. Por isso `DEVICE_COOKIE_SECRET` também não é exigido nesse modo.

O que não muda:
- **Em produção, faltar o banco continua sendo erro.** `semBanco()` é falso, a primeira consulta chama `serverEnv()`, e o build para dizendo qual variável falta. Um build de produção nunca publica o site vazio por engano.
- **Falha de banco configurado nunca vira lista vazia.** Conexão recusada, timeout ou erro de SQL propagam. No build, derrubam o build. Numa revalidação do ISR, o Next continua servindo a última página boa.
- O ISR do doc 09 fica como está: tags `events` e `event:{slug}`, 1 h.

Como o ISR se comporta, dito com precisão porque a intuição engana: na Vercel, as variáveis são por ambiente e valem igual no build e no runtime. A produção constrói com banco e já pré-renderiza com os eventos. A Preview nunca tem banco e mostra sempre a casca. Não existe ambiente que construa sem banco e sirva com banco. Se um dia existir, a página vazia do build **não** é trocada no primeiro acesso: fica em cache até vencer a 1 h ou até um `updateTag('events')`.

## Consequências
- Positivas: o gate do build sem banco continua de pé e protege todo milestone daqui em diante. O ISR do doc 09 fica intacto. O estado vazio do catálogo deixa de ser decorativo: é o que a Preview mostra, revisado a cada PR.
- Negativas e trade-offs aceitos: **de M3 em diante a Preview mostra um site vazio.** Ela serve para revisar a casca (layout, tema, cabeçalhos, `/privacidade`, `/validar`, a rota de exemplo de certificado do M5), e não o conteúdo, que se revisa local e no CI. O admin também não funciona na Preview, porque não há Supabase. Por isso o DoD do M9, alguém da organização que não é dev cadastrar um evento e importar uma planilha sozinho, **só pode ser ensaiado em produção**. É mais um predicado que toda leitura pública precisa respeitar, e o build sem banco do CI falha se alguma esquecer.
- A guarda de produção depende de `VERCEL_ENV`, que a Vercel expõe no build e no runtime quando a opção "Automatically expose System Environment Variables" está ligada (o padrão). O runbook do M9 confere isso.

## Alternativas consideradas
- **Preview apontando para o Supabase de produção com a chave anon:** rejeitada pelo mantenedor. É um problema de LGPD.
- **Segundo projeto Supabase só para Previews:** o plano gratuito não comporta ([doc 02](../02-arquitetura.md)).
- **Páginas públicas dinâmicas, com cache só dos dados:** o build passaria sem banco, mas perderíamos o ISR do doc 09, e cada visita pagaria renderização justo no pico do evento.
- **Tolerar qualquer falha de banco, devolvendo vazio:** um soluço do pooler durante o build publicaria um catálogo vazio em produção. A tolerância vale só para "não configurado", e nunca em produção.
