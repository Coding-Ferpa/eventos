# CF Eventos · Especificação de Produto (PRD)

> Plataforma de emissão, busca, download e validação de certificados dos eventos da comunidade **Coding Ferpa** (Fernandópolis/SP).
> Domínio previsto: `eventos.codingferpa.org` · Repositório: `Coding-Ferpa/eventos` · Licença MIT.
> Versão 1.1 · Documento de produto. Decisões de arquitetura ficam em `docs/`. As mudanças da 1.0 para a 1.1 saíram da revisão de arquitetura e estão listadas na seção 11.

---

## 1. Problema

Depois de cada simpósio ou semana acadêmica da Coding Ferpa (Ferpa Tech Day e os próximos), a organização precisa entregar certificado para dezenas ou centenas de alunos. Hoje isso é trabalho manual: alguém preenche um modelo, exporta PDF um a um e envia por WhatsApp ou e-mail, e ainda responde por semanas a mensagens de "perdi o meu", "meu nome saiu errado", "dá pra mandar de novo?".

Para o aluno o custo é pior que a inconveniência: sem o certificado em mãos ele não consegue lançar as **horas complementares** na faculdade, e o prazo de lançamento não espera a organização ter tempo. Para a comunidade, o custo é reputacional: o evento acaba bem e a entrega arrasta.

Não resolver significa manter um gargalo que cresce junto com os eventos: o esforço da organização é linear no número de participantes, e a taxa de alunos que ficam sem o documento cresce com o atraso.

## 2. Objetivos

1. **Zerar o trabalho manual por aluno.** A organização sobe um modelo e um CSV; a partir daí a entrega é self-service. Meta: emitir 300 certificados com menos de 15 minutos de trabalho humano.
2. **Aluno retira sozinho em menos de 1 minuto**, sem cadastro, sem login, sem falar com ninguém.
3. **Certificado verificável.** Toda instituição que receber o documento consegue conferir a autenticidade em uma página pública, sem contato com a organização.
4. **Nome certo na primeira tentativa.** O fluxo de correção existe e não depende de troca de mensagens fora da plataforma.
5. **Base para os próximos eventos.** Cadastrar o segundo evento custa minutos, não um novo projeto.

## 3. Não-objetivos (v1)

| Fora do escopo | Por quê |
|---|---|
| **Inscrição/venda de ingressos** | Outro produto. O evento tem um campo de link externo que aponta para onde a inscrição já acontece (Sympla, formulário, etc.). |
| **Controle de presença (check-in, QR na porta)** | A fonte de verdade da presença continua sendo o processo da organização; a plataforma recebe o resultado por CSV. Reavaliar na fase 2. |
| **Editor gráfico de certificado (tipo Canva)** | O designer da comunidade já cria a arte nas ferramentas dele. A plataforma posiciona campos sobre a arte pronta, não desenha a arte. |
| **Login de aluno / área do participante com senha** | Adiciona cadastro e recuperação de senha a um fluxo que precisa durar 40 segundos. A identificação é o dado que ele já forneceu na inscrição. |
| **Multi-tenant (outras comunidades)** | A plataforma é da Coding Ferpa. Multi-organização é reescrita de RLS inteira; se acontecer, é v2 com decisão própria. |
| **Assinatura digital ICP-Brasil** | Custo e cartório fora da realidade de evento comunitário gratuito. O QR de validação cobre a necessidade real. |

## 4. Personas

**Aluno participante (volume).** Estudante de TI da região, entre 17 e 25 anos, acessa quase sempre pelo celular, em rede móvel. Não vai criar conta. Chega ao site por um link no grupo de WhatsApp ou pelo Instagram da comunidade. Quer o PDF e sair.

**Palestrante / organizador / monitor (poucos, alta visibilidade).** Precisa de um certificado com texto diferente ("ministrou a palestra X", carga horária diferente). São as pessoas que mais compartilham o certificado no LinkedIn, então a qualidade visual importa mais aqui.

**Admin da comunidade (2 a 5 pessoas).** Organiza o evento, tem a planilha de presença, sobe a arte do certificado. Confortável com computador, não necessariamente com tecnologia. Faz o trabalho às 23h da véspera.

