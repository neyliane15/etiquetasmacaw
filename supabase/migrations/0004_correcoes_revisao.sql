-- =============================================================================
-- Etiquetas Macaw — 0004_correcoes_revisao.sql (Agente Revisor)
-- Correções de segurança/integridade apontadas em docs/RELATORIO_TESTES.md e
-- na revisão (docs/REVISAO.md). Aplicar DEPOIS de 0001 → 0002 → 0003.
-- Idempotente: pode ser reaplicado (sempre na ordem 0001 → 0004).
--
-- Conceito central: "cliente" = comando executado diretamente pela API
-- (PostgREST) com o papel `authenticated`/`anon`. RPCs `security definer`
-- rodam como o dono (postgres) e, portanto, NÃO são "cliente"; processos de
-- servidor (service role, SQL editor) também não. Os triggers de guarda abaixo
-- NÃO são security definer justamente para enxergar o `current_user` real.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Helpers
-- -----------------------------------------------------------------------------
-- Usuário logado com perfil ativo (qualquer papel)
create or replace function public.tem_perfil_ativo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.meu_papel() is not null;
$$;

-- Gestor pode gerir itens de um checklist (global → só admin)
create or replace function public.pode_gerir_checklist(p_checklist_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_gestor() and exists (
    select 1 from public.checklists c
     where c.id = p_checklist_id
       and case when c.unidade_id is null then public.is_admin()
                else public.tem_acesso_unidade(c.unidade_id) end
  );
$$;

-- Código curto: security definer para checar colisão em TODAS as unidades
-- (antes a RLS escondia etiquetas de outras unidades → 23505 em colisão).
create or replace function public.gerar_codigo_etiqueta()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_alfabeto constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_tam      constant int  := length(v_alfabeto);
  v_bytes    bytea;
  v_codigo   text;
  i          int;
begin
  loop
    -- gen_random_uuid() é nativa do Postgres (13+): não depende do pgcrypto,
    -- que no Supabase fica no schema "extensions" (fora do search_path da função).
    v_bytes  := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    v_codigo := '';
    for i in 0..7 loop
      v_codigo := v_codigo || substr(v_alfabeto, (get_byte(v_bytes, i) % v_tam) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.etiquetas e where e.codigo = v_codigo);
  end loop;
  return v_codigo;
end;
$$;

-- Regras de prazo de uma etiqueta (emissão direta e derivada).
--  * manipulação no máximo 1 h no futuro (tolerância de relógio);
--  * não gestor: manipulação retroativa de no máximo 7 dias;
--  * validade total máxima de 365 dias (8760 h) para qualquer papel;
--  * não gestor: validade não pode exceder o padrão do produto para o método.
create or replace function public.validar_prazo_etiqueta(
  p_produto_id uuid,
  p_metodo public.metodo_conservacao,
  p_manipulacao timestamptz,
  p_validade timestamptz
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_gestor boolean := public.is_gestor() or auth.uid() is null;
  v_horas  numeric;
  v_padrao int;
begin
  if p_manipulacao is null or p_validade is null then
    return;
  end if;
  if p_manipulacao > now() + interval '1 hour' then
    raise exception 'A data de manipulação não pode estar no futuro.' using errcode = '22023';
  end if;
  if not v_gestor and p_manipulacao < now() - interval '7 days' then
    raise exception 'Manipulação com mais de 7 dias atrás: somente gerente ou administrador pode emitir.'
      using errcode = '42501';
  end if;
  v_horas := extract(epoch from (p_validade - p_manipulacao)) / 3600.0;
  if v_horas > 8760 then
    raise exception 'Validade máxima de 365 dias excedida.' using errcode = '22023';
  end if;
  if not v_gestor then
    v_padrao := public.validade_padrao_horas(p_produto_id, p_metodo);
    if v_padrao is not null and v_horas > v_padrao + 0.01 then
      raise exception 'Validade de % h acima do padrão do produto para este método (% h). Somente gerente ou administrador pode estender.',
        round(v_horas, 1), v_padrao using errcode = '42501';
    end if;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Cadastro de usuários: o trigger NÃO confia no metadata do signUp
--    1º usuário → admin ativo (bootstrap). Demais → cozinheiro, sem unidade,
--    INATIVO até um admin liberar (admin_definir_perfil / Edge Function).
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta  jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_email text  := coalesce(new.email, new.id::text || '@sem-email.local');
  v_admin boolean;
begin
  perform pg_advisory_xact_lock(hashtext('macaw.handle_new_user'));
  v_admin := not exists (select 1 from public.perfis where papel = 'admin');

  insert into public.perfis (id, nome, email, papel, unidade_id, ativo)
  values (
    new.id,
    coalesce(nullif(btrim(left(v_meta->>'nome', 120)), ''), split_part(v_email, '@', 1)),
    v_email,
    case when v_admin then 'admin' else 'cozinheiro' end::public.papel_usuario,
    null,
    v_admin
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- RPC: admin define papel, unidade, situação (e nome) de um usuário.
create or replace function public.admin_definir_perfil(
  p_user_id uuid,
  p_papel public.papel_usuario,
  p_unidade_id uuid,
  p_ativo boolean default true,
  p_nome text default null
)
returns public.perfis
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.perfis;
begin
  if not public.is_admin() then
    raise exception 'Somente administradores podem definir perfis.' using errcode = '42501';
  end if;
  if p_papel is null then
    raise exception 'Informe o papel.' using errcode = '22023';
  end if;
  if p_papel <> 'admin' and p_unidade_id is null then
    raise exception 'Gerentes e cozinheiros precisam de uma unidade.' using errcode = '22023';
  end if;
  if p_unidade_id is not null and not exists (select 1 from public.unidades where id = p_unidade_id) then
    raise exception 'Unidade inexistente.' using errcode = '22023';
  end if;
  if p_user_id = auth.uid() and (p_papel <> 'admin' or not coalesce(p_ativo, true)) then
    raise exception 'Você não pode rebaixar ou bloquear o próprio usuário.' using errcode = '42501';
  end if;

  update public.perfis
     set papel = p_papel,
         unidade_id = p_unidade_id,
         ativo = coalesce(p_ativo, true),
         nome = coalesce(nullif(btrim(p_nome), ''), nome)
   where id = p_user_id
  returning * into v;

  if not found then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;
  return v;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Políticas de leitura de dados globais exigem perfil ativo
--    (usuário recém-cadastrado/inativo não lê catálogo, fornecedores, unidades)
-- -----------------------------------------------------------------------------
drop policy if exists unidades_select on public.unidades;
create policy unidades_select on public.unidades
  for select to authenticated using (public.tem_perfil_ativo());
drop policy if exists categorias_select on public.categorias;
create policy categorias_select on public.categorias
  for select to authenticated using (public.tem_perfil_ativo());
drop policy if exists fornecedores_select on public.fornecedores;
create policy fornecedores_select on public.fornecedores
  for select to authenticated using (public.tem_perfil_ativo());

do $$
declare
  t text;
begin
  foreach t in array array['produtos', 'modelos_etiqueta', 'checklists'] loop
    execute format('drop policy if exists %1$s_select on public.%1$I', t);
    execute format($p$
      create policy %1$s_select on public.%1$I
        for select to authenticated
        using ((unidade_id is null and public.tem_perfil_ativo())
               or public.tem_acesso_unidade(unidade_id))
    $p$, t);
  end loop;
end;
$$;

-- checklist_itens: gestão restrita ao checklist da própria unidade (global → admin)
drop policy if exists checklist_itens_select on public.checklist_itens;
create policy checklist_itens_select on public.checklist_itens
  for select to authenticated using (
    exists (
      select 1 from public.checklists c
      where c.id = checklist_itens.checklist_id
        and ((c.unidade_id is null and public.tem_perfil_ativo())
             or public.tem_acesso_unidade(c.unidade_id))
    )
  );
drop policy if exists checklist_itens_insert on public.checklist_itens;
create policy checklist_itens_insert on public.checklist_itens
  for insert to authenticated with check (public.pode_gerir_checklist(checklist_id));
drop policy if exists checklist_itens_update on public.checklist_itens;
create policy checklist_itens_update on public.checklist_itens
  for update to authenticated
  using (public.pode_gerir_checklist(checklist_id))
  with check (public.pode_gerir_checklist(checklist_id));
drop policy if exists checklist_itens_delete on public.checklist_itens;
create policy checklist_itens_delete on public.checklist_itens
  for delete to authenticated using (public.pode_gerir_checklist(checklist_id));

-- -----------------------------------------------------------------------------
-- 4. etiqueta_movimentacoes: histórico imutável (só triggers/RPCs gravam)
-- -----------------------------------------------------------------------------
drop policy if exists etiqueta_movimentacoes_insert on public.etiqueta_movimentacoes;
revoke insert, update, delete, truncate on public.etiqueta_movimentacoes from authenticated, anon;

-- -----------------------------------------------------------------------------
-- 5. etiquetas: guarda de escrita direta pelo cliente
--    INSERT: status ativa, responsável/created_by = usuário, sem origem
--            (derivação só por RPC), referências da mesma unidade, prazo válido.
--    UPDATE: somente `observacoes` e `modelo_id`. Status, validade, método etc.
--            mudam apenas pelas RPCs (dar_baixa, derivada, reimpressão, vencidas).
-- -----------------------------------------------------------------------------
create or replace function public.etiquetas_guarda_cliente()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_manip    timestamptz;
  v_horas    int;
  v_validade timestamptz;
  v_campos   text[];
begin
  if current_user not in ('authenticated', 'anon') then
    return new;  -- RPC security definer / servidor
  end if;

  if tg_op = 'INSERT' then
    if new.status is distinct from 'ativa' then
      raise exception 'Etiquetas são emitidas como ativas; baixas só pela ação "Dar baixa".'
        using errcode = '42501';
    end if;
    if new.etiqueta_origem_id is not null then
      raise exception 'Etiquetas derivadas devem ser emitidas por emitir_etiqueta_derivada.'
        using errcode = '42501';
    end if;
    new.impressoes := 0;
    new.status_em  := null;
    new.status_por := null;
    new.created_by := auth.uid();
    if new.responsavel_id is null or not public.is_gestor() then
      new.responsavel_id := auth.uid();
    elsif new.responsavel_id <> auth.uid() and not exists (
      select 1 from public.perfis p
       where p.id = new.responsavel_id and p.ativo
         and (p.unidade_id = new.unidade_id or p.unidade_id is null)
    ) then
      raise exception 'Responsável inválido para esta unidade.' using errcode = '42501';
    end if;
    new.responsavel_nome := null;  -- snapshot refeito pelo trigger de emissão

    if new.produto_id is not null and not exists (
      select 1 from public.produtos p
       where p.id = new.produto_id and (p.unidade_id is null or p.unidade_id = new.unidade_id)
    ) then
      raise exception 'Produto não disponível nesta unidade.' using errcode = '42501';
    end if;
    if new.modelo_id is not null and not exists (
      select 1 from public.modelos_etiqueta m
       where m.id = new.modelo_id and (m.unidade_id is null or m.unidade_id = new.unidade_id)
    ) then
      raise exception 'Modelo de etiqueta não disponível nesta unidade.' using errcode = '42501';
    end if;
    if new.recebimento_item_id is not null and not exists (
      select 1 from public.recebimento_itens ri
        join public.recebimentos r on r.id = ri.recebimento_id
       where ri.id = new.recebimento_item_id and r.unidade_id = new.unidade_id
    ) then
      raise exception 'Item de recebimento não pertence a esta unidade.' using errcode = '42501';
    end if;

    v_manip    := coalesce(new.data_manipulacao, now());
    v_horas    := coalesce(new.validade_horas, public.validade_padrao_horas(new.produto_id, new.metodo));
    v_validade := coalesce(new.data_validade,
                           case when v_horas is not null then v_manip + make_interval(hours => v_horas) end);
    perform public.validar_prazo_etiqueta(new.produto_id, new.metodo, v_manip, v_validade);
    return new;
  end if;

  -- UPDATE direto: só campos editoriais
  select array_agg(n.key order by n.key)
    into v_campos
    from jsonb_each(to_jsonb(new)) n
    join jsonb_each(to_jsonb(old)) o on o.key = n.key
   where n.value is distinct from o.value
     and n.key not in ('observacoes', 'modelo_id', 'updated_at');
  if v_campos is not null then
    raise exception 'Campos % da etiqueta só mudam pelas ações do sistema (baixa, derivação, reimpressão).',
      array_to_string(v_campos, ', ') using errcode = '42501';
  end if;
  if new.modelo_id is distinct from old.modelo_id and new.modelo_id is not null and not exists (
    select 1 from public.modelos_etiqueta m
     where m.id = new.modelo_id and (m.unidade_id is null or m.unidade_id = new.unidade_id)
  ) then
    raise exception 'Modelo de etiqueta não disponível nesta unidade.' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- "0" no nome: dispara antes de trg_etiquetas_before_write (ordem alfabética)
drop trigger if exists trg_etiquetas_0_guarda on public.etiquetas;
create trigger trg_etiquetas_0_guarda
  before insert or update on public.etiquetas
  for each row execute function public.etiquetas_guarda_cliente();

-- -----------------------------------------------------------------------------
-- 6. descartes: guarda do cliente (custo/peso calculados no servidor)
-- -----------------------------------------------------------------------------
create or replace function public.descartes_guarda_cliente()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_gestor boolean;
  v_et_unid uuid;
  v_peso numeric;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  v_gestor := public.is_gestor();
  new.responsavel_id := auth.uid();

  if new.etiqueta_id is not null then
    select e.unidade_id into v_et_unid from public.etiquetas e where e.id = new.etiqueta_id;
    if v_et_unid is null or (new.unidade_id is not null and v_et_unid <> new.unidade_id) then
      raise exception 'Etiqueta não encontrada nesta unidade.' using errcode = '42501';
    end if;
    new.unidade_id := v_et_unid;
  end if;

  if not v_gestor then
    new.custo_estimado := null;  -- sempre calculado pelo cadastro do produto
  elsif new.custo_estimado is not null and new.custo_estimado < 0 then
    raise exception 'Custo estimado inválido.' using errcode = '22023';
  end if;

  if new.unidade_medida in ('kg', 'g', 'l', 'ml') then
    new.peso_kg := null;  -- derivado da quantidade pelo trigger de cálculo
    v_peso := case new.unidade_medida when 'g' then new.quantidade / 1000
                                       when 'ml' then new.quantidade / 1000
                                       else new.quantidade end;
  else
    if new.peso_kg is not null and new.peso_kg <= 0 then
      raise exception 'Peso deve ser maior que zero.' using errcode = '22023';
    end if;
    v_peso := new.peso_kg;
    if not v_gestor and new.quantidade > 1000 then
      raise exception 'Quantidade acima do limite (1000 %). Peça a um gerente.', new.unidade_medida
        using errcode = '42501';
    end if;
  end if;
  if not v_gestor and v_peso is not null and v_peso > 500 then
    raise exception 'Descarte acima de 500 kg: somente gerente ou administrador pode registrar.'
      using errcode = '42501';
  end if;

  new.descartado_em := coalesce(new.descartado_em, now());
  if new.descartado_em > now() + interval '10 minutes' then
    raise exception 'A data do descarte não pode estar no futuro.' using errcode = '22023';
  end if;
  if not v_gestor and new.descartado_em < now() - interval '7 days' then
    raise exception 'Descarte com mais de 7 dias: somente gerente ou administrador pode registrar.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_descartes_0_guarda on public.descartes;
create trigger trg_descartes_0_guarda
  before insert on public.descartes
  for each row execute function public.descartes_guarda_cliente();

-- -----------------------------------------------------------------------------
-- 7. registros_temperatura: conformidade recalculada em QUALQUER update
--    (antes um gestor podia marcar conforme=true sem mudar a temperatura) e
--    responsável/horário controlados no cliente.
-- -----------------------------------------------------------------------------
drop trigger if exists trg_registros_temperatura_before_insert on public.registros_temperatura;
create trigger trg_registros_temperatura_before_insert
  before insert or update on public.registros_temperatura
  for each row execute function public.registros_temperatura_before_insert();

create or replace function public.registros_temperatura_guarda_cliente()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.responsavel_id := auth.uid();
  elsif new.responsavel_id is distinct from old.responsavel_id then
    raise exception 'O responsável do registro não pode ser alterado.' using errcode = '42501';
  end if;
  new.registrado_em := coalesce(new.registrado_em, now());
  if new.registrado_em > now() + interval '10 minutes' then
    raise exception 'O horário do registro não pode estar no futuro.' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' and not public.is_gestor() and new.registrado_em < now() - interval '24 hours' then
    raise exception 'Registro retroativo com mais de 24 h: somente gerente ou administrador.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_registros_temperatura_0_guarda on public.registros_temperatura;
create trigger trg_registros_temperatura_0_guarda
  before insert or update on public.registros_temperatura
  for each row execute function public.registros_temperatura_guarda_cliente();

-- -----------------------------------------------------------------------------
-- 8. RPCs de etiqueta passam a security definer (checando acesso à unidade)
-- -----------------------------------------------------------------------------
create or replace function public.dar_baixa_etiqueta(
  p_etiqueta_id uuid,
  p_status status_etiqueta,
  p_motivo motivo_descarte default null,
  p_quantidade numeric default null,
  p_observacao text default null
)
returns public.etiquetas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_et public.etiquetas;
  v_motivo motivo_descarte;
  v_qtd numeric;
  v_um unidade_medida;
begin
  if p_status is null or p_status not in ('consumida', 'descartada') then
    raise exception 'Baixa inválida: use "consumida" ou "descartada".'
      using errcode = '22023';
  end if;

  select * into v_et from public.etiquetas where id = p_etiqueta_id for update;
  if not found or not public.tem_acesso_unidade(v_et.unidade_id) then
    raise exception 'Etiqueta não encontrada.' using errcode = 'P0002';
  end if;

  if v_et.status not in ('ativa', 'vencida') then
    raise exception 'Etiqueta % já foi baixada (%).', v_et.codigo, v_et.status
      using errcode = '22023';
  end if;

  if p_quantidade is not null and p_quantidade <= 0 then
    raise exception 'Quantidade deve ser maior que zero.' using errcode = '22023';
  end if;
  if p_quantidade is not null and v_et.quantidade is not null and p_quantidade > v_et.quantidade then
    raise exception 'Quantidade descartada (%) maior que a da etiqueta (%).', p_quantidade, v_et.quantidade
      using errcode = '22023';
  end if;

  if p_status = 'descartada' then
    v_motivo := coalesce(
      p_motivo,
      case when v_et.status = 'vencida' or v_et.data_validade <= now()
           then 'vencido'::motivo_descarte
           else 'outro'::motivo_descarte end
    );

    if p_quantidade is null and v_et.quantidade is null then
      v_qtd := 1;
      v_um := 'un';
    else
      v_qtd := coalesce(p_quantidade, v_et.quantidade);
      v_um := coalesce(v_et.unidade_medida, 'un');
    end if;

    if v_qtd is null or v_qtd <= 0 then
      v_qtd := 1;
      v_um := 'un';
    end if;

    insert into public.descartes (
      unidade_id, etiqueta_id, produto_id, produto_nome,
      motivo, quantidade, unidade_medida, observacao
    ) values (
      v_et.unidade_id, v_et.id, v_et.produto_id, v_et.produto_nome,
      v_motivo, v_qtd, v_um, p_observacao
    );
  end if;

  update public.etiquetas
     set status = p_status,
         status_por = auth.uid()
   where id = v_et.id
  returning * into v_et;

  return v_et;
end;
$$;

create or replace function public.registrar_reimpressao(p_etiqueta_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_impressoes int;
  v_status status_etiqueta;
begin
  update public.etiquetas
     set impressoes = impressoes + 1
   where id = p_etiqueta_id
     and public.tem_acesso_unidade(unidade_id)
  returning impressoes, status into v_impressoes, v_status;

  if not found then
    raise exception 'Etiqueta não encontrada.' using errcode = 'P0002';
  end if;

  insert into public.etiqueta_movimentacoes (etiqueta_id, tipo, status_anterior, status_novo, detalhes, usuario_id)
  values (p_etiqueta_id, 'reimpressao', v_status, v_status,
          jsonb_build_object('impressoes', v_impressoes), auth.uid());

  return v_impressoes;
end;
$$;

create or replace function public.registrar_impressao(p_etiqueta_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_etiqueta_ids is null or cardinality(p_etiqueta_ids) = 0 then
    return;
  end if;
  if cardinality(p_etiqueta_ids) > 200 then
    raise exception 'Máximo de 200 etiquetas por impressão.' using errcode = '22023';
  end if;

  update public.etiquetas
     set impressoes = impressoes + 1
   where id = any (p_etiqueta_ids)
     and public.tem_acesso_unidade(unidade_id);
end;
$$;

-- Derivada: várias cópias numa única chamada (a origem congelada só é baixada
-- depois de criar todas) e data de manipulação informada.
drop function if exists public.emitir_etiqueta_derivada(uuid, tipo_etiqueta, metodo_conservacao, numeric, int);
drop function if exists public.emitir_etiqueta_derivada(uuid, tipo_etiqueta, metodo_conservacao, numeric, int, int, timestamptz);
create function public.emitir_etiqueta_derivada(
  p_origem_id uuid,
  p_tipo tipo_etiqueta,
  p_metodo metodo_conservacao,
  p_quantidade numeric default null,
  p_validade_horas int default null,
  p_copias int default 1,
  p_data_manipulacao timestamptz default null
)
returns setof public.etiquetas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_origem public.etiquetas;
  v_nova public.etiquetas;
  v_horas int;
  v_manip timestamptz := coalesce(p_data_manipulacao, now());
  v_validade timestamptz;
  i int;
begin
  select * into v_origem from public.etiquetas where id = p_origem_id for update;
  if not found or not public.tem_acesso_unidade(v_origem.unidade_id) then
    raise exception 'Etiqueta de origem não encontrada.' using errcode = 'P0002';
  end if;

  if v_origem.status <> 'ativa' or v_origem.data_validade <= now() then
    raise exception 'A etiqueta de origem % não está ativa ou já venceu.', v_origem.codigo
      using errcode = '22023';
  end if;

  if p_copias is null or p_copias < 1 or p_copias > 100 then
    raise exception 'Informe de 1 a 100 cópias.' using errcode = '22023';
  end if;
  if p_validade_horas is not null and p_validade_horas <= 0 then
    raise exception 'Validade deve ser maior que zero.' using errcode = '22023';
  end if;
  if v_manip < v_origem.data_manipulacao then
    raise exception 'A manipulação da derivada não pode ser anterior à da etiqueta de origem.'
      using errcode = '22023';
  end if;
  if p_quantidade is not null and p_quantidade < 0 then
    raise exception 'Quantidade inválida.' using errcode = '22023';
  end if;

  v_horas := coalesce(
    p_validade_horas,
    case when v_origem.produto_id is not null
         then public.validade_padrao_horas(v_origem.produto_id, p_metodo) end
  );
  if v_horas is null then
    raise exception 'Produto sem validade definida para o método %', p_metodo
      using errcode = '22023';
  end if;

  v_validade := v_manip + make_interval(hours => v_horas);
  perform public.validar_prazo_etiqueta(v_origem.produto_id, p_metodo, v_manip, v_validade);
  if p_metodo = v_origem.metodo then
    v_validade := least(v_validade, v_origem.data_validade);
  end if;
  if v_validade <= v_manip then
    raise exception 'A validade resultante não é posterior à manipulação.' using errcode = '22023';
  end if;

  for i in 1..p_copias loop
    insert into public.etiquetas (
      unidade_id, produto_id, produto_nome, categoria_nome, tipo, metodo,
      data_manipulacao, validade_horas, data_validade, data_validade_fabricante,
      lote, fornecedor_id, fornecedor_nome, sif, quantidade, unidade_medida,
      alergenicos, modelo_id, etiqueta_origem_id, recebimento_item_id
    ) values (
      v_origem.unidade_id, v_origem.produto_id, v_origem.produto_nome, v_origem.categoria_nome,
      p_tipo, p_metodo,
      v_manip, v_horas, v_validade, v_origem.data_validade_fabricante,
      v_origem.lote, v_origem.fornecedor_id, v_origem.fornecedor_nome, v_origem.sif,
      coalesce(p_quantidade, v_origem.quantidade), v_origem.unidade_medida,
      v_origem.alergenicos, v_origem.modelo_id, v_origem.id, v_origem.recebimento_item_id
    )
    returning * into v_nova;
    return next v_nova;
  end loop;

  if v_origem.metodo = 'congelado' and p_metodo = 'descongelando' then
    update public.etiquetas
       set status = 'consumida', status_por = auth.uid()
     where id = v_origem.id;
  end if;

  return;
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. Privilégios de funções: nada executável por PUBLIC/anon, exceto a
--    consulta pública do QR. (Supabase concede EXECUTE a anon por padrão.)
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.consultar_etiqueta_publica(text) to anon;
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on all functions in schema public to service_role';
    execute 'grant select, insert, update, delete on all tables in schema public to service_role';
  end if;
end;
$$;
