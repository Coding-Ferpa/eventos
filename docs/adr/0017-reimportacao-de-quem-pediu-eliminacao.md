# ADR-0017 · Reimportação de quem pediu eliminação

- **Status:** proposta, aguardando decisão do mantenedor
- **Data:** 2026-10-02
- **Autores:** Claude (achado na implementação do M7)

## Contexto

Dois documentos prometem coisas que não cabem juntas.

- O doc 06, nas regras de escrita: "Certificado `revoked` ou `erased` nunca é atualizado nem recriado pela importação: a linha vira `skipped` com o aviso `CERTIFICATE_REVOKED`."
- O doc 08, na eliminação a pedido do titular: o participante é apagado, os certificados viram lápide com `participant_id = null` e `data = '{}'`, e "ficam o código, o tipo e as datas, sem nenhum dado pessoal". A função `erase_participant` apaga também as linhas de staging que citam a pessoa.

Para pular a linha de quem foi eliminado, a importação precisa reconhecer a pessoa. Depois da eliminação, nada a reconhece: não há nome, CPF, e-mail nem data de nascimento em lugar nenhum, de propósito. Reimportar a planilha original do evento recria a pessoa com um certificado novo, e ela volta a ser encontrável na busca, que é exatamente o que ela pediu para não acontecer.

O caso `revoked` não tem o problema: o participante continua existindo, a conciliação o encontra, e a linha vira `skipped`. Só o `erased` é impossível como está escrito.

## Opções

**A. Lista de supressão por evento.** A eliminação grava o que basta para reconhecer a pessoa numa reimportação: o `cpf_hash`, quando existe, e um HMAC do nome normalizado com a data de nascimento ou o e-mail. A importação marca a linha como `skipped` com um aviso próprio.
- A favor: cumpre a promessa do doc 06 ao pé da letra.
- Contra: guarda dado pessoal pseudonimizado justamente de quem pediu para sair, e muda a frase "sem nenhum dado pessoal" do doc 08. Exige base legal registrada pelo encarregado (o exercício regular de direitos e a própria garantia da eliminação são candidatos, mas a decisão é jurídica, não técnica). Quem não tinha CPF, nascimento nem e-mail na primeira importação continua impossível de reconhecer.

**B. Sem identificador, com aviso na prévia (recomendada).** A eliminação continua sem deixar rastro pessoal. A importação não tem como reconhecer a pessoa e diz isso: quando o evento tem certificados eliminados, a prévia mostra "este evento tem N certificados removidos a pedido do titular; confira se a planilha não traz essas pessoas de volta". O runbook da eliminação ganha um passo: tirar a pessoa da planilha-fonte do evento. O doc 06 passa a dizer que só `revoked` vira `skipped`.
- A favor: mantém a eliminação completa, que é a promessa mais forte e a que tem consequência legal; não cria uma tabela de dado pessoal nova; custa uma contagem.
- Contra: depende do admin ler o aviso e corrigir a planilha. O aviso não diz quem, porque não sabe.

**C. Bloquear a reimportação inteira** de evento com certificado eliminado até o admin confirmar. É a B com atrito obrigatório; não muda o que o sistema sabe, só a chance de o aviso ser lido.

## Recomendação

B. A eliminação a pedido do titular é rara, a reimportação depois dela é mais rara ainda, e o lugar certo para a correção é a planilha de onde a pessoa veio. Uma lista de supressão é dado pessoal novo sobre a pessoa que pediu para não estar no sistema, e essa troca não deveria ser feita por conveniência técnica.

## Enquanto não houver decisão

A implementação do M7 trata `revoked` como o doc 06 manda e não acrescenta nada para `erased`: nem a lista da opção A, nem o aviso da opção B. As duas opções entram depois sem retrabalho, porque a conciliação já tem o ponto em que a linha vira `skipped`.
