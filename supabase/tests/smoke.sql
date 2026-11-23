-- =====================================================================
-- Etiquetas Macaw — smoke tests SQL (Testador, docs/PLANO.md §13)
-- Pré-requisito (Postgres local, NUNCA no Supabase real):
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/auth_stub.sql
--   psql -v ON_ERROR_STOP=1 -f supabase/migrations/0001_schema.sql   (… 0002, 0003)
--   psql -v ON_ERROR_STOP=1 -f supabase/seed.sql
-- Executar:  psql -v ON_ERROR_STOP=1 -f supabase/tests/smoke.sql
-- Roda numa transação e faz ROLLBACK no fim (não deixa resíduos).
-- Requer base sem usuários (o 1º usuário criado aqui deve virar admin).
-- Qualquer falha => RAISE EXCEPTION (psql sai com código != 0).
-- =====================================================================
\set QUIET on
\set ON_ERROR_STOP on
\o /dev/null
begin;

-- IDs fixos dos testes
-- u_admin  = aaaaaaaa-0000-0000-0000-000000000001 (1º usuário → admin)
-- u_camb   = aaaaaaaa-0000-0000-0000-000000000002 (cozinheiro Camboinhas)
-- u_buz    = aaaaaaaa-0000-0000-0000-000000000003 (cozinheiro Búzios)
-- Camboinhas = 11111111-…, Búzios = 22222222-…

-- Helpers no schema temporário 'teste' (desfeito pelo ROLLBACK)
-- Helper: simula o JWT de um usuário (sub) — vale até o fim da transação
create schema teste;
create or replace function teste.login(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p::text, ''), true);
  select set_config('request.jwt.claim.role', case when p is null then 'anon' else 'authenticated' end, true);
$$;
-- Helper: guarda/lê valores entre blocos (GUC custom, legível por qualquer papel)
create or replace function teste.put(k text, v text) returns void language sql as $$
  select set_config('teste.' || k, v, true);
$$;
create or replace function teste.get(k text) returns text language sql as $$
  select current_setting('teste.' || k, true);
$$;
grant usage on schema teste to public;
grant execute on all functions in schema teste to public;

-- ---------------------------------------------------------------------
-- T01 — primeiro usuário vira admin; seguintes viram cozinheiro
-- ---------------------------------------------------------------------
do $$
declare v_papel text; v_unid uuid; v_nome text;
begin
  if exists (select 1 from public.perfis) then
    raise exception 'T01 pré-condição: base já possui perfis — rode numa base limpa';
  end if;
  insert into auth.users (id, email, raw_user_meta_data) values
    ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@macaw.test', '{"nome":"Ana Admin"}');
  insert into auth.users (id, email, raw_user_meta_data) values
    ('aaaaaaaa-0000-0000-0000-000000000002', 'camb@macaw.test',
     '{"nome":"Carlos Cozinheiro","unidade_id":"11111111-1111-1111-1111-111111111111"}');
  insert into auth.users (id, email, raw_user_meta_data) values
    ('aaaaaaaa-0000-0000-0000-000000000003', 'buz@macaw.test',
     '{"nome":"Bia Búzios","unidade_id":"22222222-2222-2222-2222-222222222222"}');

  select papel, unidade_id into v_papel, v_unid from public.perfis where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if v_papel <> 'admin' then raise exception 'T01: 1º usuário deveria ser admin, é %', v_papel; end if;
  select papel, unidade_id, nome into v_papel, v_unid, v_nome from public.perfis where id = 'aaaaaaaa-0000-0000-0000-000000000002';
  if v_papel <> 'cozinheiro' then raise exception 'T01: 2º usuário deveria ser cozinheiro, é %', v_papel; end if;
  if v_unid is distinct from '11111111-1111-1111-1111-111111111111' then raise exception 'T01: unidade do metadata não aplicada'; end if;
  if v_nome <> 'Carlos Cozinheiro' then raise exception 'T01: nome do metadata não aplicado'; end if;
  raise notice 'OK T01 primeiro usuário admin / demais cozinheiro';