**Coordenação do curso / secretaria (validador).** Recebe o PDF do aluno e precisa saber se é legítimo antes de lançar as horas. Não vai instalar nada nem criar conta.

## 5. Histórias de usuário

### Aluno

1. Como aluno, quero **ver a lista de eventos** e identificar em qual eu estive, para não precisar lembrar o nome exato.
2. Como aluno, quero **buscar meu certificado com um dado que eu tenho na cabeça** (CPF, e-mail ou nome completo, com a data de nascimento servindo apenas de confirmação junto do nome), para não depender de um código que perdi.
3. Como aluno, quero **ver uma prévia do certificado antes de baixar**, para conferir se meu nome está certo.
4. Como aluno, quero **baixar o PDF no celular**, para enviar à secretaria pelo próprio celular.
5. Como aluno, quero **pedir correção do meu nome** direto na tela quando ele sair errado, sem precisar caçar alguém no WhatsApp.
6. Como aluno que recebeu o e-mail, quero **clicar em um link e cair direto no meu certificado**, sem preencher nada.
7. Como aluno de vários eventos, quero **buscar uma vez e ver todos os meus certificados**, para resolver tudo de uma vez. *(P1)*
8. Como aluno, quero **adicionar o certificado ao meu LinkedIn em um clique**, porque é para isso que serve metade deles. *(P1)*
9. *(Erro)* Como aluno cujos dados não batem, quero **uma mensagem que me diga o que fazer em seguida**, e não só "não encontrado".
10. *(Vazio)* Como aluno de um evento cujos certificados ainda não saíram, quero **saber que estão a caminho** em vez de achar que fiquei de fora.

### Validador

11. Como coordenador, quero **digitar o código do certificado em uma página pública e ver nome, evento, carga horária e data**, para conferir sem ligar para ninguém.
12. Como coordenador com o PDF na mão, quero **apontar a câmera para o QR** e cair direto na validação.
13. *(Erro)* Como coordenador, quero **ver claramente quando um certificado foi revogado**, e não apenas "inválido".

### Admin

14. Como admin, quero **cadastrar um evento** com foto, título, descrição, data, local, link e status, para que ele apareça no site.
15. Como admin, quero **definir por evento quais dados servem para busca**, porque nem todo evento coleta CPF.
16. Como admin, quero **subir a arte do certificado em PDF ou imagem e posicionar os campos dinâmicos arrastando sobre a prévia**, para não depender de um dev a cada evento.
17. Como admin, quero **ver a prévia do certificado com um nome de teste longo**, para descobrir o estouro de texto antes dos alunos.
18. Como admin, quero **subir o CSV da planilha de presença e ver o que vai acontecer antes de aplicar** (quantos criados, atualizados, com erro), para não estragar uma emissão já publicada.
19. Como admin, quero **reimportar um CSV corrigido sem duplicar ninguém**.
20. Como admin, quero **modelos diferentes por tipo de participação** (participante, palestrante, organizador, monitor), com carga horária própria.
21. Como admin, quero **liberar os certificados em um clique** e que o status do evento mude junto.
22. Como admin, quero **disparar e-mail para todos os participantes** com o link direto, e acompanhar quem recebeu.
23. Como admin, quero **aprovar ou rejeitar pedidos de correção de nome** em uma fila, e que o certificado corrigido mantenha o mesmo código.
24. Como admin, quero **revogar um certificado emitido por engano**, e que a página de validação passe a dizer isso.
25. Como admin, quero **ver quantos certificados foram emitidos e quantos foram retirados**, para saber quem ainda preciso cobrar.
26. Como admin, quero **exportar a lista de participantes e retiradas em XLSX**, para prestar contas à coordenação do curso.

## 6. Requisitos

### P0 · sem isso não vai ao ar

#### R1. Catálogo de eventos (público)

Lista de eventos com capa, título, data, local e badge de status. Evento tem página própria em `/eventos/{slug}` com descrição em Markdown, imagem, datas, local, link externo opcional e o bloco de ação conforme o status.

