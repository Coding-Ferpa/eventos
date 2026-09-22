import { z } from 'zod'
import pt from 'zod/v4/locales/pt.js'

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
 * o nome está igual ao da inscrição." orienta; "Muito pequeno: esperado que
 * string tivesse >=1 caracteres" apenas descreve.
 *
 * O locale vem do arquivo dele, e não de `z.locales.pt()`: `z.locales` é um
 * barril com todos os idiomas do Zod, e nenhum empacotador consegue podá-lo.
 */
z.config(pt())

export { z }
