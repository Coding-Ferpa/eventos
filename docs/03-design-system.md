# 03 · Identidade visual e design system

O CF Eventos usa **exatamente** o design system do CF Jobs (`Coding-Ferpa/cf-jobs`, `docs/03-design-system.md`), derivado do `codingferpa.org`: tema escuro, acento violeta, Poppins e JetBrains Mono. Este documento copia os tokens, registra os contrastes medidos e especifica os componentes que só existem aqui.

## 1. Princípios

1. **Escuro é o padrão** (identidade da comunidade). O claro é alternável e recebe o mesmo rigor de contraste.
2. **Nenhuma cor fora dos tokens.** Única exceção: a cor do texto do certificado no editor (6d), que pertence à arte, não à UI.
3. **Glow violeta (`shadow-glow`) só em três lugares:** hover do card de evento, CTA de download do certificado e estado de sucesso.
4. **Celular primeiro no público, desktop no admin.** O aluno chega por link de WhatsApp, em rede móvel.
5. **Cor nunca é o único sinal.** Todo estado tem rótulo em texto e ícone.

## 2. Tokens

Bloco literal de `src/app/globals.css`:

```css
@import 'tailwindcss';

/* Tema por `data-theme`, nunca por `prefers-color-scheme`: sem isso todo
   `dark:` do shadcn/ui dispara pela preferência do sistema, o oposto do tema
   em uso. */
@custom-variant dark ([data-theme='dark'] &);

:root {
  color-scheme: dark;

  --background: #0d0d0d;
  --card: #161616;
  --surface: #1e1e1e;
  --border: #262626;
  --primary: #8b5cf6;
  --primary-solid: #7c3aed;   /* fundo de controle preenchido: 5,7:1 com texto branco */
  --primary-muted: #c4b5fd;
  --foreground: #f5f5f5;
  --muted-foreground: #a3a3a3;
  --subtle-foreground: #737373;
  --success: #22c55e;
  --warning: #eab308;
  --destructive: #ef4444;

  --container-max: 96rem;
  --header-height: 4.5rem;
}

[data-theme='light'] {
  color-scheme: light;

  --background: #fafafa;
  --card: #ffffff;
  --surface: #f4f4f5;
  --border: #e4e4e7;
  --primary: #7c3aed;
  --primary-solid: #7c3aed;
  --primary-muted: #a78bfa;
  --foreground: #18181b;
  --muted-foreground: #52525b;
  --subtle-foreground: #71717a;
  --success: #15803d;
  --warning: #a16207;
  --destructive: #dc2626;
}

@theme inline {
  --color-background: var(--background);
  --color-card: var(--card);
  --color-surface: var(--surface);
  --color-border: var(--border);
  --color-primary: var(--primary);
  --color-primary-solid: var(--primary-solid);
  --color-primary-muted: var(--primary-muted);
  --color-foreground: var(--foreground);
  --color-muted-foreground: var(--muted-foreground);
  --color-subtle-foreground: var(--subtle-foreground);
  --color-success: var(--success);
  --color-warning: var(--warning);
  --color-destructive: var(--destructive);

  --font-sans: var(--font-poppins), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-jetbrains-mono), ui-monospace, monospace;

  --text-display: 3rem;      --text-display--line-height: 1.1;
  --text-h2: 2.25rem;        --text-h2--line-height: 1.2;
  --text-h3: 1.5rem;         --text-h3--line-height: 1.3;
  --text-body: 1.125rem;     --text-body--line-height: 1.7;
  --text-caption: 0.875rem;  --text-caption--line-height: 1.5;

  --radius-sm: 0.5rem; --radius-md: 0.75rem; --radius-lg: 1rem; --radius-full: 9999px;
  --shadow-glow: 0 0 20px rgb(139 92 246 / 0.4);
}
```

O arquivo também traz, copiados do `globals.css` do CF Jobs sem alteração: os apelidos do shadcn/ui (`--card-foreground`, `--popover`, `--secondary`, `--muted`, `--accent`, `--input`, `--ring` e seus `--color-*`), que são ponteiros para os tokens acima e não introduzem cor, e o `@layer base` (fundo e fonte do `body`, `:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }` e o bloco `prefers-reduced-motion` que zera animações e transições).

### Contraste (WCAG 2.1, calculado pela luminância relativa)