Estados de evento: `rascunho`, `inscricoes_abertas`, `inscricoes_encerradas`, `em_andamento`, `realizado`, `certificados_disponiveis`, `arquivado`. Só `certificados_disponiveis` habilita a busca; os demais mostram a mensagem correspondente.

**Aceite**
- [ ] Evento em `rascunho` retorna 404 no público e é visível no admin.
- [ ] Evento em `realizado` mostra "Os certificados estão sendo preparados" e nenhum formulário.
- [ ] A página do evento é indexável e traz Open Graph com a capa.
- [ ] Capa ausente cai em uma imagem gerada com a identidade da comunidade, nunca em imagem quebrada.

#### R2. Busca e retirada do certificado (público)

Formulário com os campos habilitados no evento (CPF, e-mail, nome completo e, como segundo fator, data de nascimento), em modo "qualquer um" ou "todos" conforme configuração do evento.

**A data de nascimento nunca é chave de busca sozinha** (v1.1). Em um evento de 300 pessoas de 17 a 25 anos a colisão de datas é certa, e cerca de 3.650 datas varrem a lista inteira, devolvendo nome e certificado de menores. No modo "qualquer um" ela só vale junto com o nome completo; no modo "todos" é mais um campo exigido.

Regras inegociáveis:
- **Resultado é sempre 0 ou 1.** Nunca uma lista, nunca sugestão de nomes parecidos, nunca autocomplete.
- **CPF nunca é armazenado em claro.** Guarda-se `HMAC-SHA256(chave = pepper_global, mensagem = salt_do_evento + cpf_normalizado)` (v1.1: HMAC no lugar de `sha256` de concatenação). A busca compara hashes. CPF é sempre campo de identidade, nunca campo de conteúdo do certificado. No máximo os 3 últimos dígitos ficam legíveis, e só para exibir confirmação ("CPF terminado em 145").
- **Nome é comparado normalizado** (minúsculas, sem acento, espaços colapsados) e precisa bater por inteiro. Nome parcial não encontra.
- **Rate limit** por evento, em dois baldes (v1.1): por **dispositivo** (cookie emitido na primeira visita), 5 tentativas por minuto e 20 por hora; por **IP**, contando só as falhas, 20 por minuto e 150 por hora. No dia do evento o auditório inteiro sai pelo mesmo IP, e um limite estreito por IP bloquearia todo mundo. Backoff progressivo por janelas aninhadas. Toda tentativa é registrada (IP em hash, sem PII).
- Encontrado: tela de confirmação com prévia visual do certificado, nome exibido em destaque, carga horária, tipo de participação e dois botões: **Baixar PDF** e **Meu nome está errado**. Já na fase 1 o segundo botão **grava o pedido na plataforma** (nome correto e contato) e notifica a organização por e-mail; nunca é `mailto:` nem link de WhatsApp. O que fica para a fase 2 (R11) é a tela de fila.
- Não encontrado: mensagem humana explicando as causas prováveis (nome diferente do da inscrição, evento errado, lista ainda incompleta) e um caminho de contato.

**Aceite**
- [ ] Busca por "maria" não retorna "Maria Eduarda Santos".
- [ ] Busca por "MARIA EDUARDA SANTOS" encontra "maria eduarda santos".
- [ ] 6ª tentativa do mesmo dispositivo no mesmo minuto recebe 429 com mensagem em pt-BR, e outro dispositivo no mesmo IP continua buscando.
- [ ] Nenhuma resposta da API expõe id de participante, contagem de resultados ou lista.
- [ ] O CPF em claro não existe em nenhuma tabela, log ou resposta.

#### R3. Geração do PDF sob demanda

O PDF é montado no momento do download, a partir do modelo em Supabase Storage mais os dados do participante. Nada é pré-gerado.

