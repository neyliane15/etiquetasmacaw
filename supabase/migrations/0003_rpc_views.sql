-- =============================================================================
-- Etiquetas Macaw — 0003_rpc_views.sql
-- Views (security_invoker → respeitam RLS) e RPCs de §4.7.
-- Depende de 0001_schema.sql e 0002_rls_policies.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper: situação padronizada de uma etiqueta (mesma regra da view e do TS)
-- "Hoje" é comparado no fuso America/Sao_Paulo.
-- -----------------------------------------------------------------------------
create or replace function public.situacao_etiqueta(
  p_status status_etiqueta,
  p_data_validade timestamptz
)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when p_status <> 'ativa' then p_status::text
    when p_data_validade <= now() then 'vencida'
    when (p_data_validade at time zone 'America/Sao_Paulo')::date
         = (now() at time zone 'America/Sao_Paulo')::date then 'vence_hoje'
    when p_data_validade <= now() + interval '24 hours' then 'vence_24h'
    when p_data_validade <= now() + interval '72 hours' then 'vence_72h'
    else 'ok'
  end
$$;

-- -----------------------------------------------------------------------------
-- vw_etiquetas
-- -----------------------------------------------------------------------------
drop view if exists public.vw_etiquetas_a_vencer;
drop view if exists public.vw_etiquetas;

create view public.vw_etiquetas
with (security_invoker = true)
as
select
  e.*,
  u.nome as unidade_nome,
  m.nome as modelo_nome,
  round((extract(epoch from (e.data_validade - now())) / 3600.0)::numeric, 1) as horas_restantes,
  public.situacao_etiqueta(e.status, e.data_validade) as situacao
from public.etiquetas e
join public.unidades u on u.id = e.unidade_id
left join public.modelos_etiqueta m on m.id = e.modelo_id;

-- -----------------------------------------------------------------------------
-- vw_etiquetas_a_vencer (PVPS: inclui vencidas ainda ativas)
-- -----------------------------------------------------------------------------
create view public.vw_etiquetas_a_vencer
with (security_invoker = true)
as
select *
from public.vw_etiquetas
where status = 'ativa'
  and data_validade <= now() + interval '72 hours'
order by data_validade;

-- -----------------------------------------------------------------------------
-- vw_desperdicio_diario
-- -----------------------------------------------------------------------------
drop view if exists public.vw_desperdicio_diario;
create view public.vw_desperdicio_diario
with (security_invoker = true)
as
select
  d.unidade_id,
  u.nome as unidade_nome,
  (d.descartado_em at time zone 'America/Sao_Paulo')::date as dia,
  d.motivo,
  d.produto_id,
  d.produto_nome,
  coalesce(c.nome, e.categoria_nome) as categoria_nome,
  sum(d.quantidade) as total_quantidade,
  coalesce(sum(d.peso_kg), 0) as total_peso_kg,
  coalesce(sum(d.custo_estimado), 0) as total_custo,
  count(*)::int as registros
from public.descartes d
join public.unidades u on u.id = d.unidade_id
left join public.produtos p on p.id = d.produto_id
left join public.categorias c on c.id = p.categoria_id
left join public.etiquetas e on e.id = d.etiqueta_id
group by d.unidade_id, u.nome, (d.descartado_em at time zone 'America/Sao_Paulo')::date,
         d.motivo, d.produto_id, d.produto_nome, coalesce(c.nome, e.categoria_nome);

-- -----------------------------------------------------------------------------
-- vw_temperaturas_ultimas (último registro por equipamento ativo)
-- -----------------------------------------------------------------------------
drop view if exists public.vw_temperaturas_ultimas;
create view public.vw_temperaturas_ultimas
with (security_invoker = true)
as
select
  eq.id as equipamento_id,
  eq.nome as equipamento_nome,
  eq.tipo,
  eq.unidade_id,
  eq.temp_min_c,
  eq.temp_max_c,
  r.temperatura_c,
  r.conforme,
  r.registrado_em,
  case when r.registrado_em is null then null
       else round((extract(epoch from (now() - r.registrado_em)) / 3600.0)::numeric, 1)
  end as horas_desde_registro
