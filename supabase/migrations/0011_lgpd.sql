-- 0011 · Eliminação a pedido do titular e minimização por prazo (doc 08)

-- ---------------------------------------------------------------------------
-- Eliminação
-- ---------------------------------------------------------------------------

-- Tudo numa transação, pela action `eraseParticipant` (papel admin), que
-- grava a própria entrada de auditoria com o ator e a data, sem o nome.
--
-- Os certificados viram lápide, e não somem: um papel que circula por aí não
-- pode virar "código inexistente", que sugere fraude, nem continuar exibindo
-- o nome de quem pediu para sair. A lápide guarda o código, o tipo, a carga
-- horária e as datas; nenhum dado pessoal. O motivo de revogação sai junto,
-- porque ele pode citar o nome.
--
-- Devolve quantos certificados viraram lápide. Pessoa inexistente é erro: o
-- runbook precisa saber se ela estava lá. Tokens de acesso e entregas de
-- e-mail entram nesta limpeza no M11, junto com as tabelas.
create function public.erase_participant(p_participant uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  alvo public.participants%rowtype;
  certificados uuid[];
  pedidos uuid[];
  lapides integer;
begin
  select * into alvo from public.participants where id = p_participant for update;
  if not found then
    raise exception 'Participante % não encontrado.', p_participant using errcode = 'P0002';
  end if;

  select coalesce(array_agg(id), '{}') into certificados
    from public.certificates where participant_id = p_participant;
  select coalesce(array_agg(id), '{}') into pedidos
    from public.name_correction_requests where certificate_id = any (certificados);

  -- A auditoria fica, porque ela prova que houve operação; o conteúdo que cita
  -- a pessoa sai.
  update public.audit_logs
     set diff = '{"scrubbed": true}'
   where (entity = 'participants' and entity_id = p_participant)
      or (entity = 'certificates' and entity_id = any (certificados))
      or (entity = 'name_correction_requests' and entity_id = any (pedidos));

  delete from public.name_correction_requests where id = any (pedidos);

  -- Linha de staging que casou com a pessoa, e qualquer outra do mesmo evento
  -- com o mesmo nome ou o mesmo CPF, que ainda não tenha sido conciliada.
  delete from public.import_rows r
   using public.import_batches b
   where r.batch_id = b.id
     and b.event_id = alvo.event_id
     and (
       r.matched_participant_id = p_participant
       or r.full_name_normalized = alvo.full_name_normalized
       or (alvo.cpf_hash is not null and r.cpf_hash = alvo.cpf_hash)
     );

  update public.certificates
     set status = 'erased',
         participant_id = null,
         data = '{}',
         revoked_at = null,
         revoked_reason = null,
         revoked_by = null
   where id = any (certificados);
  get diagnostics lapides = row_count;

  delete from public.participants where id = p_participant;

  return lapides;
end;
$$;

revoke execute on function public.erase_participant(uuid) from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- Minimização por prazo (agendada em 0013)
-- ---------------------------------------------------------------------------

-- Cinco anos depois do evento, os dados que só servem para buscar saem: CPF,
-- nascimento e e-mail. Cinco anos cobrem a graduação inteira, que é quando as
-- horas complementares são lançadas (doc 08). O nome fica, porque é o que o
-- certificado afirma, e o certificado segue validável pelo código. Devolve
-- quantas pessoas foram minimizadas.
create function public.minimize_old_participants()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  minimizadas integer;
begin
  update public.participants p
     set cpf_hash = null,
         cpf_last3 = null,
         birth_date = null,
         email = null
    from public.events e
   where e.id = p.event_id
     and coalesce(e.ends_at, e.starts_at) < now() - interval '5 years'
     and (p.cpf_hash is not null or p.birth_date is not null or p.email is not null);
  get diagnostics minimizadas = row_count;

  return minimizadas;
end;
$$;

revoke execute on function public.minimize_old_participants() from anon, authenticated, public;