Cada célula: razão sobre `background` / `card` / `surface`. AA exige 4,5:1 em texto normal e 3:1 em texto grande (24px, ou 19px bold) e em elementos gráficos.

| Texto | Escuro | Claro | Uso permitido |
|---|---|---|---|
| `foreground` | 17,83 / 16,60 / 15,29 | 16,97 / 17,72 / 16,12 | Qualquer |
| `muted-foreground` | 7,70 / 7,17 / 6,61 | 7,41 / 7,73 / 7,03 | Qualquer |
| `subtle-foreground` | 4,10 / 3,82 / 3,52 | 4,63 / 4,83 / 4,40 | Só texto grande e elementos gráficos |
| `primary` | 4,59 / 4,27 / 3,94 | 5,46 / 5,70 / 5,18 | Texto grande (logo), ícones, bordas, foco. Nunca texto normal sobre `card` ou `surface` |
| `primary-muted` | 10,53 / 9,80 / 9,03 | 2,61 / 2,72 / 2,48 | Só decorativo (borda de hover). Nunca texto |
| `success` | 8,53 / 7,94 / 7,32 | 4,81 / 5,02 / 4,56 | Texto sobre `background` e `card` |
| `warning` | 10,13 / 9,44 / 8,69 | 4,72 / 4,92 / 4,48 | Idem (reprova sobre `surface` no claro) |
| `destructive` | 5,16 / 4,81 / 4,43 | 4,63 / 4,83 / 4,39 | Idem (reprova sobre `surface` nos dois temas) |
| Branco sobre `primary-solid` | 5,70 | 5,70 | Botão primário, badge sólido |
| Branco sobre `primary` | 4,23, reprova | 5,70 | Proibido: é o motivo de `primary-solid` existir |
| Branco sobre `destructive` | 3,76, reprova | 4,83 | Proibido: botão destrutivo é sempre contorno |

Regras que saem da tabela:

- **Texto em cor semântica vive sobre `background` ou `card`, nunca sobre `surface`.**
- Link em texto corrido é `text-foreground underline decoration-primary`: nenhum violeta passa como texto normal nos dois temas ao mesmo tempo.
- A variante `default` do `Button` do shadcn/ui é reescrita para `bg-primary-solid`.
- `border` sobre `background` rende 1,28:1 (escuro) e 1,22:1 (claro), abaixo dos 3:1 da WCAG 1.4.11 para contorno de controle. Os campos de formulário públicos (busca e validação) usam borda `subtle-foreground` (4,10 e 4,63). Em cards e divisores a borda é decorativa e segue `border`.
- O anel de foco (`primary`) rende no mínimo 3,94:1 em qualquer fundo.

## 3. Tema

- **Um script inline no `<head>` aplica o tema antes da primeira pintura:** lê o cookie `cf-tema` (`dark` ou `light`) com a regex `/(?:^|; )cf-tema=(dark|light)/`, cai em `matchMedia('(prefers-color-scheme: light)')` quando ninguém escolheu, grava `data-theme` no `<html>` e, em qualquer exceção, grava `dark`. É o mesmo `SCRIPT_DE_TEMA` de `lib/theme.ts` do CF Jobs, ao lado de `COOKIE_TEMA`, `isTema` e `MAX_AGE_DO_COOKIE`.
- **Proibido ler o cookie no layout** (`cookies()` de `next/headers`): tornaria toda página dinâmica e mataria o ISR da área pública. O servidor não sabe o tema.
- O `<html lang="pt-BR">` sai do servidor sem `data-theme` e com `suppressHydrationWarning`. Sem JavaScript vale o `:root` (escuro).
- Na CSP herdada do CF Jobs (nonce só em rota dinâmica), o script de tema é liberado por **hash**, nunca por nonce: nonce exige renderização dinâmica e mataria o ISR.
- **Alternador:** Client Component com `useSyncExternalStore`. `subscribe` é um `MutationObserver` no `documentElement` filtrando `data-theme`, `getSnapshot` lê o atributo, `getServerSnapshot` devolve `'dark'`. Não existe `useState` de tema: o DOM é a fonte única, sem divergência de hidratação.
- Ao alternar: grava `data-theme` e escreve `cf-tema=<tema>; path=/; max-age=31536000; samesite=lax` (um ano). Cookie do host, sem `domain`, como no CF Jobs.

