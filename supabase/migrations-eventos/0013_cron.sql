-- 0013 · Agendamentos do pg_cron (doc 04)
--
-- Horários em UTC. O `pg_cron` roda dentro do banco e funciona mesmo com a
-- Vercel fora do ar; nenhum destes jobs chama a aplicação. O primeiro que
-- chama, o despacho da fila de e-mail, chega no M11.
--
-- Os nomes têm prefixo do projeto para não colidir com job de outro sistema
-- no mesmo banco, e `cron.schedule` com nome já existente atualiza em vez de
-- duplicar.

-- 03:30 UTC é 00:30 em São Paulo: o dia anterior de quem organiza acabou de
-- terminar (doc 10).
select cron.schedule(
  'cf-eventos:rollup-estatisticas',
  '30 3 * * *',
  $$select eventos.rollup_event_stats(((now() at time zone 'America/Sao_Paulo')::date - 1))$$
);

select cron.schedule(
  'cf-eventos:podar-staging',
  '0 4 * * *',
  $$select eventos.prune_import_staging()$$
);

-- Não está na lista do doc 04: a poda global de rate limit é acréscimo do
-- M1, explicado em 0010.
select cron.schedule(
  'cf-eventos:podar-rate-limit',
  '45 4 * * *',
  $$select eventos.prune_rate_limits()$$
);

-- Semanal, aos domingos: o prazo é de 90 dias e não há pressa.
select cron.schedule(
  'cf-eventos:podar-observabilidade',
  '15 4 * * 0',
  $$select eventos.prune_observability()$$
);

-- Mensal: o prazo é de cinco anos.
select cron.schedule(
  'cf-eventos:minimizar-participantes',
  '0 5 1 * *',
  $$select eventos.minimize_old_participants()$$
);
