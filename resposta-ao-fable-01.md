# Resposta à página de revisão (CF Eventos)

Revisão boa. Conferi as três afirmações verificáveis e as três batem: `pdf-lib` último publish em 06/11/2021 e sem modificação no pacote desde 12/05/2022, `@cantoo/pdf-lib` na 2.11.1 de 15/09/2026, e o pause do Supabase confirmado na doc oficial (7 dias de baixa atividade, e o que conta é atividade de banco). A do Vercel Cron no Hobby eu não conferi, mas não muda nada porque você vai de `pg_cron` de qualquer forma.

**Aprovado para escrever os documentos**, com uma mudança estrutural na decisão 2 e sete ajustes pontuais abaixo. A mudança estrutural é minha culpa: é um requisito que eu não coloquei no PRD.

---

## 1. Mudança estrutural: o CSV precisa ser dinâmico

Cada evento vai ter modelos de certificado diferentes, com campos diferentes. Não existe um conjunto fixo de colunas que sirva para todo evento. O admin precisa **declarar os campos** de cada modelo e o CSV daquele modelo carrega exatamente esses campos.

Isso não invalida nada do que você decidiu, mas exige separar duas classes de campo, e essa separação é a parte que carrega peso:

### Campos de identidade (schema fixo, colunas reais no Postgres)

`full_name`, `full_name_normalized`, `cpf_hash`, `cpf_last3`, `birth_date`, `email`.

São os únicos que a busca usa e os únicos que entram na cascata de conciliação da sua decisão 4. **Não são configuráveis pelo admin.** Um evento escolhe quais habilitar na busca (o PRD já previa isso), mas não pode inventar um campo de identidade novo. Esse é o contrato do sistema.

### Campos de conteúdo (dinâmicos, declarados pelo modelo, gravados em JSONB)

`carga_horaria`, `titulo_palestra`, `nota`, `periodo`, `turma`, `orientador`, o que o modelo pedir.

Declarados no próprio modelo, junto com o campo de layout que já existe em `certificate_templates.fields`: cada entrada com `source: 'data'` passa a declarar também `key`, `label`, `type` (texto, número, data, horas), `required`, `default` e `format`. Um modelo publicado gera implicitamente o Zod do próprio payload.

### Correção na sua decisão 2: o payload vai no certificado, não no participante

Você acertou em separar `participants` 1:N `certificates`, e o exemplo que você deu prova o ponto melhor do que você usou: a pessoa que é palestrante e organizadora no mesmo evento tem **carga horária diferente e título de palestra diferente** nos dois certificados. Um JSONB no participante não comporta isso.

Então: `certificates.data JSONB`, não `participants.extra`. O participante guarda quem a pessoa é; o certificado guarda o que aquele documento afirma. É o certificado que o modelo renderiza.

### O que decorre disso e você precisa desenhar

**a) Validação da importação é por linha, contra o modelo daquela linha.** O evento pode ter quatro modelos com conjuntos de campos distintos. A coluna de tipo de participação roteia a linha para o modelo, e só então o validador sabe o que exigir. Palestrante sem `titulo_palestra` é erro; participante sem `titulo_palestra` não é.

**b) Um CSV por evento ou um por modelo?** Sua decisão, mas com o trade-off na mesa: um CSV por evento com a união das colunas produz uma planilha cheia de células vazias que o admin preenche errado, e na vida real a lista de presença e a lista de palestrantes nunca saem da mesma fonte. Minha inclinação é **um CSV por modelo**, suportando a união como caso degenerado já que o roteamento por tipo vai existir de qualquer jeito. Decida e registre.

**c) O preset de mapeamento de colunas pertence ao modelo, não ao evento.** O certificado do Ferpa Tech Day 2027 vai usar o mesmo modelo do de 2026 e o mapeamento se repete inteiro. Preset preso ao modelo, clonado junto com ele.

**d) Guardrail inegociável: CPF é sempre campo de identidade, nunca campo de conteúdo.** Sem essa regra escrita e aplicada por validador, o admin cria um campo livre chamado `cpf`, o valor cai em `certificates.data` em texto puro, e toda a decisão 3 vira decoração. O validador do modelo precisa recusar um conjunto de chaves reservadas (`cpf`, `nome`, `email`, `nascimento` e variantes com acento, hífen e underscore).

**e) Clonar evento.** Com o modelo declarando os próprios campos, duplicar um evento vira uma operação de um clique: copia modelos, campos, presets e configuração de busca. Isso serve direto ao objetivo 5 do PRD ("cadastrar o segundo evento custa minutos"). Desenhe no modelo de dados agora, mesmo que a UI fique para depois.

---

## 2. As cinco decisões

**1. `@cantoo/pdf-lib` mais camada de layout pura.** Aprovado, e a parte que mais gostei não foi a escolha da biblioteca: foi separar `layout()` do desenho e ter dois desenhistas sobre o mesmo plano. SVG na prévia em vez de pdf.js no celular é a decisão certa para o público desse site. A página canônica também resolve um problema real de forma barata.