- **Fonte embutida obrigatória** (TTF/OTF via `@pdf-lib/fontkit`). As fontes padrão do PDF usam WinAnsi e quebram `ç`, `ã`, `õ`: qualquer implementação que dependa de `StandardFonts` está errada.
- **Ajuste automático de tamanho**: o texto encolhe até `font_size_min_pt` para caber na caixa definida. Abaixo disso, quebra em duas linhas. Nunca vaza da caixa, nunca corta com reticências no nome.
- Campos suportados: texto (de coluna do CSV, de campo do evento, ou do sistema), QR code, data formatada em pt-BR.
- Nome do arquivo: `certificado-{slug-do-evento}-{primeiro-nome}.pdf`.
- Template e fonte ficam em cache no escopo do módulo (lambda quente) e em cache HTTP com `ETag`; só os dados do participante variam por requisição.

**Aceite**
- [ ] "José Gonçalves de Assunção" renderiza com todos os acentos corretos.
- [ ] "Maria Eduarda dos Santos Albuquerque Pessoa Rodrigues" cabe na caixa sem vazar.
- [ ] Download de 100 requisições simultâneas não estoura a duração da função.
- [ ] O PDF abre corretamente em Chrome, Acrobat e no visualizador nativo do Android e do iOS.

#### R4. Editor de posicionamento de campos (admin)

Admin sobe a arte (PDF ou PNG/JPG de alta resolução) e posiciona os campos arrastando sobre a prévia renderizada.

- **Coordenadas normalizadas (0 a 1)** relativas à página, não pixels. Trocar a arte por uma versão em outra resolução não desalinha nada.
- Por campo: origem do dado, página, posição, caixa (largura e altura), alinhamento horizontal e vertical, fonte, tamanho, tamanho mínimo, peso, cor, transformação (maiúsculas, capitalização de nomes próprios em pt-BR).
- **Prévia ao vivo** com dados de teste, incluindo um botão "testar com o nome mais longo do evento".
- Suporte a modelo de duas páginas (frente e verso com conteúdo programático), comum em evento acadêmico.
- Fontes: conjunto curado (Poppins, Inter, Montserrat, Lora, Playfair Display) mais upload de TTF/OTF próprio.

**Aceite**
- [ ] Trocar a arte de 150 para 300 dpi mantém todos os campos no lugar.
- [ ] A prévia no editor é pixel-equivalente ao PDF gerado (tolerância de 1%).
- [ ] Modelo sem o campo obrigatório de nome não pode ser publicado.

#### R5. Importação de CSV (admin)

Assistente em quatro passos: upload, mapeamento, prévia, aplicação.

**As colunas são dinâmicas por modelo** (v1.1). Cada evento tem modelos diferentes, com campos diferentes, e não existe conjunto fixo de colunas que sirva a todos. Há duas classes de campo: os de **identidade**, de schema fixo (nome completo, CPF, data de nascimento, e-mail), que são os únicos usados na busca e na conciliação e que o admin não pode inventar; e os de **conteúdo**, que o próprio modelo declara (título da palestra, turma, orientador) com chave, rótulo, tipo, obrigatoriedade, padrão e formato. O conteúdo é gravado no **certificado**, não no participante: quem é palestrante e organizador no mesmo evento tem dois certificados com conteúdos diferentes. A validação é por linha, contra o modelo do tipo de participação daquela linha. O caminho principal é um CSV por tipo de participação; a planilha única com coluna de tipo é suportada. O mapeamento de colunas fica salvo no modelo e é clonado com ele.

Armadilhas que a implementação precisa tratar, não descobrir em produção:
- **Encoding**: Excel em pt-BR exporta em Windows-1252/ISO-8859-1, não UTF-8. Detectar e transcodificar. Sem isso todo acento vira `Ã§` silenciosamente.
- **Delimitador**: o padrão do Excel pt-BR é `;`, não `,`. Detectar.
- **BOM** no início do arquivo.
- Colunas com nomes inconsistentes entre planilhas ("Nome", "nome completo", "NOME DO ALUNO"): o mapeamento é explícito, feito pelo admin, e fica salvo como preset reutilizável no próximo evento.

Validações por linha: nome não vazio, CPF com dígito verificador válido quando presente, data em formato reconhecido, e-mail sintaticamente válido, duplicata dentro do próprio arquivo.

**Prévia obrigatória antes de aplicar**, mostrando: N a criar, N a atualizar, N inalterados, N com erro (com o número da linha e o motivo). Nada é escrito no banco antes do admin confirmar.