## 4. Tipografia

- **Poppins** 400/500/600/700 (títulos e corpo) e **JetBrains Mono** 400/500, via `next/font/google`, `subsets: ['latin']`, `display: 'optional'`, variáveis `--font-poppins` e `--font-jetbrains-mono`.
- `display: 'optional'` protege o CLS: em rede ruim a primeira visita fica na fonte do sistema e não troca depois. Nenhum layout depende das métricas da Poppins.
- **JetBrains Mono** é para o código de validação (`XXXX-XXX-XXX`) e dados técnicos: campo de CPF, coordenadas e chaves do editor, números de linha e contadores da importação. Números que mudam usam `tabular-nums`.
- Escala: `text-display` 3rem/1,1 (hero, 2,25rem abaixo de 640px), `text-h2` 2,25rem/1,2, `text-h3` 1,5rem/1,3, `text-body` 1,125rem/1,7, `text-caption` 0,875rem/1,5. Campos de formulário têm no mínimo 1rem para o iOS não dar zoom ao focar.
- As fontes da UI não são as do PDF: a Poppins do certificado é um TTF versionado e embutido pelo motor (doc 05).

## 5. Layout base

- **Container:** `mx-auto w-full max-w-[var(--container-max)] px-6`. Telas de tarefa única (busca, retirada, validação): `max-w-xl`. Prosa: `max-w-3xl`. Primeiro elemento focável: link "Pular para o conteúdo" para `<main id="conteudo">`.
- **Header:** `border-border bg-background/90 sticky top-0 z-10 border-b backdrop-blur`, miolo com `h-[var(--header-height)] max-w-[var(--container-max)] flex items-center justify-between gap-4 px-6`. Esquerda: `<Link href="/" className="text-h3 font-bold">CF <span className="text-primary">Eventos</span></Link>` (24px bold é texto grande, 4,59:1). Direita: `<nav aria-label="Navegação principal">` com o alternador e o link discreto **Entrar** (`/login`, `text-caption text-muted-foreground hover:text-foreground`).
- **Alternador:** `<button type="button">` pill (`rounded-full border border-border hover:border-primary-muted px-3 py-1.5 text-caption`), área de toque de 44 por 44px. O glifo mostra o destino, em `<span aria-hidden="true">`: `☀` no escuro, `☾` no claro. `aria-label` e `title`: "Mudar para o tema claro" ou "Mudar para o tema escuro".
- **Footer:** igual ao CF Jobs. `border-t border-border mt-16`, `text-caption text-muted-foreground`: "Certificados emitidos pela comunidade **Coding Ferpa**. Projeto open source, sob licença MIT." `<nav aria-label="Links da comunidade">`: "Comunidade Coding Ferpa" (`https://codingferpa.org/`) e "Código no GitHub" (`https://github.com/Coding-Ferpa/eventos`), `target="_blank" rel="noopener"`. A entrada para `/validar` é o botão secundário "Validar um certificado" no hero.
- **Botões:** primário pill (`rounded-full bg-primary-solid text-primary-foreground font-semibold`: o branco vem do token, pela regra 3 da seção 8), 3rem de altura no público, 2,25rem no admin. Secundário: contorno `border`, hover `border-primary-muted`. Destrutivo: contorno e texto `destructive`. Desabilitado: `opacity-50 cursor-not-allowed`.
- **Movimento:** 150 a 250ms `ease`, só em `transform`, `opacity`, `box-shadow` e `border-color`. Efeitos de hover ficam em `@media (hover: hover)`.
- **Admin:** mesmo design system, mais denso (`radius-sm`, tabelas compactas), sidebar fixa, sem hero.

## 6. Componentes-chave

Os textos entre aspas são microcopy final. Os demais estão na seção 7.

### 6a. Card de evento

