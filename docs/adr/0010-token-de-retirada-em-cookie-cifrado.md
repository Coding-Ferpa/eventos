# ADR-0010 · Token de retirada como cookie cifrado, sem estado

- **Status:** aceita
- **Data:** 2026-09-20
- **Autores:** mantenedor e sessão de arquitetura

## Contexto
Depois de uma busca bem-sucedida, o aluno precisa ver a prévia, baixar o PDF e, se for o caso, pedir correção, sem login. O PRD exige que nenhuma resposta exponha id de participante. O código de validação não pode ser a credencial de download: ele é público por desígnio (está impresso e qualquer validador o tem), e o endpoint de PDF é o mais caro do sistema. O download precisa funcionar como link comum, inclusive no iOS.

## Decisão
O sucesso da busca emite o cookie `cf-retirada`: payload `{ v: 1, pids: string[], src, exp }` **cifrado com AES-256-GCM** (`RETRIEVAL_COOKIE_KEY`, IV aleatório por emissão), `HttpOnly`, `Secure`, `SameSite=Lax`, validade de **30 minutos**. Ele autoriza a tela de retirada, o download e o pedido de correção dos certificados dos participantes listados. O link direto por e-mail (P1) troca o token longo pelo mesmo cookie e redireciona, tirando o token da URL.

A URL do download usa o código de validação (`/api/certificados/{codigo}/pdf`); a autorização vem do cookie: código de outra pessoa responde 404, igual a código inexistente. O download sempre relê a situação do certificado, o que cobre a revogação dentro da janela do cookie.

## Consequências
- Positivas: opaco de verdade (cifrado, não só assinado); sem tabela de sessões para criar, consultar e limpar; nada sensível em URL, histórico, log de acesso ou `Referer`; um formato só para busca, link por e-mail e "meus certificados" (`pids` já é lista).
- Negativas e trade-offs aceitos: não há como revogar um cookie específico antes dos 30 minutos (mitigado pela releitura do estado); trocar de navegador perde a sessão e exige nova busca, por isso o aviso de navegador embutido aparece **antes** da busca; rotacionar a chave derruba as sessões em voo (30 minutos de impacto).

## Alternativas consideradas
- **Token na URL ou no corpo JSON, guardado pelo cliente:** vaza em histórico e log, e quebra ao recarregar a página.
- **Cookie assinado (HMAC) com o id em claro:** o id ficaria legível no navegador, contra o critério do PRD.
- **Sessão em tabela (`retrieval_sessions`):** revogável, mas acrescenta escrita, leitura e poda no caminho do pico, para uma credencial de 30 minutos.
- **Código de validação como credencial:** qualquer validador baixaria o PDF, e o endpoint caro ficaria aberto.