**Idempotência**: a chave de conciliação é o hash do CPF quando existe; depois nome normalizado mais data de nascimento; depois nome mais e-mail; por fim o nome. Reimportar o mesmo arquivo não duplica ninguém. **A importação nunca remove** (v1.1): quem está no banco e não veio no arquivo é apenas listado. Remover é ação manual, por lote, auditada, fora do fluxo de importação; certificado que já foi baixado ou cujo evento já foi liberado é revogado, não apagado.

**Aceite**
- [ ] CSV salvo pelo Excel pt-BR importa com acentos corretos, sem instrução ao admin.
- [ ] Reimportar o mesmo arquivo resulta em 0 criados e 0 atualizados.
- [ ] Linha com CPF inválido aparece na prévia com o número da linha e não bloqueia as demais.
- [ ] Erro na linha 400 de 500 não deixa o banco pela metade (transação única).

#### R6. Validação pública

Página `/validar` com campo de código e `/validar/{codigo}` com o resultado. O QR impresso no certificado aponta para a segunda.

Exibe: nome, evento, tipo de participação, carga horária, data do evento, data de emissão e situação (válido ou revogado, com a data da revogação). Não expõe CPF, e-mail nem qualquer outro dado.

**Código**: Crockford Base32 com 10 caracteres, agrupado visualmente (`XXXX-XXX-XXX`). O alfabeto exclui as letras `I`, `L`, `O` e `U`, e a decodificação aceita `O` como `0` e `I`/`L` como `1`. Legível em voz alta e tolerante ao erro de digitação mais comum.

**Aceite**
- [ ] Código inexistente mostra "não encontrado", não erro 500.
- [ ] Certificado revogado mostra estado próprio, distinto de inexistente.
- [ ] A página não expõe nenhum dado pessoal além do nome.
- [ ] Digitar `o` no lugar de `0` ainda encontra o certificado (normalização de entrada).

#### R7. Tipos de participação

Por evento: `participante`, `palestrante`, `organizador`, `monitor` (extensível). Cada tipo tem rótulo, carga horária padrão e pode ter modelo de certificado próprio. O CSV traz uma coluna de tipo; sem ela, todos entram como `participante`.

#### R8. Admin: autenticação e papéis

Supabase Auth com e-mail/senha e GitHub OAuth. Papéis `admin` e `editor`. Toda mutação passa pelo esqueleto de Server Action padrão (sessão → Zod → papel → operação → `audit_logs` → invalidação de cache) e é registrada com autor, entidade e diff.

#### R9. Identidade visual

Design system do cf-jobs aplicado por inteiro: mesmos tokens, Poppins e JetBrains Mono, tema escuro como padrão com alternador para claro persistido em cookie, header com logo mais alternador de tema mais "Entrar", footer da comunidade. Detalhe em `docs/03-design-system.md`.

### P1 · entra logo depois, não segura o lançamento

#### R10. Envio de e-mail em massa

Disparo para todos os participantes do evento com link direto e tokenizado (`/certificado/{token}`), que abre o certificado sem busca. O PDF **não vai anexado**: peso e reputação de entrega não compensam.

**Restrição real e dimensionante**: o plano gratuito do Resend entrega **100 e-mails por dia e 3.000 por mês**. Um evento de 250 pessoas leva 3 dias no plano gratuito. A implementação precisa de fila com agendamento e throttle configurável, não de um laço que dispara tudo e falha no 101º. O domínio `codingferpa.org` precisa de SPF e DKIM configurados antes do primeiro disparo.

Painel de envios com status por destinatário (enfileirado, enviado, entregue, bounce, falha) e botão de reenvio só para os que falharam.

#### R11. Fila de correção de nome

Aluno abre o pedido a partir da tela de retirada, informando o nome correto e um contato. Vai para uma fila no admin com o nome atual e o pedido lado a lado. Ao aprovar: o nome é atualizado, o `version` do certificado incrementa, **o código permanece o mesmo** e o evento entra no `audit_logs`. Certificados já baixados com o nome antigo continuam validando (a página de validação mostra sempre o dado atual).