- **Anatomia:** `<li>` em grid (1 coluna, 2 em 640px, 3 em 1024px, 4 em 1536px, `gap-6`) com um único `<a>` envolvendo tudo: `bg-card border border-border rounded-md h-full flex flex-col`. Capa `aspect-video` (16:9), `object-cover`, `alt=""` (o título nomeia o link), sobre `bg-surface`. Corpo `p-5`: badge, título (`text-h3` 600, `line-clamp-2`, altura mínima de 2 linhas), data e local em `text-caption text-muted-foreground` com ícones `aria-hidden`.
- **Capa ausente:** o servidor resolve o `src` para uma imagem gerada com `next/og` (fundo `#0d0d0d`, brilho radial `#8b5cf6`, título em Poppins 600, assinatura "CF Eventos"). Nunca `src` vazio, nunca imagem quebrada. A UI não põe texto sobre a capa (contraste imprevisível), por isso o badge mora no corpo.
- **Data:** `<time dateTime>` com `Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'America/Sao_Paulo' })`: "14 de março de 2026", ou "14 a 16 de março de 2026". Local: "Fernandópolis, SP" ou "On-line".
- **Estados:** hover com `border-primary`, `shadow-glow` e `translateY(-2px)` em 150ms. Toque: `active:border-primary`. Foco: anel padrão. Carregando: esqueleto `bg-surface` na mesma proporção.
- **Badge:** pill `bg-surface text-foreground text-caption font-medium px-3 py-1` com ponto de 8px na cor do token. A cor vai no ponto porque texto semântico sobre `surface` reprova no claro, e o ponto só precisa de 3:1 (pior caso: 3,52).

| Status (PRD) | `event_status` no banco | Rótulo | Token | Forma |
|---|---|---|---|---|
| `rascunho` | `draft` | Rascunho | `muted-foreground` | Contorno tracejado. Só no admin (no público é 404) |
| `inscricoes_abertas` | `registration_open` | Inscrições abertas | `success` | Ponto |
| `inscricoes_encerradas` | `registration_closed` | Inscrições encerradas | `warning` | Ponto |
| `em_andamento` | `in_progress` | Acontecendo agora | `primary` | Ponto pulsando a cada 2s, parado com `prefers-reduced-motion` |
| `realizado` | `completed` | Certificados em preparo | `muted-foreground` | Ponto. No select do admin: "Realizado" |
| `certificados_disponiveis` | `certificates_available` | Certificados disponíveis | `primary-solid` | Sólido, texto branco (5,70:1). Único status que libera ação |
| `arquivado` | `archived` | Arquivado | `subtle-foreground` | Ponto |

### 6b. Formulário de busca do certificado

Só existe quando o evento está em `certificates_available` ("certificados disponíveis"). Campos habilitados por evento entre CPF, e-mail e nome completo. **Data de nascimento nunca é campo sozinho:** só aparece como segundo fator, logo abaixo do nome.

- **Modo "qualquer um":** seletor "Buscar por" em `role="radiogroup"`, rádios estilizados como pills (não abas: é um formulário só e funciona sem JS). Padrão: CPF, depois e-mail, depois nome. Com um campo habilitado, o seletor some. **Modo "todos":** campos empilhados, todos obrigatórios.
- **Campos:** rótulo visível acima (`text-caption` 500), 3rem de altura, `bg-surface`, borda `subtle-foreground`, `rounded-sm`.
  - CPF: `type="text" inputmode="numeric" autocomplete="off" maxlength="14"`, `font-mono`, máscara `000.000.000-00`, aceita colar com ou sem pontuação. Dígito verificador no `blur`: "Esse CPF não parece válido. Confira os números."
  - E-mail: `type="email" autocomplete="email" autocapitalize="none" spellcheck="false"`.
  - Nome completo: `autocomplete="name" autocapitalize="words" spellcheck="false"`. Ajuda: "Do jeito que você escreveu na inscrição, com todos os sobrenomes."
  - Data de nascimento: `type="text" inputmode="numeric" autocomplete="bday"`, máscara `DD/MM/AAAA`. `type="date"` foi rejeitado: no Android obriga a rolar anos até 2004, e digitar 8 números é mais rápido.
- **Nunca** `<datalist>`, sugestão, autocomplete de nomes ou lista: o resultado é uma pessoa ou nenhuma.
- **Botão:** "Buscar meu certificado", primário, largura total no celular, sem glow. Carregando: `aria-busy="true"`, "Buscando...", campos `readonly`.
- **429:** painel `role="alert"` com borda `warning`, botão desabilitado, contagem derivada do `Retry-After`: "Você pode tentar de novo em 42 segundos", ou "em cerca de 3 minutos" acima de 60s. A contagem visual fica fora de região viva. O leitor de tela ouve o aviso inicial e, ao liberar, "Pronto, já dá para buscar de novo."
- **Não encontrado:** painel com borda `warning` cujo título (`tabindex="-1"`) recebe o foco. Frase canônica da seção 7 e as causas prováveis: nome diferente do da inscrição (sobrenome faltando, apelido, abreviação), evento errado, lista ainda incompleta. Fecha com "Ainda não deu certo? Escreva para {e-mail de contato do evento}." Os valores digitados permanecem. A mensagem é idêntica para qualquer falha: nunca revela qual campo bateu.

