import { z } from 'zod'
import ptBR from 'zod/v4/locales/pt-BR.js'

/**
 * O Zod do projeto, com o locale pt-BR já aplicado (doc 02).
 *
 * A UI é pt-BR por princípio, mas as mensagens embutidas do Zod saem em
 * inglês, e elas aparecem em toda validação que não escreve a própria
 * mensagem: `z.uuid()`, `z.url()`, faixas numéricas.
 *
 * Por que aqui e não no `instrumentation.ts`, que seria o lugar natural de uma
 * configuração global: `z.config()` altera um registro de módulo, e o Next
 * compila `instrumentation.ts` em um bundle separado do das rotas, cada um com
 * a sua cópia do Zod. Configurar no módulo que os schemas importam é o que
 * garante ser a mesma instância (ADR-0016 do CF Jobs, herdado pelo ADR-0001).
 *
 * Uma regra do ESLint recusa importar `zod` direto fora deste arquivo: sem
 * ela, um schema novo voltaria a falar inglês sem ninguém perceber.
 *
 * Mensagem manual continua valendo onde ela diz mais que o locale. "Confira se
 * o nome está igual ao da inscrição." orienta; "Pequeno demais: esperava que o
 * texto tivesse >= 3 caracteres" apenas descreve.
 *
 * O locale é o `pt-BR`, e não o `pt`. Até a 4.4.3 só existia o `pt`, e ele era
 * brasileiro ("Muito grande"). Na 4.5.0 o `pt` foi reescrito em português de
 * Portugal ("Demasiado grande", "ficheiro", "registo") e nasceu o `pt-BR`,
 * com "arquivo". Quem sobe o Zod de 4.4 para 4.5 sem trocar o locale passa a
 * mostrar "ficheiro" para o participante. O arquivo é
 * importado direto, e não por `z.locales`, porque `z.locales` é um barril com
 * todos os idiomas do Zod, e nenhum empacotador consegue podá-lo.
 */
z.config(ptBR())

export { z }