#### R12. Revogação

Admin revoga com motivo obrigatório. O certificado para de ser gerado, a validação passa a exibir "revogado em {data}" e o link direto deixa de funcionar.

#### R13. "Meus certificados"

Busca única por CPF que retorna todos os certificados daquela pessoa em todos os eventos. Mesmo rate limit e mesmas regras de resultado exato da R2.

#### R14. Dashboard administrativo

Por evento: emitidos, retirados, taxa de retirada, retiradas ao longo do tempo, participantes que ainda não baixaram (com exportação da lista), pedidos de correção pendentes, e-mails entregues e bounces. Agregado: eventos, certificados no total, retirada média.

#### R15. Exportações

XLSX de participantes, XLSX de retiradas e PDF de relatório de evento para a coordenação do curso.

#### R16. LinkedIn "Add to profile"

Botão na tela de retirada. Formato vigente, conferido no gerador oficial `addtoprofile.linkedin.com` em 2026-09-21: `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME` com `name`, `organizationId` (ou `organizationName`, mutuamente exclusivos), `issueYear`, `issueMonth`, `certId` (o código de validação) e `certUrl` (a URL de validação). O formato antigo com `pfCertificationName` e token `_ed` é legado e foi descartado. A Coding Ferpa já tem página no LinkedIn (`https://www.linkedin.com/company/coding-ferpa/`), então o `organizationId` está disponível e é o caminho recomendado. Detalhe de implementação no [doc 09](09-frontend-e-seo.md).

### P2 · arquitetura deve permitir, não vamos construir agora

- Cache oportunista do PDF gerado no Storage (gerar uma vez, servir o cacheado nas próximas, invalidando quando o modelo ou o dado mudar). Só vira necessário com volume que hoje não existe.
- Check-in no dia do evento alimentando a lista de presença.
- Certificado com percentual mínimo de presença calculado pela plataforma.
- Página pública por participante (`/p/{slug}`) reunindo a trajetória na comunidade.
- Outras comunidades usando a mesma instância.
- Internacionalização (o público é 100% pt-BR).

## 7. Métricas de sucesso

**Indicadores rápidos (primeiras 2 semanas após um evento)**

| Métrica | Como medir | Sucesso | Ideal |
|---|---|---|---|
| Taxa de retirada | certificados baixados ÷ emitidos | ≥ 60% em 7 dias | ≥ 80% em 7 dias |
| Tempo até o download | primeiro acesso ao evento → download | mediana < 90s | mediana < 45s |
| Busca sem resultado | buscas sem match ÷ buscas totais | < 15% | < 8% |
| Pedidos de correção | pedidos ÷ certificados emitidos | < 5% | < 2% |
| Erro na geração | falhas de PDF ÷ downloads | 0 | 0 |

**Indicadores lentos (ao longo dos eventos)**

| Métrica | Sucesso |
|---|---|
| Trabalho manual do admin por evento | < 15 min do CSV pronto ao "certificados disponíveis" |
| Mensagens de suporte sobre certificado | queda de ≥ 80% contra o processo atual |
| Tempo para cadastrar um novo evento | < 20 min, feito por alguém que não é dev |
| Validações externas | ≥ 1 validação pública por 20 certificados emitidos (sinal de que a instituição está usando) |

## 8. Questões em aberto

**Bloqueantes (precisam de resposta antes da arquitetura fechar)**

1. **[Edu / organização]** O Ferpa Tech Day já tem a planilha de presença? Com quais colunas exatamente? Um arquivo real vale mais que a especificação inteira desta seção.
2. **[Edu / organização]** O evento coleta CPF na inscrição, ou só nome e e-mail? Isso decide se a busca por CPF entra no v1 ou vira configuração ociosa.
3. **[Edu]** A arte do certificado já existe? Em que formato (PDF vetorial, PNG, arquivo do Canva)? O editor de posicionamento é a parte mais cara de construir e a arte real define quantos campos ele precisa suportar.
4. **[Edu]** Quantos participantes o primeiro evento terá? Abaixo de 100 o envio por e-mail cabe no plano gratuito do Resend; acima, decide-se entre plano pago (~US$20/mês) e disparo escalonado.