### 6c. Tela de retirada

- **Ordem no celular:** `<h1>` "Encontramos seu certificado" (recebe o foco) → nome → prévia → dados → CTA → correção. Em 1024px, duas colunas: prévia 7/12, dados 5/12.
- **Prévia:** `<svg viewBox role="img" aria-label="Prévia do certificado de {nome}, {tipo}, no evento {evento}">` com `<image>` da arte em WebP (maior lado de 1.600 px, até 200 KB) e o texto como `<path>` vetorial vindo do servidor, do mesmo plano de layout do PDF (doc 05). `aspect-ratio` reservado, `border border-border rounded-md bg-surface`. **Não usa pdf.js:** mais de 1 MB de JavaScript em rede móvel, e a prévia divergiria do PDF. Como paths não são texto, o conteúdo se repete em HTML. Duas páginas: seletor "Frente / Verso".
- **Dados:** nome em `text-h2` 600 (`text-h3` abaixo de 640px). `<dl>`: Evento, Participação, Carga horária ("8 horas"), Código de validação em `<code className="font-mono">` com "Copiar código", e "CPF terminado em 145" **somente** quando a busca foi por CPF (quem chegou pelo nome não ganha 3 dígitos do CPF de ninguém).
- **CTA "Baixar PDF":** primário, 3,25rem, `shadow-glow` permanente. No celular, barra `sticky bottom-0 bg-background/90 backdrop-blur` respeitando `env(safe-area-inset-bottom)`. É um `<a href>` comum para a rota do PDF, **sem o atributo `download`** e sem `fetch` com blob. O `Content-Disposition: attachment` da resposta faz o navegador baixar; sem o atributo, a falha de geração (que responde com redirecionamento) navega de volta a esta tela em vez de ser salva como se fosse o PDF. Blob falha nos navegadores embutidos do WhatsApp e do Instagram, por onde o aluno chega. Depois do toque, painel `role="status"` com ícone `success` e glow: "Download iniciado. Se nada aconteceu, toque em Baixar PDF de novo." Falha de geração volta a esta tela com `role="alert"`.
- **"Meu nome está errado":** botão secundário com `aria-expanded` e `aria-controls` que abre formulário inline (sem modal: teclado virtual e modal não convivem). Campos: "Nome correto" (`autocomplete="name"`, 3 a 120 caracteres, pré-preenchido) e "E-mail ou WhatsApp para contato". Ações: "Enviar pedido de correção" e "Cancelar". O pedido é gravado na plataforma. **Nunca `mailto:` nem link de WhatsApp:** o pedido sairia da fila e do histórico.
- **Sucesso do pedido:** painel `role="status"`, borda `success`, glow. Com pedido pendente, o botão vira o texto "Pedido de correção em análise".
- **Mais de um certificado:** a busca acha uma pessoa ou nenhuma, mas a pessoa pode ter vários certificados no evento (palestrante e organizadora). Título "Encontramos 2 certificados seus neste evento" e pilha (`<ul>`, `gap-4`) com um cartão por certificado, por carga horária decrescente: miniatura, tipo de participação, carga horária, código e o próprio "Baixar PDF". Só o CTA do primeiro cartão tem glow permanente. A correção de nome é única, no fim da pilha: o nome é da pessoa.

### 6d. Editor de campos do modelo (admin, desktop)

Abaixo de 1024px: "O editor de modelo precisa de uma tela maior. Abra no computador."