end $$;

-- ---------------------------------------------------------------------
-- T02 — admin emite etiqueta em Búzios (base para os testes de RLS)
-- ---------------------------------------------------------------------
select teste.login('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
do $$
declare v_id uuid; v_resp text;
begin
  insert into public.etiquetas (unidade_id, produto_id, produto_nome, metodo)
  values ('22222222-2222-2222-2222-222222222222', 'a0000000-0000-0000-0000-000000000006', '', 'resfriado')
  returning id, responsavel_nome into v_id, v_resp;
  perform teste.put('et_buz', v_id::text);
  if v_resp <> 'Ana Admin' then raise exception 'T02: responsavel_nome deveria ser snapshot do perfil, veio %', v_resp; end if;
  raise notice 'OK T02 admin emite etiqueta em Búzios (snapshot responsável)';
end $$;
reset role;

-- ---------------------------------------------------------------------
-- T03 — RLS: cozinheiro de Camboinhas não vê nem insere dados de Búzios
-- ---------------------------------------------------------------------
select teste.login('aaaaaaaa-0000-0000-0000-000000000002');
set role authenticated;
do $$
declare n int; v_ok boolean := false;
begin
  select count(*) into n from public.etiquetas where unidade_id = '22222222-2222-2222-2222-222222222222';
  if n <> 0 then raise exception 'T03: cozinheiro Camboinhas vê % etiquetas de Búzios', n; end if;
  select count(*) into n from public.vw_etiquetas where unidade_id = '22222222-2222-2222-2222-222222222222';
  if n <> 0 then raise exception 'T03: vw_etiquetas vaza % etiquetas de Búzios', n; end if;
  select count(*) into n from public.equipamentos where unidade_id = '22222222-2222-2222-2222-222222222222';
  if n <> 0 then raise exception 'T03: vê % equipamentos de Búzios', n; end if;
  select count(*) into n from public.equipamentos where unidade_id = '11111111-1111-1111-1111-111111111111';
  if n <> 5 then raise exception 'T03: deveria ver 5 equipamentos de Camboinhas, viu %', n; end if;
  select count(*) into n from public.produtos;
  if n <> 60 then raise exception 'T03: produtos globais visíveis = % (esperado 60)', n; end if;

  begin
    insert into public.etiquetas (unidade_id, produto_id, produto_nome, metodo)
    values ('22222222-2222-2222-2222-222222222222', 'a0000000-0000-0000-0000-000000000006', 'x', 'resfriado');
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'T03: cozinheiro Camboinhas conseguiu inserir etiqueta em Búzios'; end if;

  v_ok := false;
  begin
    insert into public.registros_temperatura (equipamento_id, unidade_id, temperatura_c, conforme)
    values ('e2000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 3, true);
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'T03: registrou temperatura em equipamento de Búzios (unidade_id forjado)'; end if;

  -- update/baixa em etiqueta de outra unidade não afeta nada
  update public.etiquetas set observacoes = 'hack' where id = teste.get('et_buz')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T03: alterou etiqueta de Búzios'; end if;

  v_ok := false;
  begin
    perform public.dar_baixa_etiqueta(teste.get('et_buz')::uuid, 'consumida');
  exception when no_data_found then v_ok := true;
  end;
  if not v_ok then raise exception 'T03: dar_baixa em etiqueta de Búzios não falhou'; end if;

  -- cozinheiro não pode se promover
  v_ok := false;
  begin
    update public.perfis set papel = 'admin' where id = auth.uid();
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'T03: cozinheiro conseguiu alterar o próprio papel'; end if;
  select count(*) into n from public.perfis;
  if n <> 1 then raise exception 'T03: cozinheiro vê % perfis (esperado só o próprio)', n; end if;

  -- cozinheiro não cadastra produto
  v_ok := false;
  begin
    insert into public.produtos (nome, validade_resfriado_horas) values ('Produto pirata', 24);
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'T03: cozinheiro cadastrou produto global'; end if;
  raise notice 'OK T03 RLS isolamento por unidade + proteção de papel';
end $$;

-- ---------------------------------------------------------------------
-- T04 — emissão calcula validade pelo método; código curto; movimentação
-- ---------------------------------------------------------------------
do $$
declare
  r public.etiquetas; n int; v_ok boolean := false;
begin
  -- Filé mignon: resfriado 72 h, congelado 720 h, ambiente null, descongelando 72 h
  insert into public.etiquetas (unidade_id, produto_id, produto_nome, metodo, quantidade)
  values ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', '', 'resfriado', 2)
  returning * into r;
  perform teste.put('et_res', r.id::text);
  if r.data_validade <> r.data_manipulacao + interval '72 hours' then
    raise exception 'T04: validade resfriado errada: % vs %', r.data_validade, r.data_manipulacao; end if;
  if r.validade_horas <> 72 then raise exception 'T04: validade_horas = %', r.validade_horas; end if;
  if r.produto_nome <> 'Filé mignon porcionado' then raise exception 'T04: snapshot produto_nome = %', r.produto_nome; end if;
  if r.categoria_nome <> 'Carnes bovinas' then raise exception 'T04: snapshot categoria = %', r.categoria_nome; end if;
  if r.unidade_medida <> 'kg' then raise exception 'T04: snapshot unidade_medida = %', r.unidade_medida; end if;
  if r.responsavel_id <> auth.uid() or r.created_by <> auth.uid() then raise exception 'T04: responsável/created_by não é auth.uid()'; end if;
  if r.codigo !~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$' then raise exception 'T04: código fora do alfabeto: %', r.codigo; end if;
  select count(*) into n from public.etiqueta_movimentacoes where etiqueta_id = r.id and tipo = 'emissao';
  if n <> 1 then raise exception 'T04: movimentação emissao = %', n; end if;

  insert into public.etiquetas (unidade_id, produto_id, produto_nome, metodo)
  values ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', '', 'congelado')
  returning * into r;
  perform teste.put('et_cong', r.id::text);
  if r.data_validade <> r.data_manipulacao + interval '720 hours' then
    raise exception 'T04: validade congelado errada'; end if;

  -- validade_horas explícita prevalece
  insert into public.etiquetas (unidade_id, produto_id, produto_nome, metodo, validade_horas)
  values ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', '', 'resfriado', 10)
  returning * into r;
  perform teste.put('et_10h', r.id::text);
  if r.data_validade <> r.data_manipulacao + interval '10 hours' then raise exception 'T04: validade_horas explícita ignorada'; end if;

  -- método sem validade definida → erro
  begin
    insert into public.etiquetas (unidade_id, produto_id, produto_nome, metodo)
    values ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', '', 'ambiente');
  exception when raise_exception then v_ok := true;
  end;
  if not v_ok then raise exception 'T04: método sem validade deveria falhar'; end if;

  -- código informado em minúsculas é normalizado
  insert into public.etiquetas (codigo, unidade_id, produto_nome, metodo, validade_horas)
  values ('  abcd2345 ', '11111111-1111-1111-1111-111111111111', 'Livre', 'ambiente', 5)
  returning * into r;
  if r.codigo <> 'ABCD2345' then raise exception 'T04: código não normalizado: %', r.codigo; end if;
  raise notice 'OK T04 validade por método, snapshots, código, movimentação emissao';
end $$;
reset role;

-- código curto único em volume (gerador + unique)
do $$
declare n_total int := 5000; n_dist int; n_bad int;
begin
  select count(distinct c), count(*) filter (where c !~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$')
    into n_dist, n_bad
  from (select public.gerar_codigo_etiqueta() c from generate_series(1, n_total)) s;
  if n_dist <> n_total then raise exception 'T05: % códigos repetidos em %', n_total - n_dist, n_total; end if;
  if n_bad <> 0 then raise exception 'T05: % códigos fora do alfabeto', n_bad; end if;
  if not exists (select 1 from pg_indexes where tablename = 'etiquetas' and indexdef ilike '%unique%(codigo)%') then
    raise exception 'T05: falta índice unique em etiquetas.codigo'; end if;
  raise notice 'OK T05 código curto: 5000 únicos, alfabeto sem 0/O/1/I, constraint unique';
end $$;

-- ---------------------------------------------------------------------
-- T06 — consultar_etiqueta_publica como anon; anon NÃO lê tabelas
-- ---------------------------------------------------------------------
select teste.login(null);
set role anon;
do $$
declare r record; n int; v_ok boolean; v_cod text;
  t text;
begin
  -- código da etiqueta de Búzios: precisa ser lido pela função (anon não lê a tabela)
  v_ok := false;
  begin
    perform 1 from public.etiquetas limit 1;
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'T06: anon leu public.etiquetas'; end if;

  foreach t in array array['perfis','produtos','unidades','descartes','etiqueta_movimentacoes','vw_etiquetas','vw_etiquetas_a_vencer','registros_temperatura','fornecedores'] loop
    v_ok := false;
    begin
      execute format('select 1 from public.%I limit 1', t);
    exception when insufficient_privilege then v_ok := true;
    end;
    if not v_ok then raise exception 'T06: anon leu public.%', t; end if;
  end loop;

  v_ok := false;
  begin
    perform public.dar_baixa_etiqueta('00000000-0000-0000-0000-000000000000', 'consumida');
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'T06: anon executou dar_baixa_etiqueta'; end if;

  v_ok := false;
  begin
    perform public.dashboard_resumo(null);
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'T06: anon executou dashboard_resumo'; end if;

  select count(*) into n from public.consultar_etiqueta_publica('NAOEXIST');
  if n <> 0 then raise exception 'T06: código inexistente retornou linhas'; end if;
  raise notice 'OK T06a anon sem acesso a tabelas/views/RPCs internas';
end $$;
reset role;

-- código real (lido como superusuário) → consulta como anon em minúsculas
select teste.put('cod_res', (select codigo from public.etiquetas where id = teste.get('et_res')::uuid));
set role anon;
do $$
declare r record; n int;
begin
  select count(*) into n from public.consultar_etiqueta_publica(lower(' ' || teste.get('cod_res') || ' '));
  if n <> 1 then raise exception 'T06: consulta pública retornou % linhas', n; end if;
  select * into r from public.consultar_etiqueta_publica(lower(teste.get('cod_res')));
  if r.produto_nome <> 'Filé mignon porcionado' then raise exception 'T06: produto_nome %', r.produto_nome; end if;
  if r.unidade_nome <> 'Macaw Camboinhas' then raise exception 'T06: unidade_nome %', r.unidade_nome; end if;
  if r.responsavel_primeiro_nome <> 'Carlos' then raise exception 'T06: primeiro nome %', r.responsavel_primeiro_nome; end if;
  if r.situacao <> 'vence_72h' then raise exception 'T06: situacao % (72 h → vence_72h)', r.situacao; end if;
  raise notice 'OK T06b consulta pública anon (dados mínimos, código case-insensitive)';
end $$;
reset role;
do $$
declare cols text;
begin
  select string_agg(a, ',' order by a) into cols
  from unnest((select proargnames from pg_proc where proname = 'consultar_etiqueta_publica')) a;
  if cols ~ '(^|,)(id|custo|custo_estimado|fornecedor_nome|observacoes|responsavel_id|unidade_id)(,|$)' then
    raise exception 'T06: consulta pública expõe colunas sensíveis: %', cols; end if;
  raise notice 'OK T06c colunas expostas: %', cols;
end $$;

-- ---------------------------------------------------------------------
-- T07 — dar_baixa_etiqueta (consumo e descarte com custo); update de status
-- ---------------------------------------------------------------------
select teste.login('aaaaaaaa-0000-0000-0000-000000000002');
set role authenticated;
do $$
declare r public.etiquetas; d public.descartes; n int; v_ok boolean := false; v_id uuid;
begin
  -- descarte da etiqueta resfriada (2 kg de filé a 89,90) → custo 179,80
  r := public.dar_baixa_etiqueta(teste.get('et_res')::uuid, 'descartada', 'qualidade', null, 'teste');
  if r.status <> 'descartada' or r.status_em is null or r.status_por <> auth.uid() then
    raise exception 'T07: status/status_em/status_por após descarte: % % %', r.status, r.status_em, r.status_por; end if;
  select * into d from public.descartes where etiqueta_id = r.id;
  if not found then raise exception 'T07: descarte não registrado'; end if;
  if d.quantidade <> 2 or d.unidade_medida <> 'kg' or d.peso_kg <> 2 then
    raise exception 'T07: descarte qtd/um/peso = % % %', d.quantidade, d.unidade_medida, d.peso_kg; end if;
  if d.custo_estimado <> 179.80 then raise exception 'T07: custo_estimado = % (esperado 179.80)', d.custo_estimado; end if;
  if d.motivo <> 'qualidade' or d.responsavel_id <> auth.uid() then raise exception 'T07: motivo/responsável do descarte'; end if;
  select count(*) into n from public.etiqueta_movimentacoes where etiqueta_id = r.id and tipo = 'descarte'
     and status_anterior = 'ativa' and status_novo = 'descartada';
  if n <> 1 then raise exception 'T07: movimentação descarte = %', n; end if;
  select count(*) into n from public.etiqueta_movimentacoes where etiqueta_id = r.id and tipo = 'alteracao';
  if n <> 0 then raise exception 'T07: baixa gerou % movimentações espúrias de alteracao', n; end if;

  -- baixar de novo → erro
  begin
    perform public.dar_baixa_etiqueta(teste.get('et_res')::uuid, 'consumida');
  exception when invalid_parameter_value then v_ok := true;
  end;
  if not v_ok then raise exception 'T07: baixa dupla deveria falhar'; end if;

  -- status inválido
  v_ok := false;
  begin
    perform public.dar_baixa_etiqueta(teste.get('et_10h')::uuid, 'ativa');
  exception when invalid_parameter_value then v_ok := true;
  end;
  if not v_ok then raise exception 'T07: baixa com status ativa deveria falhar'; end if;

  -- consumo
  insert into public.etiquetas (unidade_id, produto_id, produto_nome, metodo)
  values ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000028', '', 'resfriado')
  returning id into v_id;
  r := public.dar_baixa_etiqueta(v_id, 'consumida');
  if r.status <> 'consumida' then raise exception 'T07: consumo'; end if;
  if exists (select 1 from public.descartes where etiqueta_id = v_id) then raise exception 'T07: consumo criou descarte'; end if;
  select count(*) into n from public.etiqueta_movimentacoes where etiqueta_id = v_id and tipo = 'consumo';
  if n <> 1 then raise exception 'T07: movimentação consumo = %', n; end if;

  -- descarte sem quantidade → 1 un, sem custo
  insert into public.etiquetas (unidade_id, produto_id, produto_nome, metodo)
  values ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000028', '', 'resfriado')
  returning id into v_id;
  perform public.dar_baixa_etiqueta(v_id, 'descartada');
  select * into d from public.descartes where etiqueta_id = v_id;
  if d.quantidade <> 1 or d.unidade_medida <> 'un' or d.motivo <> 'outro' then
    raise exception 'T07: descarte sem qtd: % % %', d.quantidade, d.unidade_medida, d.motivo; end if;

  -- update direto de status (via app) → status_em + movimentação
  insert into public.etiquetas (unidade_id, produto_id, produto_nome, metodo)
  values ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000028', '', 'resfriado')
  returning id into v_id;
  update public.etiquetas set status = 'vencida' where id = v_id returning * into r;
  if r.status_em is null then raise exception 'T07: update de status sem status_em'; end if;
  select count(*) into n from public.etiqueta_movimentacoes where etiqueta_id = v_id and tipo = 'vencimento';
  if n <> 1 then raise exception 'T07: movimentação vencimento = %', n; end if;
  -- descarte de etiqueta vencida → motivo padrão 'vencido'
  perform public.dar_baixa_etiqueta(v_id, 'descartada', null, 0.5);
  select * into d from public.descartes where etiqueta_id = v_id;
  if d.motivo <> 'vencido' or d.quantidade <> 0.5 or d.custo_estimado <> 4.95 then
    raise exception 'T07: descarte de vencida: % % %', d.motivo, d.quantidade, d.custo_estimado; end if;

  -- registrar_reimpressao
  n := public.registrar_reimpressao(teste.get('et_10h')::uuid);
  if n <> 1 then raise exception 'T07: reimpressão retornou %', n; end if;
  if not exists (select 1 from public.etiqueta_movimentacoes where etiqueta_id = teste.get('et_10h')::uuid and tipo = 'reimpressao') then
    raise exception 'T07: sem movimentação reimpressao'; end if;
  raise notice 'OK T07 dar_baixa (consumo/descarte com custo/peso), status_em, movimentações, reimpressão';
end $$;

-- ---------------------------------------------------------------------
-- T08 — etiqueta derivada (descongelamento e porcionamento)
-- ---------------------------------------------------------------------
do $$
declare o public.etiquetas; nv public.etiquetas; v_ok boolean := false; v_id uuid;
begin
  nv := public.emitir_etiqueta_derivada(teste.get('et_cong')::uuid, 'descongelamento', 'descongelando');
  select * into o from public.etiquetas where id = teste.get('et_cong')::uuid;
  if nv.etiqueta_origem_id <> o.id then raise exception 'T08: etiqueta_origem_id'; end if;
  if nv.metodo <> 'descongelando' or nv.tipo <> 'descongelamento' then raise exception 'T08: tipo/método'; end if;
  if nv.validade_horas <> 72 or nv.data_validade <> nv.data_manipulacao + interval '72 hours' then
    raise exception 'T08: validade descongelando = % h', nv.validade_horas; end if;
  if o.status <> 'consumida' then raise exception 'T08: origem congelada deveria virar consumida, está %', o.status; end if;
  if nv.produto_nome <> o.produto_nome or nv.unidade_id <> o.unidade_id then raise exception 'T08: herança'; end if;

  -- origem consumida → nova derivação falha
  begin
    perform public.emitir_etiqueta_derivada(o.id, 'porcionado', 'congelado');
  exception when invalid_parameter_value then v_ok := true;
  end;
  if not v_ok then raise exception 'T08: derivar de origem consumida deveria falhar'; end if;

  -- porcionado no mesmo método: validade limitada à da origem (10 h < 72 h)
  nv := public.emitir_etiqueta_derivada(teste.get('et_10h')::uuid, 'porcionado', 'resfriado', 0.3);
  select * into o from public.etiquetas where id = teste.get('et_10h')::uuid;
  if nv.data_validade <> o.data_validade then
    raise exception 'T08: porcionado ultrapassa validade da origem: % > %', nv.data_validade, o.data_validade; end if;
  if o.status <> 'ativa' then raise exception 'T08: porcionamento não deveria baixar a origem'; end if;
  if nv.quantidade <> 0.3 then raise exception 'T08: quantidade da derivada'; end if;
  raise notice 'OK T08 derivada: descongelamento (origem consumida, 72 h) e porcionado limitado à origem';
end $$;

-- ---------------------------------------------------------------------
-- T09 — vw_etiquetas_a_vencer e dashboard_resumo
-- ---------------------------------------------------------------------
do $$
declare n int; j json; v_ids uuid[];
begin
  select array_agg(id) into v_ids from public.vw_etiquetas_a_vencer;
  if not (teste.get('et_10h')::uuid = any(v_ids)) then raise exception 'T09: etiqueta de 10 h ausente em a_vencer'; end if;
  if exists (select 1 from public.vw_etiquetas_a_vencer where status <> 'ativa' or data_validade > now() + interval '72 hours') then
    raise exception 'T09: a_vencer contém etiqueta não ativa ou > 72 h'; end if;
  if exists (select 1 from public.vw_etiquetas_a_vencer where unidade_id <> '11111111-1111-1111-1111-111111111111') then
    raise exception 'T09: a_vencer vaza outra unidade'; end if;
  if exists (select 1 from public.vw_etiquetas where id = teste.get('et_10h')::uuid and situacao not in ('vence_hoje','vence_24h')) then
    raise exception 'T09: situação da etiqueta de 10 h incorreta'; end if;

  j := public.dashboard_resumo(null);
  if j is null then raise exception 'T09: dashboard nulo'; end if;
  if (select count(*) from json_object_keys(j)) <> 11 then raise exception 'T09: dashboard com chaves %', j; end if;
  select count(*) into n from public.etiquetas where status = 'ativa' and data_validade > now();
  if (j->>'ativas')::int <> n then raise exception 'T09: ativas % <> %', j->>'ativas', n; end if;
  if (j->>'emitidas_hoje')::int < 8 then raise exception 'T09: emitidas_hoje = %', j->>'emitidas_hoje'; end if;
  if (j->>'descartes_7d_custo')::numeric <> 184.75 then raise exception 'T09: descartes_7d_custo = % (esperado 184.75)', j->>'descartes_7d_custo'; end if;
  if (j->>'descartes_7d_kg')::numeric <> 2.5 then raise exception 'T09: descartes_7d_kg = %', j->>'descartes_7d_kg'; end if;
  if (j->>'equipamentos_sem_registro_12h')::int <> 5 then raise exception 'T09: equipamentos_sem_registro_12h = %', j->>'equipamentos_sem_registro_12h'; end if;
  -- filtro por Búzios: cozinheiro de Camboinhas não vê nada
  j := public.dashboard_resumo('22222222-2222-2222-2222-222222222222');
  if (j->>'ativas')::int <> 0 or (j->>'equipamentos_sem_registro_12h')::int <> 0 then
    raise exception 'T09: dashboard de Búzios vaza para cozinheiro de Camboinhas: %', j; end if;
  raise notice 'OK T09 vw_etiquetas_a_vencer + dashboard_resumo: %', public.dashboard_resumo(null);
end $$;

-- ---------------------------------------------------------------------
-- T10 — registros de temperatura: conformidade pela faixa do equipamento
-- ---------------------------------------------------------------------
do $$
declare r public.registros_temperatura; j json;
begin
  -- geladeira 0..5 °C
  insert into public.registros_temperatura (equipamento_id, unidade_id, temperatura_c, conforme)
  values ('e1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 9.0, true) returning * into r;
  if r.conforme then raise exception 'T10: 9 °C em geladeira 0–5 deveria ser não-conforme'; end if;
  insert into public.registros_temperatura (equipamento_id, unidade_id, temperatura_c, conforme)
  values ('e1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 3.5, false) returning * into r;
  if not r.conforme then raise exception 'T10: 3,5 °C deveria ser conforme (valor do cliente deve ser ignorado)'; end if;
  insert into public.registros_temperatura (equipamento_id, unidade_id, temperatura_c, conforme)
  values ('e1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 5.0, false) returning * into r;
  if not r.conforme then raise exception 'T10: limite superior 5 °C deveria ser conforme'; end if;
  -- freezer ≤ -18 (sem mínimo)
  insert into public.registros_temperatura (equipamento_id, unidade_id, temperatura_c, conforme)
  values ('e1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', -12, true) returning * into r;
  if r.conforme then raise exception 'T10: freezer a -12 deveria ser não-conforme'; end if;
  insert into public.registros_temperatura (equipamento_id, unidade_id, temperatura_c, conforme)
  values ('e1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', -22, false) returning * into r;
  if not r.conforme then raise exception 'T10: freezer a -22 deveria ser conforme'; end if;
  -- balcão térmico ≥ 60 (sem máximo)
  insert into public.registros_temperatura (equipamento_id, unidade_id, temperatura_c, conforme)
  values ('e1000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 55, true) returning * into r;
  if r.conforme then raise exception 'T10: balcão térmico a 55 deveria ser não-conforme'; end if;
  if r.responsavel_id <> auth.uid() then raise exception 'T10: responsavel_id default'; end if;

  j := public.dashboard_resumo('11111111-1111-1111-1111-111111111111');
  if (j->>'temperaturas_nao_conformes_24h')::int <> 3 then raise exception 'T10: dashboard não conformes = %', j->>'temperaturas_nao_conformes_24h'; end if;
  if (j->>'equipamentos_sem_registro_12h')::int <> 2 then raise exception 'T10: equipamentos sem registro = %', j->>'equipamentos_sem_registro_12h'; end if;
  if (select conforme from public.vw_temperaturas_ultimas where equipamento_id = 'e1000000-0000-0000-0000-000000000001') is null then
    raise exception 'T10: vw_temperaturas_ultimas sem último registro'; end if;
  raise notice 'OK T10 temperatura fora da faixa → não-conforme (geladeira/freezer/balcão) + dashboard';
end $$;

-- relatórios básicos
do $$
declare n int;
begin
  select count(*) into n from public.relatorio_desperdicio(null, (now() at time zone 'America/Sao_Paulo')::date - 1, (now() at time zone 'America/Sao_Paulo')::date + 1);
  if n = 0 then raise exception 'T11: relatorio_desperdicio vazio'; end if;
  select count(*) into n from public.relatorio_etiquetas(null, (now() at time zone 'America/Sao_Paulo')::date - 1, (now() at time zone 'America/Sao_Paulo')::date + 1);
  if n = 0 then raise exception 'T11: relatorio_etiquetas vazio'; end if;
  raise notice 'OK T11 relatórios de desperdício e etiquetas retornam dados';
end $$;
reset role;

-- ---------------------------------------------------------------------
-- T12 — cozinheiro de Búzios não vê dados de Camboinhas; admin vê tudo
-- ---------------------------------------------------------------------
select teste.login('aaaaaaaa-0000-0000-0000-000000000003');
set role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.etiquetas;
  if n <> 1 then raise exception 'T12: cozinheiro Búzios vê % etiquetas (esperado 1)', n; end if;
  select count(*) into n from public.descartes;
  if n <> 0 then raise exception 'T12: cozinheiro Búzios vê % descartes de Camboinhas', n; end if;
  select count(*) into n from public.registros_temperatura;
  if n <> 0 then raise exception 'T12: vê registros de temperatura de Camboinhas'; end if;
  raise notice 'OK T12 isolamento recíproco (Búzios)';
end $$;
reset role;
select teste.login('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
do $$
declare n int;
begin
  select count(distinct unidade_id) into n from public.etiquetas;
  if n <> 2 then raise exception 'T12: admin deveria ver as 2 unidades, vê %', n; end if;
  select count(*) into n from public.perfis;
  if n <> 3 then raise exception 'T12: admin vê % perfis', n; end if;
  -- último admin não pode ser rebaixado
  begin
    update public.perfis set papel = 'gerente' where id = auth.uid();
    raise exception 'T12: último admin foi rebaixado';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK T12 admin vê todas as unidades; último admin protegido';
end $$;
reset role;

-- marcar_etiquetas_vencidas (sem JWT = todas)
select teste.login(null);
do $$
declare n int;
begin
  update public.etiquetas set data_manipulacao = now() - interval '100 hours' where id = teste.get('et_10h')::uuid;
  if (select data_validade from public.etiquetas where id = teste.get('et_10h')::uuid) > now() then
    raise exception 'T13: alterar data_manipulacao não recalculou a validade'; end if;
  n := public.marcar_etiquetas_vencidas(null);
  if n < 1 then raise exception 'T13: marcar_etiquetas_vencidas = %', n; end if;
  if (select status from public.etiquetas where id = teste.get('et_10h')::uuid) <> 'vencida' then
    raise exception 'T13: etiqueta não marcada como vencida'; end if;
  raise notice 'OK T13 recálculo de validade no update + marcar_etiquetas_vencidas (%)', n;
end $$;

\o
\echo 'SMOKE SQL: TODOS OS TESTES PASSARAM'
rollback;