Três coisas a amarrar:
- **Licença do fork.** Confirme que é MIT como o original. O projeto é MIT e isso precisa fechar.
- **O teste visual no CI.** Comparar PDF rasterizado com SVG exige um rasterizador no CI, e há ironia em instalar Chromium ali depois de rejeitá-lo no runtime. Diga como pretende fazer, ou troque por uma asserção mais barata: comparar o plano de layout (números) contra um snapshot, mais extração de texto do PDF para garantir acento e conteúdo. Snapshot de números pega regressão de posicionamento sem rasterizar nada.
- **Subsetting da fonte.** Com fonte embutida e subset por documento, cada PDF carrega só os glifos usados. Confirme que isso está no caminho quente e que o cache de módulo guarda a fonte já parseada, não só os bytes.

**2. `participants` 1:N `certificates`.** Aprovado com a correção do item 1 acima (payload dinâmico em `certificates.data`).

**3. Busca com HMAC e token opaco.** Aprovado, e o HMAC é melhor do que o que eu tinha escrito no PRD. O token assinado de 30 minutos autorizando prévia e download, em vez de id ou código, está certo.

**4. Importação com lock e recálculo do diff.** Aprovado. `pg_advisory_xact_lock` por evento mais recálculo dentro da transação é mais rigoroso do que eu pedi, e "se divergir da prévia, aborta" é exatamente o comportamento que evita o desastre silencioso.

Uma lacuna: **upsert-only não dá caminho para remover quem entrou por engano.** Se o admin importar a planilha errada, a única saída fica sendo revogar um a um. Precisa de uma remoção manual explícita no admin, com auditoria, separada do fluxo de importação.

**5. Rate limit com dois baldes.** Aprovado, e esse foi o melhor achado da sua revisão. CGNAT no Wi-Fi da faculdade bloqueando o auditório inteiro é uma falha que só aparece no dia do evento, quando não dá mais para consertar.

Um detalhe de implementação que decide se funciona: **o cookie precisa ser emitido na primeira visita à página do evento, não na primeira busca.** Se só nascer junto com a primeira tentativa, o primeiro request de todo mundo cai no balde de IP e você recriou o problema para o pico exato que está tentando cobrir.

---

## 3. As cinco divergências

**1. Busca só por data de nascimento. Aceito a recusa.** Seu argumento está certo e o meu requisito estava errado. Tire do PRD.

**2. Rate limit por IP. Resolvido pelos dois baldes.** De acordo.

**3. Botão de correção na fase 1.** Aceito que a fila de revisão fique em P1, mas **não aceito `mailto:` nem link para WhatsApp**. O pedido precisa gravar em `name_correction_requests` desde a fase 1, com status `pending` e notificação por e-mail para o admin. A tabela mais o insert custam quase nada; o que é P1 é a tela de revisão no admin. Se o pedido sair da plataforma na fase 1, ele se perde num grupo de WhatsApp e o histórico nasce furado.

**4. CPF impresso no certificado.** Depende da arte real, que ainda não tenho. Trate assim: o modelo pode referenciar `cpf_masked` como campo de identidade e imprimir `***.456.789-**` a partir dos 3 dígitos guardados, o que cobre a maioria dos casos. CPF completo impresso é decisão nova com ADR, provavelmente cifrado em repouso com chave em env, usado só na renderização e nunca em busca nem em resposta de API. Não construa agora, mas deixe o modelo de dados sem impedir.

**5. Pause do Supabase.** Aceito o ping diário via GitHub Actions. Uma correção: o ping tem que **bater no Postgres**, porque é atividade de banco que conta, não request na Vercel. Fazer a Action chamar `/validar/{codigo-conhecido}` resolve e ainda funciona como smoke test de produção de graça.

---

## 4. Sua pergunta em aberto

Concordo que a planilha real é a pergunta que mais pesa, e vou buscá-la. Enquanto ela não chega, siga com os campos de busca como configuração por evento, exatamente como você propôs, porque a arquitetura cobre as duas saídas.

O requisito de CSV dinâmico acrescenta uma pergunta irmã que vale o mesmo peso: **quantos modelos de certificado o primeiro evento terá, e quais campos de conteúdo cada um precisa.** Vou levantar junto com a planilha.

---

## 5. Pode escrever

Com os ajustes acima, siga para os documentos e os ADRs. Dois pedidos sobre a forma:

- Os ADRs que eu quero ver nominalmente: escolha do fork do pdf-lib, separação layout/desenho, payload dinâmico no certificado em vez do participante, HMAC com salt por evento, dois baldes de rate limit, e upsert-only com remoção manual explícita.
- No `14-prompt-de-execucao-opus-5.md`, mantenha M6 e M7 antes de M8 como no meu esboço. Depois dessa revisão eu diria que o motor de certificado ficou ainda mais claramente o risco do projeto, e a tela que o consome continua trivial.