- **Layout:** barra superior (nome do modelo, "Frente / Verso", zoom, "Testar com o nome mais longo deste evento", "Alterações não salvas", "Salvar rascunho", "Publicar"). Esquerda, 280px: abas **Campos de layout** e **Campos de conteúdo**. Centro: prévia SVG. Direita, 360px: propriedades e pendências.
- **Duas fases, a mesma estrutura de dados.** Cada campo guarda página, `x`, `y`, largura e altura normalizados de 0 a 1. A UI usa origem no canto superior esquerdo e exibe **% com 2 casas** e vírgula ("12,50 %", passo 0,10). A conversão para o eixo do PDF é do doc 05. O motor não sabe qual fase gerou os números.
  - **Fase A (M6):** formulário numérico com prévia ao vivo ao lado (debounce de 150ms). As caixas aparecem (tracejado `primary` 1px; selecionada: 2px sólido com rótulo), clicar seleciona, nada arrasta.
  - **Fase B (M10):** arrastar move, 8 alças redimensionam. Setas movem 0,1%, Shift+setas 1%, `Esc` cancela, `Delete` remove com confirmação. Caixa com `tabindex="0"` e `aria-label="Campo Nome do participante, x 12,50%, y 40,00%"`. O formulário da fase A permanece como caminho acessível completo.
- **Propriedades do campo:** conteúdo (texto com **chips de placeholder** do menu "Inserir campo": "Nome do participante", "CPF mascarado", "Código de validação", campos do evento e de conteúdo; a chave técnica nunca aparece), tipo (texto ou QR code; datas e números são placeholders com formato próprio), página, posição X e Y, caixa L e A, alinhamento H (esquerda, centro, direita) e V (topo, meio, base), fonte (conjunto curado do PRD ou TTF/OTF enviado), tamanho em pt (passo 0,5), tamanho mínimo em pt, peso, cor, ajuste ("encolher e depois quebrar" para nomes, "quebrar e depois encolher" para parágrafos), máximo de linhas (1 a 8), entrelinha, transformação (nenhuma, MAIÚSCULAS, Nomes Próprios pt-BR). QR code: caixa quadrada, com o lado exibido em centímetros.
- **Cor do texto é livre** (hex mais `<input type="color">`): pertence à arte. Só é pintada dentro da prévia e do PDF, nunca no cromo da UI.
- **Campos de conteúdo:** tabela onde o admin declara os campos dinâmicos do modelo: chave (`snake_case`, única), rótulo, tipo (texto, número, data, horas), obrigatório, padrão, formato ("14 de março de 2026" ou "14/03/2026"; "8 horas" ou "8h"). Chaves reservadas (`cpf`, `nome`, `email`, `nascimento` e variantes) são recusadas: "Esse dado é de identidade e já existe no sistema. Use o campo pronto em Inserir campo."
- **Nome mais longo:** troca o exemplo pelo maior nome do evento (sem participantes: "Maria Eduarda dos Santos Albuquerque Pessoa Rodrigues"). Chip "Prévia com: {nome}" e "Voltar ao exemplo".
- **Pendências** (`aria-live="polite"`, cada item seleciona o campo):
  - Aviso `warning`: "Com o nome mais longo, o texto de Nome cai para 9 pt, abaixo do mínimo de 12 pt, mesmo em duas linhas. Aumente a caixa ou reduza o mínimo."
  - Aviso `warning`: "O QR code está com 1,6 cm. Abaixo de 2 cm muitas câmeras não leem."
  - Bloqueio `destructive`: "Falta o campo {Nome do participante, QR code ou Código de validação}. Sem os três o modelo não publica." "Publicar" fica com `aria-disabled="true"` e `aria-describedby` na lista (não `disabled`: o foco precisa chegar para o motivo ser lido).

### 6e. Página de validação

- **`/validar`:** `<h1>` "Validar certificado", apoio "Digite o código impresso no certificado ou aponte a câmera para o QR code." Um campo `font-mono text-h3`, `autocomplete="off" autocapitalize="characters" spellcheck="false"`, placeholder `XXXX-XXX-XXX`, ajuda "São 10 caracteres, como em 7K2M-9QF-4TX. Não precisa digitar os hífens." Ao digitar: maiúsculas e hífen automático após o 4º e o 7º caractere. Normalização: ignora hífens e espaços, aceita minúsculas, `O` vira `0`, `I` e `L` viram `1`. Erros locais: "O código tem 10 caracteres. Faltam 3." e "A letra U não existe nos nossos códigos. Confira a digitação." Botão "Validar".
- **`/validar/[codigo]`:** o painel de estado é o primeiro bloco e cabe em 360 por 640px (o QR abre esta página no celular). `bg-card`, borda esquerda de 4px no token, ícone de 32px e título `text-h3` 600 na cor do token, código em mono acima. O `<title>` repete o estado.