from public.equipamentos eq
left join lateral (
  select rt.temperatura_c, rt.conforme, rt.registrado_em
  from public.registros_temperatura rt
  where rt.equipamento_id = eq.id
  order by rt.registrado_em desc
  limit 1
) r on true
where eq.ativo;

grant select on public.vw_etiquetas, public.vw_etiquetas_a_vencer,
  public.vw_desperdicio_diario, public.vw_temperaturas_ultimas to authenticated;
revoke all on public.vw_etiquetas, public.vw_etiquetas_a_vencer,
  public.vw_desperdicio_diario, public.vw_temperaturas_ultimas from anon;

-- =============================================================================
-- RPCs
-- =============================================================================

-- -----------------------------------------------------------------------------
-- consultar_etiqueta_publica — página pública do QR (/q/:codigo)
-- Não expõe ids, custos, fornecedor nem observações.
-- -----------------------------------------------------------------------------
create or replace function public.consultar_etiqueta_publica(p_codigo text)
returns table (
  codigo text,
  produto_nome text,
  tipo tipo_etiqueta,
  metodo metodo_conservacao,
  data_manipulacao timestamptz,
  data_validade timestamptz,
  status status_etiqueta,
  situacao text,
  unidade_nome text,
  lote text,
  alergenicos text[],
  responsavel_primeiro_nome text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select
    e.codigo,
    e.produto_nome,
    e.tipo,
    e.metodo,
    e.data_manipulacao,
    e.data_validade,
    e.status,
    public.situacao_etiqueta(e.status, e.data_validade),
    u.nome,
    e.lote,
    e.alergenicos,
    nullif(split_part(trim(coalesce(e.responsavel_nome, '')), ' ', 1), '')
  from public.etiquetas e
  join public.unidades u on u.id = e.unidade_id
  where e.codigo = upper(trim(p_codigo))
  limit 1;
end;
$$;

-- -----------------------------------------------------------------------------
-- dar_baixa_etiqueta — consumo ou descarte (com registro em descartes)
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
security invoker
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

  select * into v_et
  from public.etiquetas
  where id = p_etiqueta_id
  for update;

  if not found then
    raise exception 'Etiqueta não encontrada.' using errcode = 'P0002';
  end if;

  if v_et.status not in ('ativa', 'vencida') then
    raise exception 'Etiqueta % já foi baixada (%).', v_et.codigo, v_et.status
      using errcode = '22023';
  end if;

  if p_quantidade is not null and p_quantidade <= 0 then
    raise exception 'Quantidade deve ser maior que zero.' using errcode = '22023';
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

-- -----------------------------------------------------------------------------
-- registrar_reimpressao — incrementa impressões + movimentação 'reimpressao'
-- -----------------------------------------------------------------------------
create or replace function public.registrar_reimpressao(p_etiqueta_id uuid)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_impressoes int;
  v_status status_etiqueta;
begin
  update public.etiquetas
     set impressoes = impressoes + 1
   where id = p_etiqueta_id
  returning impressoes, status into v_impressoes, v_status;

  if not found then
    raise exception 'Etiqueta não encontrada.' using errcode = 'P0002';
  end if;

  insert into public.etiqueta_movimentacoes (etiqueta_id, tipo, status_anterior, status_novo, detalhes)
  values (p_etiqueta_id, 'reimpressao', v_status, v_status,
          jsonb_build_object('impressoes', v_impressoes));

  return v_impressoes;
end;
$$;

-- -----------------------------------------------------------------------------
-- registrar_impressao — primeira impressão (sem movimentação)
-- -----------------------------------------------------------------------------
create or replace function public.registrar_impressao(p_etiqueta_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_etiqueta_ids is null or cardinality(p_etiqueta_ids) = 0 then
    return;
  end if;

  update public.etiquetas
     set impressoes = impressoes + 1
   where id = any (p_etiqueta_ids);
end;
$$;

-- -----------------------------------------------------------------------------
-- marcar_etiquetas_vencidas — security definer, restrito às unidades acessíveis
-- Sem JWT (auth.uid() null: SQL editor / service role / agendador) atua em todas.
-- -----------------------------------------------------------------------------
create or replace function public.marcar_etiquetas_vencidas(p_unidade_id uuid default null)
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_qtd int;
  v_uid uuid := auth.uid();
begin
  update public.etiquetas e
     set status = 'vencida'
   where e.status = 'ativa'
     and e.data_validade <= now()
     and (p_unidade_id is null or e.unidade_id = p_unidade_id)
     and (v_uid is null or public.tem_acesso_unidade(e.unidade_id));

  get diagnostics v_qtd = row_count;
  return v_qtd;
end;
$$;

-- -----------------------------------------------------------------------------
-- dashboard_resumo — contadores do painel (p_unidade_id null = todas acessíveis)
-- -----------------------------------------------------------------------------
create or replace function public.dashboard_resumo(p_unidade_id uuid)
returns json
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v json;
begin
  with et as (
    select status, situacao, created_at
    from public.vw_etiquetas
    where p_unidade_id is null or unidade_id = p_unidade_id
  ),
  et_agg as (
    select
      count(*) filter (where status = 'ativa' and situacao <> 'vencida')            as ativas,
      count(*) filter (where situacao = 'vencida')                                   as vencidas,
      count(*) filter (where situacao = 'vence_hoje')                                as vence_hoje,
      count(*) filter (where situacao = 'vence_24h')                                 as vence_24h,
      count(*) filter (where situacao = 'vence_72h')                                 as vence_72h,
      count(*) filter (where (created_at at time zone 'America/Sao_Paulo')::date = v_hoje) as emitidas_hoje
    from et
  ),
  desc_agg as (
    select coalesce(sum(peso_kg), 0) as kg, coalesce(sum(custo_estimado), 0) as custo
    from public.descartes
    where descartado_em >= now() - interval '7 days'
      and (p_unidade_id is null or unidade_id = p_unidade_id)
  ),
  temp_agg as (
    select count(*) as nao_conformes
    from public.registros_temperatura
    where not conforme
      and registrado_em >= now() - interval '24 hours'
      and (p_unidade_id is null or unidade_id = p_unidade_id)
  ),
  equip_agg as (
    select count(*) as sem_registro
    from public.equipamentos eq
    where eq.ativo
      and (p_unidade_id is null or eq.unidade_id = p_unidade_id)
      and not exists (
        select 1 from public.registros_temperatura rt
        where rt.equipamento_id = eq.id
          and rt.registrado_em >= now() - interval '12 hours'
      )
  ),
  rec_agg as (
    select count(*) as hoje
    from public.recebimentos
    where (recebido_em at time zone 'America/Sao_Paulo')::date = v_hoje
      and (p_unidade_id is null or unidade_id = p_unidade_id)
  )
  select json_build_object(
    'ativas',                          et_agg.ativas,
    'vencidas',                        et_agg.vencidas,
    'vence_hoje',                      et_agg.vence_hoje,
    'vence_24h',                       et_agg.vence_24h,
    'vence_72h',                       et_agg.vence_72h,
    'emitidas_hoje',                   et_agg.emitidas_hoje,
    'descartes_7d_kg',                 round(desc_agg.kg, 3),
    'descartes_7d_custo',              round(desc_agg.custo, 2),
    'temperaturas_nao_conformes_24h',  temp_agg.nao_conformes,
    'equipamentos_sem_registro_12h',   equip_agg.sem_registro,
    'recebimentos_hoje',               rec_agg.hoje
  ) into v
  from et_agg, desc_agg, temp_agg, equip_agg, rec_agg;

  return v;
end;
$$;

-- -----------------------------------------------------------------------------
-- relatorio_desperdicio — agrupamentos por motivo, produto, categoria e dia
-- Datas inclusivas, no fuso America/Sao_Paulo.
-- -----------------------------------------------------------------------------
create or replace function public.relatorio_desperdicio(
  p_unidade_id uuid,
  p_inicio date,
  p_fim date
)
returns table (
  agrupador text,
  chave text,
  total_peso_kg numeric,
  total_custo numeric,
  registros int
)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  return query
  with base as (
    select
      d.motivo::text as motivo,
      d.produto_nome,
      coalesce(c.nome, e.categoria_nome, 'Sem categoria') as categoria,
      to_char((d.descartado_em at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') as dia,
      coalesce(d.peso_kg, 0) as peso,
      coalesce(d.custo_estimado, 0) as custo
    from public.descartes d
    left join public.produtos p on p.id = d.produto_id
    left join public.categorias c on c.id = p.categoria_id
    left join public.etiquetas e on e.id = d.etiqueta_id
    where (p_unidade_id is null or d.unidade_id = p_unidade_id)
      and (d.descartado_em at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
  ),
  agrupado as (
    select 'motivo'::text as ag, b.motivo as ch, sum(b.peso) as kg, sum(b.custo) as rs, count(*)::int as n
      from base b group by b.motivo
    union all
    select 'produto', b.produto_nome, sum(b.peso), sum(b.custo), count(*)::int
      from base b group by b.produto_nome
    union all
    select 'categoria', b.categoria, sum(b.peso), sum(b.custo), count(*)::int
      from base b group by b.categoria
    union all
    select 'dia', b.dia, sum(b.peso), sum(b.custo), count(*)::int
      from base b group by b.dia
  )
  select a.ag, a.ch, round(a.kg, 3), round(a.rs, 2), a.n
  from agrupado a
  order by
    case a.ag when 'motivo' then 1 when 'produto' then 2 when 'categoria' then 3 else 4 end,
    case when a.ag = 'dia' then a.ch end,
    a.rs desc,
    a.kg desc,
    a.ch;
end;
$$;

-- -----------------------------------------------------------------------------
-- relatorio_etiquetas — etiquetas emitidas no período por produto
-- -----------------------------------------------------------------------------
create or replace function public.relatorio_etiquetas(
  p_unidade_id uuid,
  p_inicio date,
  p_fim date
)
returns table (
  produto_nome text,
  emitidas int,
  consumidas int,
  descartadas int,
  vencidas int,
  ativas int
)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  return query
  select
    e.produto_nome,
    count(*)::int,
    (count(*) filter (where e.status = 'consumida'))::int,
    (count(*) filter (where e.status = 'descartada'))::int,
    (count(*) filter (where e.status = 'vencida'
                        or (e.status = 'ativa' and e.data_validade <= now())))::int,
    (count(*) filter (where e.status = 'ativa' and e.data_validade > now()))::int
  from public.etiquetas e
  where (p_unidade_id is null or e.unidade_id = p_unidade_id)
    and (e.created_at at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
  group by e.produto_nome
  order by count(*) desc, e.produto_nome;
end;
$$;

-- -----------------------------------------------------------------------------
-- emitir_etiqueta_derivada — porcionar/descongelar a partir de etiqueta existente
-- Herda produto, lote, fornecedor, SIF, alergênicos e unidade.
-- Se o novo método mantém o da origem, a validade não ultrapassa a da origem.
-- Congelado → descongelando: a origem é marcada como consumida.
-- -----------------------------------------------------------------------------
create or replace function public.emitir_etiqueta_derivada(
  p_origem_id uuid,
  p_tipo tipo_etiqueta,
  p_metodo metodo_conservacao,
  p_quantidade numeric default null,
  p_validade_horas int default null
)
returns public.etiquetas
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_origem public.etiquetas;
  v_nova public.etiquetas;
  v_horas int;
  v_agora timestamptz := now();
  v_validade timestamptz;
begin
  select * into v_origem from public.etiquetas where id = p_origem_id for update;
  if not found then
    raise exception 'Etiqueta de origem não encontrada.' using errcode = 'P0002';
  end if;

  if v_origem.status <> 'ativa' or v_origem.data_validade <= v_agora then
    raise exception 'A etiqueta de origem % não está ativa ou já venceu.', v_origem.codigo
      using errcode = '22023';
  end if;

  if p_validade_horas is not null and p_validade_horas <= 0 then
    raise exception 'Validade deve ser maior que zero.' using errcode = '22023';
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

  v_validade := v_agora + make_interval(hours => v_horas);
  if p_metodo = v_origem.metodo then
    v_validade := least(v_validade, v_origem.data_validade);
  end if;

  insert into public.etiquetas (
    unidade_id, produto_id, produto_nome, categoria_nome, tipo, metodo,
    data_manipulacao, validade_horas, data_validade, data_validade_fabricante,
    lote, fornecedor_id, fornecedor_nome, sif, quantidade, unidade_medida,
    alergenicos, modelo_id, etiqueta_origem_id, recebimento_item_id
  ) values (
    v_origem.unidade_id, v_origem.produto_id, v_origem.produto_nome, v_origem.categoria_nome,
    p_tipo, p_metodo,
    v_agora, v_horas, v_validade, v_origem.data_validade_fabricante,
    v_origem.lote, v_origem.fornecedor_id, v_origem.fornecedor_nome, v_origem.sif,
    coalesce(p_quantidade, v_origem.quantidade), v_origem.unidade_medida,
    v_origem.alergenicos, v_origem.modelo_id, v_origem.id, v_origem.recebimento_item_id
  )
  returning * into v_nova;

  if v_origem.metodo = 'congelado' and p_metodo = 'descongelando' then
    update public.etiquetas
       set status = 'consumida', status_por = auth.uid()
     where id = v_origem.id;
  end if;

  return v_nova;
end;
$$;

-- -----------------------------------------------------------------------------
-- Grants das funções
-- -----------------------------------------------------------------------------
revoke all on function public.situacao_etiqueta(status_etiqueta, timestamptz) from public;
revoke all on function public.consultar_etiqueta_publica(text) from public;
revoke all on function public.dar_baixa_etiqueta(uuid, status_etiqueta, motivo_descarte, numeric, text) from public, anon;
revoke all on function public.registrar_reimpressao(uuid) from public, anon;
revoke all on function public.registrar_impressao(uuid[]) from public, anon;
revoke all on function public.marcar_etiquetas_vencidas(uuid) from public, anon;
revoke all on function public.dashboard_resumo(uuid) from public, anon;
revoke all on function public.relatorio_desperdicio(uuid, date, date) from public, anon;
revoke all on function public.relatorio_etiquetas(uuid, date, date) from public, anon;
revoke all on function public.emitir_etiqueta_derivada(uuid, tipo_etiqueta, metodo_conservacao, numeric, int) from public, anon;

grant execute on function public.consultar_etiqueta_publica(text) to anon, authenticated;
grant execute on function public.situacao_etiqueta(status_etiqueta, timestamptz) to authenticated;
grant execute on function public.dar_baixa_etiqueta(uuid, status_etiqueta, motivo_descarte, numeric, text) to authenticated;
grant execute on function public.registrar_reimpressao(uuid) to authenticated;
grant execute on function public.registrar_impressao(uuid[]) to authenticated;
grant execute on function public.marcar_etiquetas_vencidas(uuid) to authenticated;
grant execute on function public.dashboard_resumo(uuid) to authenticated;
grant execute on function public.relatorio_desperdicio(uuid, date, date) to authenticated;
grant execute on function public.relatorio_etiquetas(uuid, date, date) to authenticated;
grant execute on function public.emitir_etiqueta_derivada(uuid, tipo_etiqueta, metodo_conservacao, numeric, int) to authenticated;
