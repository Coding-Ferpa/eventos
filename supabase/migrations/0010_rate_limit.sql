-- 0010 · Rate limit em Postgres (docs 04 e 08, ADR-0006)
--
-- A função é a do CF Jobs, com um parâmetro a mais: `increment = 0` consulta
-- sem consumir. É o que permite o balde de IP contar só falhas: a rota
-- consulta antes de buscar e consome depois, só se a busca falhou.
--
-- Sem Redis: quem conta é o Postgres, com `on conflict` atômico, e o limite
-- vale para todas as instâncias da função ao mesmo tempo.

create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  request_count integer not null default 0,
  primary key (key, window_start)
);

create index rate_limits_window_idx on public.rate_limits (window_start);

-- Sem policy nenhuma: quem enxerga o contador é só a função abaixo, que é
-- `security definer`.
alter table public.rate_limits enable row level security;

-- Janela deslizante em dez sub-baldes. Parâmetros OUT em vez de `returns
-- table` para devolver uma linha só, e não um conjunto, o que permite
-- `(check_rate_limit(...)).allowed` dentro de outra expressão.
--
-- Na consulta, a pergunta é "cabe mais uma?"; no consumo, "esta coube?".
-- Com a mesma pergunta nos dois casos, o balde de IP deixaria passar uma
-- falha a mais que o limite.
create function public.check_rate_limit(
  rate_key text,
  max_requests integer,
  window_size interval,
  increment integer default 1,
  out allowed boolean,
  out remaining integer,
  out reset_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  bucket_seconds double precision := greatest(extract(epoch from window_size) / 10, 1);
  bucket timestamptz;
  total integer;
  oldest timestamptz;
begin
  if increment not in (0, 1) then
    raise exception 'increment precisa ser 0 (consulta) ou 1 (consumo), recebeu %', increment
      using errcode = '22023';
  end if;

  if increment = 1 then
    bucket := to_timestamp(
      floor(extract(epoch from clock_timestamp()) / bucket_seconds) * bucket_seconds
    );

    insert into public.rate_limits (key, window_start, request_count)
    values (rate_key, bucket, 1)
    on conflict (key, window_start)
      do update set request_count = public.rate_limits.request_count + 1;
  end if;

  select coalesce(sum(rl.request_count), 0), min(rl.window_start)
    into total, oldest
    from public.rate_limits rl
   where rl.key = rate_key
     and rl.window_start > clock_timestamp() - window_size;

  if increment = 1 then
    -- Baldes velhos desta chave saem junto.
    delete from public.rate_limits as rl
     where rl.key = rate_key
       and rl.window_start < clock_timestamp() - (window_size * 2);
    allowed := total <= max_requests;
  else
    allowed := total < max_requests;
  end if;

  remaining := greatest(max_requests - total, 0);
  -- A janela é deslizante: abre espaço quando o balde mais antigo sai dela.
  reset_at := coalesce(oldest, clock_timestamp()) + window_size;
end;
$$;

-- A exceção documentada no doc 04: executável por `anon`, que é como o CF
-- Jobs a chama. Aqui a Data API fica desligada (ADR-0012) e a aplicação a
-- chama pela conexão do servidor, mas a função não destrói nada e o
-- `increment` só aceita 0 ou 1. Sem `revoke`, de propósito.

-- A limpeza por chave, dentro da função, não alcança chave que nunca mais
-- volta, e as chaves de IP e de dispositivo giram todo dia (doc 08). Esta
-- poda (agendada em 0013) remove qualquer balde com mais de dois dias, o dobro
-- da maior janela usada, que é a de um dia.
create function public.prune_rate_limits()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  removidos integer;
begin
  delete from public.rate_limits where window_start < now() - interval '2 days';
  get diagnostics removidos = row_count;
  return removidos;
end;
$$;

revoke execute on function public.prune_rate_limits() from anon, authenticated, public;