| Estado | Token | Título | Conteúdo |
|---|---|---|---|
| Válido | `success`, com glow | Certificado válido | `<dl>`: Nome, Evento, Participação, Carga horária, Data do evento, Emitido em |
| Revogado | `destructive` | Certificado revogado | "Revogado em 14 de março de 2026. Este documento não vale como comprovante." Mesmos dados em `muted-foreground`, **sem o motivo** |
| Removido a pedido do titular | `muted-foreground` | Certificado removido a pedido do titular | "Os dados foram eliminados a pedido da pessoa titular, como prevê a LGPD. Não é possível confirmar este documento." Nenhum dado pessoal, nem o nome |
| Não encontrado | `warning` | Não encontramos esse código | "Confira a digitação: são 10 caracteres, sem as letras I, L, O e U." Campo pré-preenchido para nova tentativa. Nunca erro 500 |
| Malformado | `warning` | Esse código não tem o formato certo | Chega aqui quem editou a URL à mão. Mesma dica de digitação e o campo para tentar de novo. Não consulta o banco |

- No válido com `version > 1`, linha extra no `<dl>`: "Dados atualizados em 20 de setembro de 2026".
- No válido, rodapé: "Esta página é a fonte oficial. Se o PDF mostrar um nome diferente, vale o que está aqui." (cobre a correção de nome após a emissão). Nenhum outro dado pessoal: nem CPF, nem e-mail, nem nascimento.

### 6f. Assistente de importação (admin)

- **Stepper:** `<ol>` "1 Arquivo", "2 Colunas", "3 Prévia", "4 Aplicação". Atual: `aria-current="step"`, marcador `primary`. Concluído: check `success`. Futuro: `muted-foreground`. Voltar preserva o mapeamento, pular adiante não existe. A cada troca o foco vai para o `<h2>` do passo.
- **1 Arquivo:** a pergunta **"De quem é esta lista?"** com os tipos de participação do evento (a escolha define o modelo do lote) e, por último, "Vários tipos (a planilha tem uma coluna de tipo)". Depois, área de soltar com `<input type="file" accept=".csv,.txt,text/csv">` e botão visível. Após a leitura: "Codificação: Windows-1252 · Separador: ponto e vírgula · 312 linhas", as 10 primeiras linhas já decodificadas e a pergunta "Os acentos apareceram certos?".
- **2 Colunas:** uma linha por campo do sistema (Nome completo obrigatório, CPF, E-mail, Data de nascimento, Tipo de participação e os campos de conteúdo do modelo), select da coluna do CSV e valor de exemplo ao lado. A sugestão vem do mapeamento salvo no modelo e, na falta dele, da semelhança do cabeçalho; o aviso "Mapeamento do modelo aplicado" diz de onde veio. Ao continuar, o mapeamento confirmado é salvo no modelo sem o admin pedir. Obrigatório sem coluna bloqueia "Continuar".
- **3 Prévia:** seis contadores em cartões (`text-h2 font-mono tabular-nums`, rótulo `text-caption`, borda superior de 2px no token): **A criar** (`success`), **A atualizar** (`primary`), **Inalterados** (`muted-foreground`), **Com erro** (`destructive`), **Pedem decisão** (`warning`, bloqueia a aplicação: cada linha mostra as duas pessoas lado a lado e os botões "É a mesma pessoa", "É outra pessoa" e "Pular linha"), **Ausentes no arquivo** (`muted-foreground`, só informativo). Cada um é botão `aria-pressed` que filtra a tabela. Tabela de erros: Linha, Campo, Valor recebido (CPF sempre como `***`), Motivo. 50 por página. Sob Ausentes: "Estão no evento, mas não neste arquivo. Nada acontece com eles: a importação nunca remove ninguém." Botão "Aplicar importação" (primário, sem glow) com confirmação "Criar 280 e atualizar 12. As 3 linhas com erro ficam de fora."
- **4 Aplicação:** progresso indeterminado, depois painel `success` com glow: "Importação aplicada. 280 criados, 12 atualizados.", links "Ver participantes" e "Importar outro arquivo". Falha: painel `destructive`, "Nada foi gravado. A importação é tudo ou nada, então o evento continua como estava.", motivo em uma frase e "Tentar de novo".
- Funciona a partir de 768px. Tabelas rolam na horizontal dentro do próprio contêiner.