**Não bloqueantes (resolvem durante a implementação)**

5. **[Edu]** Os certificados devem ter numeração sequencial por evento além do código de validação? Algumas secretarias pedem.
6. **[Organização]** Existe texto jurídico padrão que precisa aparecer no verso (conteúdo programático, portaria, assinatura do coordenador)?
7. **[Edu]** A Coding Ferpa tem página de empresa no LinkedIn? Sem ela o botão "Add to profile" não funciona direito.
8. **[Engenharia]** Vale abrir o repositório desde o commit inicial (como o cf-jobs) ou deixar privado até o primeiro evento rodar?

## 9. Faseamento

**Fase 1, o Ferpa Tech Day precisa disso e nada mais.** R1 a R9. Uma entrega que funciona ponta a ponta para um evento real: catálogo, busca, PDF, editor de campos, CSV, validação, admin.

**Fase 2, o que o primeiro evento vai provar que falta.** R10 a R13 (e-mail, correção de nome, revogação, meus certificados).

**Fase 3, operação madura.** R14 a R16 (dashboard, exportações, LinkedIn).

**Prazo real**: a Fase 1 precisa estar de pé antes da data em que os certificados do Ferpa Tech Day forem prometidos. Esse é o único prazo duro do projeto, e ele deve ser confirmado com a organização antes de a arquitetura começar.

## 10. Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Editor de posicionamento é a peça mais cara e pode consumir a fase 1 inteira | Alto | Construir primeiro a versão por formulário (coordenadas numéricas com prévia), e só depois o arrastar. O gerador de PDF não deve saber qual das duas produziu os números. |
| Nome no CSV diferente do nome que o aluno digita | Alto e certo | Normalização agressiva na comparação, mais a fila de correção. Aceitar que uma fração vai falhar e dar caminho de saída. |
| Lista de participantes vazando por enumeração | Médio, mas é LGPD | Resultado exato, sem lista, rate limit, CPF só em hash, tentativas auditadas. |
| Plano gratuito do Resend não comporta o evento | Médio | Fila com throttle desde o início; o link direto é uma conveniência, a busca é o caminho principal. |
| Acento quebrado no PDF descoberto em produção | Alto (constrangimento público) | Teste automatizado que gera um PDF com `José Gonçalves de Assunção` e verifica o texto extraído, rodando no CI. |
| Ninguém além do Edu consegue cadastrar um evento | Médio | Admin em pt-BR, com textos de ajuda, testado com alguém da organização antes do evento. |

## 11. Histórico de versões

**1.1 (setembro de 2026, revisão de arquitetura).** Decisões e justificativas completas em `docs/` e `docs/adr/`.

| Mudança | Onde |
|---|---|
| Data de nascimento deixa de ser chave de busca independente: só segundo fator | R2, história 2, `docs/adr/0009` |
| Rate limit em dois baldes (dispositivo e IP) | R2, `docs/adr/0006` |
| HMAC-SHA256 no lugar de `sha256` de concatenação | R2, `docs/adr/0005` |
| Colunas de CSV dinâmicas, declaradas pelo modelo; conteúdo gravado no certificado; CPF nunca é campo de conteúdo | R5, `docs/adr/0004` |
| Importação nunca remove; remoção manual explícita | R5, `docs/adr/0007` |
| Pedido de correção de nome gravado na plataforma desde a fase 1 (a fila continua no R11) | R2 |
| CPF impresso no certificado só mascarado (`***.***.**1-45`); CPF completo é decisão futura | `docs/05` |
| O critério "pixel-equivalente com tolerância de 1%" do R4 é garantido por construção e verificado por números, sem rasterizador | `docs/adr/0003` |
| R16: os parâmetros do LinkedIn citados são do formato legado; conferir o formato vigente antes de implementar | `docs/09` |
| Questão aberta 8 respondida: repositório público desde o commit inicial | `docs/12` |
| Nova questão em aberto, de peso igual à da planilha: quantos modelos de certificado o primeiro evento terá e quais campos de conteúdo cada um pede | `docs/00` |