## 7. Voz e microcopy

Acolhedora, direta, sem corporativês. Trata por "você", fala na primeira pessoa do plural ("não encontramos"), nunca culpa a pessoa e sempre diz o próximo passo. Sem "Ops!", sem exclamação em erro, sem jargão na tela ("hash", "token", "429"). Botão é verbo no infinitivo mais objeto. Reticências são três pontos.

| Situação | Texto |
|---|---|
| Hero | "Seu certificado, na hora." Apoio: "Ache o evento, confirme seus dados e baixe o PDF. Sem cadastro." |
| Lista de certificados vazia | "Nenhum certificado por aqui... ainda." |
| Catálogo vazio | "Nenhum evento por aqui... ainda. Quando a comunidade marcar o próximo, ele aparece nesta página." |
| `inscricoes_abertas` | "As inscrições estão abertas." Botão externo: "Quero participar" |
| `inscricoes_encerradas` | "As inscrições se encerraram. Depois do evento, os certificados aparecem aqui." |
| `em_andamento` | "O evento está acontecendo agora. Os certificados saem depois do encerramento." |
| `realizado` | "Os certificados estão sendo preparados. Assim que saírem, é só voltar aqui e buscar o seu." |
| `certificados_disponiveis` | "Os certificados já estão no ar. Busque o seu abaixo." |
| `arquivado` | "Este evento foi arquivado. Os certificados emitidos continuam válidos e podem ser conferidos em Validar certificado." |
| Não encontrado | "Não encontramos ninguém com esses dados neste evento. Confira se o nome está igual ao da inscrição." |
| 429 | "Muitas tentativas seguidas. Você pode tentar de novo em {tempo}." |
| Autorização de retirada expirada | "Por segurança, esta tela expirou. Busque de novo, leva poucos segundos." |
| Erro ao gerar o PDF | "Não conseguimos gerar seu PDF agora. O problema é nosso, não seu. Tente de novo em instantes." |
| Pedido de correção enviado | "Pedido enviado. A organização vai revisar, e o certificado corrigido mantém o mesmo código. Não precisa pedir de novo." |
| Certificado revogado (retirada ou link direto) | "Este certificado foi revogado pela organização e não pode mais ser baixado. Se achar que é engano, escreva para {contato}." |
| Navegador embutido do Instagram ou do Facebook (aparece **antes** da busca) | "Você está no navegador do Instagram, que costuma falhar ao baixar PDF. Abra o menu de três pontos e escolha Abrir no navegador antes de buscar." |
| Link direto inválido | "Este link não vale mais. Busque seu certificado na página do evento." |
| 404 | "Essa página não existe. Que tal ver os eventos?" |
| Erro inesperado (`error.tsx`) | "Algo saiu do trilho do nosso lado. Tente de novo em instantes." |

## 8. Regras de uso

1. **Glow só nos três lugares do princípio 3.** "Estado de sucesso" quer dizer: download iniciado, pedido de correção enviado, certificado válido e importação aplicada. Botão primário comum não tem glow.
2. **Proibido:** hex, `rgb()` ou cor nomeada em componente. Paleta do Tailwind (`text-violet-500`, `bg-zinc-900`). Tudo o que a tabela de contraste reprova (seção 2). Placeholder como rótulo. Texto sobre a capa do evento. Estado comunicado só por cor. Ler o cookie de tema no servidor.
3. **Branco literal (`#ffffff`)** só existe em `--primary-foreground`, como texto sobre `primary-solid`.
4. **Cor nova:** PR que altera este documento e o `globals.css` juntos, com a linha da tabela de contraste calculada nos dois temas sobre `background`, `card` e `surface`. Sem a linha, não entra.
5. **Componente novo:** primeiro componha com o shadcn/ui já instalado. Se não der, o PR acrescenta aqui a especificação nos cinco itens (anatomia, estados, comportamento mobile, acessibilidade, microcopy) antes do código. Dependência nova de UI exige ADR e linha no doc 01.
6. **Alvo de toque** mínimo de 44 por 44px no público. No admin, nunca abaixo de 32px.
7. **Texto novo de interface** segue a seção 7. Se soar como e-mail de banco, reescreva.
