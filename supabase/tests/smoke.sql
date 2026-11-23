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
-- T01 — primeiro usuário vira admin; seguintes viram cozinheiro INATIVO,
--       sem unidade (o metadata do signUp NÃO é confiável — bug #1); o admin
--       libera o acesso com admin_definir_perfil.
-- u_ger    = aaaaaaaa-0000-0000-0000-000000000004 (gerente Camboinhas)
-- u_estr   = aaaaaaaa-0000-0000-0000-000000000009 (signup público, nunca liberado)
-- ---------------------------------------------------------------------
do $$
declare v_papel text; v_unid uuid; v_nome text; v_ativo boolean;
begin
  if exists (select 1 from public.perfis) then
    raise exception 'T01 pré-condição: base já possui perfis — rode numa base limpa';
  end if;
  insert into auth.users (id, email, raw_user_meta_data) values
    ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@macaw.test', '{"nome":"Ana Admin"}');
  insert into auth.users (id, email, raw_user_meta_data) values
    ('aaaaaaaa-0000-0000-0000-000000000002', 'camb@macaw.test',
     '{"nome":"Carlos Cozinheiro","unidade_id":"11111111-1111-1111-1111-111111111111","papel":"admin"}');
  insert into auth.users (id, email, raw_user_meta_data) values
    ('aaaaaaaa-0000-0000-0000-000000000003', 'buz@macaw.test',
     '{"nome":"Bia Búzios","unidade_id":"22222222-2222-2222-2222-222222222222"}');
  insert into auth.users (id, email, raw_user_meta_data) values
    ('aaaaaaaa-0000-0000-0000-000000000004', 'ger@macaw.test', '{"nome":"Gil Gerente"}');
  insert into auth.users (id, email, raw_user_meta_data) values
    ('aaaaaaaa-0000-0000-0000-000000000009', 'estranho@macaw.test',
     '{"nome":"Estranho","unidade_id":"11111111-1111-1111-1111-111111111111"}');

  select papel, ativo into v_papel, v_ativo from public.perfis where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if v_papel <> 'admin' or not v_ativo then raise exception 'T01: 1º usuário deveria ser admin ativo, é % %', v_papel, v_ativo; end if;
  select papel, unidade_id, nome, ativo into v_papel, v_unid, v_nome, v_ativo from public.perfis where id = 'aaaaaaaa-0000-0000-0000-000000000002';
  if v_papel <> 'cozinheiro' then raise exception 'T01: 2º usuário deveria ser cozinheiro (papel do metadata ignorado), é %', v_papel; end if;
  if v_unid is not null then raise exception 'T01: unidade do metadata NÃO pode ser aplicada (bug #1)'; end if;
  if v_ativo then raise exception 'T01: usuário novo deveria nascer inativo'; end if;
  if v_nome <> 'Carlos Cozinheiro' then raise exception 'T01: nome do metadata não aplicado'; end if;
  raise notice 'OK T01 primeiro usuário admin / demais cozinheiro inativo sem unidade (metadata ignorado)';
end $$;

-- admin libera os usuários pela RPC
select teste.login('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
do $$
declare p public.perfis;
begin
  p := public.admin_definir_perfil('aaaaaaaa-0000-0000-0000-000000000002', 'cozinheiro', '11111111-1111-1111-1111-111111111111');
  if not p.ativo or p.unidade_id <> '11111111-1111-1111-1111-111111111111' then raise exception 'T01b: admin_definir_perfil não aplicou'; end if;
  perform public.admin_definir_perfil('aaaaaaaa-0000-0000-0000-000000000003', 'cozinheiro', '22222222-2222-2222-2222-222222222222');
  perform public.admin_definir_perfil('aaaaaaaa-0000-0000-0000-000000000004', 'gerente', '11111111-1111-1111-1111-111111111111', true, 'Gil Gerente');
  begin
    perform public.admin_definir_perfil('aaaaaaaa-0000-0000-0000-000000000009', 'gerente', null);
    raise exception 'T01b: gerente sem unidade foi aceito';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.admin_definir_perfil(auth.uid(), 'cozinheiro', '11111111-1111-1111-1111-111111111111');
    raise exception 'T01b: admin rebaixou a si mesmo';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK T01b admin_definir_perfil (libera, valida unidade, não se rebaixa)';
end $$;
reset role;

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

  -- update direto de status pelo cliente é bloqueado (bug #2); vencimento via RPC
  v_ok := false;
  begin
    update public.etiquetas set status = 'vencida' where id = teste.get('et_10h')::uuid;
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'T07: cliente alterou status diretamente'; end if;
  -- etiqueta já expirada (manipulada há 2 dias, 1 h de validade) → marcar_etiquetas_vencidas
  insert into public.etiquetas (unidade_id, produto_id, produto_nome, metodo, data_manipulacao, validade_horas)
  values ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000028', '', 'resfriado',
          now() - interval '2 days', 1)
  returning id into v_id;
  perform public.marcar_etiquetas_vencidas('11111111-1111-1111-1111-111111111111');
  select * into r from public.etiquetas where id = v_id;
  if r.status <> 'vencida' or r.status_em is null then raise exception 'T07: vencimento sem status/status_em'; end if;
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
  select * into nv from public.emitir_etiqueta_derivada(teste.get('et_cong')::uuid, 'descongelamento', 'descongelando');
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
  select * into nv from public.emitir_etiqueta_derivada(teste.get('et_10h')::uuid, 'porcionado', 'resfriado', 0.3);
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
  if n <> 5 then raise exception 'T12: admin vê % perfis', n; end if;
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

-- =====================================================================
-- Regressões da revisão (docs/REVISAO.md) — T14..T23
-- =====================================================================

-- T14 — RLS habilitada em todas as tabelas; anon sem acesso a NENHUMA
--       tabela/view e sem EXECUTE em funções (exceto consulta pública) — bug #9
do $$
declare t text;
begin
  select string_agg(relname, ', ') into t from pg_class
   where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity;
  if t is not null then raise exception 'T14: tabelas sem RLS: %', t; end if;
  select string_agg(p.proname, ', ') into t from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname <> 'consultar_etiqueta_publica'
     and has_function_privilege('anon', p.oid, 'execute');
  if t is not null then raise exception 'T14: anon executa: %', t; end if;
  if not has_function_privilege('anon', 'public.consultar_etiqueta_publica(text)', 'execute') then
    raise exception 'T14: anon perdeu a consulta pública'; end if;
  if not (select prosecdef from pg_proc where proname = 'gerar_codigo_etiqueta') then
    raise exception 'T14: gerar_codigo_etiqueta deveria ser security definer (bug #11)'; end if;
end $$;
select teste.login(null);
set role anon;
do $$
declare t text; v_ok boolean;
begin
  for t in select c.relname from pg_class c
            where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','v') loop
    v_ok := false;
    begin
      execute format('select 1 from public.%I limit 1', t);
    exception when insufficient_privilege then v_ok := true;
    end;
    if not v_ok then raise exception 'T14: anon leu public.%', t; end if;
  end loop;
  v_ok := false;
  begin perform public.is_admin(); exception when insufficient_privilege then v_ok := true; end;
  if not v_ok then raise exception 'T14: anon executou is_admin()'; end if;
  v_ok := false;
  begin perform public.admin_definir_perfil('aaaaaaaa-0000-0000-0000-000000000009', 'admin', null);
  exception when insufficient_privilege then v_ok := true; end;
  if not v_ok then raise exception 'T14: anon executou admin_definir_perfil'; end if;
  raise notice 'OK T14 RLS em todas as tabelas; anon sem tabelas/views/funções internas';
end $$;
reset role;

-- T15 — usuário de signup público (inativo, sem unidade) não vê nada e não se promove — bug #1
select teste.login('aaaaaaaa-0000-0000-0000-000000000009');
set role authenticated;
do $$
declare t text; n int; v_ok boolean;
begin
  foreach t in array array['unidades','categorias','fornecedores','produtos','modelos_etiqueta','checklists',
                           'checklist_itens','etiquetas','descartes','equipamentos','registros_temperatura',
                           'recebimentos','vw_etiquetas'] loop
    execute format('select count(*) from public.%I', t) into n;
    if n <> 0 then raise exception 'T15: usuário não liberado vê % linhas em %', n, t; end if;
  end loop;
  select count(*) into n from public.perfis;
  if n <> 1 then raise exception 'T15: deveria ver só o próprio perfil'; end if;
  v_ok := false;
  begin perform public.admin_definir_perfil(auth.uid(), 'admin', null);
  exception when insufficient_privilege then v_ok := true; end;
  if not v_ok then raise exception 'T15: não-admin usou admin_definir_perfil'; end if;
  v_ok := false;
  begin update public.perfis set ativo = true, unidade_id = '11111111-1111-1111-1111-111111111111' where id = auth.uid();
  exception when insufficient_privilege then v_ok := true; end;
  if not v_ok then raise exception 'T15: usuário se ativou/vinculou sozinho'; end if;
  v_ok := false;
  begin
    insert into public.etiquetas (unidade_id, produto_nome, metodo, validade_horas)
    values ('11111111-1111-1111-1111-111111111111', 'x', 'ambiente', 5);
  exception when insufficient_privilege then v_ok := true; end;
  if not v_ok then raise exception 'T15: usuário não liberado emitiu etiqueta'; end if;
  raise notice 'OK T15 signup público sem acesso até liberação pelo admin';
end $$;
reset role;
-- gerente também não usa a RPC de admin
select teste.login('aaaaaaaa-0000-0000-0000-000000000004');
set role authenticated;
do $$
begin
  begin
    perform public.admin_definir_perfil('aaaaaaaa-0000-0000-0000-000000000002', 'gerente', '11111111-1111-1111-1111-111111111111');
    raise exception 'T15: gerente usou admin_definir_perfil';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.perfis set papel = 'gerente' where id = 'aaaaaaaa-0000-0000-0000-000000000002';
    if found then raise exception 'T15: gerente alterou perfil de outro usuário'; end if;
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- T16 — cozinheiro: escrita direta em etiquetas restrita — bug #2
select teste.login('aaaaaaaa-0000-0000-0000-000000000002');
set role authenticated;
do $$
declare r public.etiquetas; v_ok boolean; v_id uuid; t text;
begin
  insert into public.etiquetas (unidade_id, produto_id, produto_nome, metodo,
                                responsavel_id, responsavel_nome, created_by, impressoes)
  values ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000006', '', 'resfriado',
          'aaaaaaaa-0000-0000-0000-000000000001', 'Chef Falso', 'aaaaaaaa-0000-0000-0000-000000000001', 50)
  returning * into r;
  if r.responsavel_id <> auth.uid() or r.created_by <> auth.uid() or r.responsavel_nome <> 'Carlos Cozinheiro'
     or r.impressoes <> 0 then
    raise exception 'T16: campos forjados aceitos: % % % %', r.responsavel_id, r.created_by, r.responsavel_nome, r.impressoes;
  end if;
  v_id := r.id;
  perform teste.put('et_t16', v_id::text);

  foreach t in array array[
    'data_validade = now() + interval ''365 days''', 'validade_horas = 9999', 'status = ''consumida''',
    'metodo = ''congelado''', 'data_manipulacao = now() + interval ''1 day''', 'unidade_id = unidade_id, lote = ''L2''',
    'impressoes = 7', 'responsavel_nome = ''Outro''', 'produto_nome = ''Outro produto''', 'alergenicos = array[''gluten'']'] loop
    v_ok := false;
    begin
      execute format('update public.etiquetas set %s where id = %L', t, v_id);
    exception when insufficient_privilege then v_ok := true;
    end;
    if not v_ok then raise exception 'T16: cliente conseguiu: %', t; end if;
  end loop;

  update public.etiquetas set observacoes = 'ok, campo editorial' where id = v_id;
  if not found then raise exception 'T16: observacoes deveria ser editável'; end if;

  foreach t in array array[
    $i$insert into public.etiquetas (unidade_id, produto_id, produto_nome, metodo, status) values ('11111111-1111-1111-1111-111111111111','a0000000-0000-0000-0000-000000000006','','resfriado','consumida')$i$,
    format($i$insert into public.etiquetas (unidade_id, produto_id, produto_nome, metodo, etiqueta_origem_id) values ('11111111-1111-1111-1111-111111111111','a0000000-0000-0000-0000-000000000006','','resfriado',%L)$i$, v_id)] loop
    v_ok := false;
    begin execute t; exception when insufficient_privilege then v_ok := true; end;
    if not v_ok then raise exception 'T16: insert indevido aceito: %', t; end if;
  end loop;

  -- após a baixa, reativar pelo cliente é impossível
  perform public.dar_baixa_etiqueta(v_id, 'descartada', 'qualidade');
  v_ok := false;
  begin update public.etiquetas set status = 'ativa' where id = v_id;
  exception when insufficient_privilege then v_ok := true; end;
  if not v_ok then raise exception 'T16: cliente reativou etiqueta descartada'; end if;
  raise notice 'OK T16 cliente não altera validade/status/snapshots; só observações e modelo';
end $$;

-- T17 — movimentações imutáveis pelo cliente — bug #3
do $$
declare v_ok boolean; n int;
begin
  v_ok := false;
  begin
    insert into public.etiqueta_movimentacoes (etiqueta_id, tipo, detalhes)
    values (teste.get('et_t16')::uuid, 'consumo', '{"fake":true}');
  exception when insufficient_privilege then v_ok := true; end;
  if not v_ok then raise exception 'T17: cliente inseriu movimentação'; end if;
  v_ok := false;
  begin delete from public.etiqueta_movimentacoes where etiqueta_id = teste.get('et_t16')::uuid;
  exception when insufficient_privilege then v_ok := true; end;
  if not v_ok then raise exception 'T17: cliente apagou movimentação'; end if;
  select count(*) into n from public.etiqueta_movimentacoes where etiqueta_id = teste.get('et_t16')::uuid;
  if n < 3 then raise exception 'T17: histórico incompleto (% movimentações)', n; end if;
  raise notice 'OK T17 histórico de movimentações imutável (gravado só por triggers/RPCs)';
end $$;

-- T18 — descartes: custo/peso do servidor, limites e unidade da etiqueta — bug #4
do $$
declare d public.descartes; v_ok boolean;
begin
  insert into public.descartes (unidade_id, produto_id, produto_nome, motivo, quantidade, unidade_medida,
                                custo_estimado, peso_kg, responsavel_id)
  values ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'x', 'outro', 1, 'kg',
          999999, 777, 'aaaaaaaa-0000-0000-0000-000000000001')
  returning * into d;
  if d.custo_estimado <> 89.90 or d.peso_kg <> 1 or d.responsavel_id <> auth.uid() then
    raise exception 'T18: custo/peso/responsável do cliente aceitos: % % %', d.custo_estimado, d.peso_kg, d.responsavel_id; end if;
  insert into public.descartes (unidade_id, produto_nome, motivo, quantidade, unidade_medida, custo_estimado)
  values ('11111111-1111-1111-1111-111111111111', 'avulso', 'outro', 1, 'un', 999999) returning * into d;
  if d.custo_estimado is not null then raise exception 'T18: custo avulso do cozinheiro aceito'; end if;

  v_ok := false;
  begin
    insert into public.descartes (unidade_id, produto_id, produto_nome, motivo, quantidade, unidade_medida)
    values ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'x', 'outro', 100000, 'kg');
  exception when insufficient_privilege then v_ok := true; end;
  if not v_ok then raise exception 'T18: descarte de 100 t aceito'; end if;
  v_ok := false;
  begin
    insert into public.descartes (unidade_id, produto_nome, motivo, quantidade, unidade_medida, descartado_em)
    values ('11111111-1111-1111-1111-111111111111', 'x', 'outro', 1, 'kg', now() + interval '2 days');
  exception when invalid_parameter_value then v_ok := true; end;
  if not v_ok then raise exception 'T18: descarte no futuro aceito'; end if;
  v_ok := false;
  begin
    insert into public.descartes (unidade_id, etiqueta_id, produto_nome, motivo, quantidade, unidade_medida)
    values ('11111111-1111-1111-1111-111111111111', teste.get('et_buz')::uuid, '', 'outro', 1, 'kg');
  exception when insufficient_privilege then v_ok := true; end;
  if not v_ok then raise exception 'T18: descarte com etiqueta de outra unidade aceito'; end if;
  v_ok := false;
  declare v_id uuid;
  begin
    insert into public.etiquetas (unidade_id, produto_id, produto_nome, metodo, quantidade)
    values ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', '', 'resfriado', 2)
    returning id into v_id;
    perform public.dar_baixa_etiqueta(v_id, 'descartada', null, 500);
  exception when invalid_parameter_value then v_ok := true; end;
  if not v_ok then raise exception 'T18: baixa maior que a quantidade da etiqueta aceita'; end if;
  raise notice 'OK T18 descarte: custo/peso calculados no servidor, limites, unidade da etiqueta';
end $$;
reset role;
-- gerente pode informar custo manual
select teste.login('aaaaaaaa-0000-0000-0000-000000000004');
set role authenticated;
do $$
declare d public.descartes;
begin
  insert into public.descartes (unidade_id, produto_nome, motivo, quantidade, unidade_medida, custo_estimado)
  values ('11111111-1111-1111-1111-111111111111', 'avulso', 'outro', 2, 'un', 30) returning * into d;
  if d.custo_estimado <> 30 then raise exception 'T18: custo do gerente ignorado'; end if;
end $$;
reset role;

-- T19 — derivada: várias cópias, manipulação informada, acesso por unidade — bugs #5/#6
select teste.login('aaaaaaaa-0000-0000-0000-000000000002');
set role authenticated;
do $$
declare v_org uuid; n int; v_ok boolean; v_manip timestamptz := date_trunc('minute', now() - interval '30 minutes');
  v_mins timestamptz; v_maxs timestamptz; v_val boolean; v_cods int; v_st text;
begin
  insert into public.etiquetas (unidade_id, produto_id, produto_nome, metodo, data_manipulacao)
  values ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', '', 'congelado',
          now() - interval '1 day')
  returning id into v_org;

  select count(*), min(data_manipulacao), max(data_manipulacao),
         bool_and(data_validade = v_manip + interval '72 hours' and etiqueta_origem_id = v_org),
         count(distinct codigo)
    into n, v_mins, v_maxs, v_val, v_cods
    from public.emitir_etiqueta_derivada(v_org, 'descongelamento', 'descongelando', null, null, 3, v_manip);
  if n <> 3 or v_cods <> 3 then raise exception 'T19: esperava 3 derivadas com códigos distintos, veio % / %', n, v_cods; end if;
  if v_mins <> v_manip or v_maxs <> v_manip then raise exception 'T19: data de manipulação informada ignorada (bug #6)'; end if;
  if not v_val then raise exception 'T19: validade/origem das derivadas incorreta'; end if;
  select status into v_st from public.etiquetas where id = v_org;
  if v_st <> 'consumida' then raise exception 'T19: origem congelada deveria estar consumida'; end if;
  select count(*) into n from public.etiqueta_movimentacoes where etiqueta_id = v_org and tipo = 'consumo';
  if n <> 1 then raise exception 'T19: origem baixada % vezes', n; end if;

  -- manipulação anterior à origem → erro
  insert into public.etiquetas (unidade_id, produto_id, produto_nome, metodo)
  values ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', '', 'congelado')
  returning id into v_org;
  v_ok := false;
  begin perform public.emitir_etiqueta_derivada(v_org, 'porcionado', 'congelado', null, null, 1, now() - interval '3 days');
  exception when invalid_parameter_value then v_ok := true; end;
  if not v_ok then raise exception 'T19: manipulação anterior à origem aceita'; end if;
  -- validade acima do padrão (congelado 720 h) por cozinheiro → erro
  v_ok := false;
  begin perform public.emitir_etiqueta_derivada(v_org, 'porcionado', 'resfriado', null, 500);
  exception when insufficient_privilege then v_ok := true; end;
  if not v_ok then raise exception 'T19: derivada acima do padrão aceita para cozinheiro'; end if;
  -- cópias fora do limite
  v_ok := false;
  begin perform public.emitir_etiqueta_derivada(v_org, 'porcionado', 'congelado', null, null, 101);
  exception when invalid_parameter_value then v_ok := true; end;
  if not v_ok then raise exception 'T19: 101 cópias aceitas'; end if;

  -- RPCs security definer não alcançam etiqueta de outra unidade
  v_ok := false;
  begin perform public.emitir_etiqueta_derivada(teste.get('et_buz')::uuid, 'porcionado', 'resfriado');
  exception when no_data_found then v_ok := true; end;
  if not v_ok then raise exception 'T19: derivou etiqueta de Búzios'; end if;
  v_ok := false;
  begin perform public.registrar_reimpressao(teste.get('et_buz')::uuid);
  exception when no_data_found then v_ok := true; end;
  if not v_ok then raise exception 'T19: reimprimiu etiqueta de Búzios'; end if;
  perform public.registrar_impressao(array[teste.get('et_buz')::uuid]);
  raise notice 'OK T19 derivada com cópias + manipulação; RPCs definer respeitam a unidade';
end $$;
reset role;
do $$
begin
  if (select impressoes from public.etiquetas where id = teste.get('et_buz')::uuid) <> 0 then
    raise exception 'T19: registrar_impressao alterou etiqueta de Búzios'; end if;
end $$;

-- T20 — limites de validade/manipulação na emissão direta — bug #8
select teste.login('aaaaaaaa-0000-0000-0000-000000000002');
set role authenticated;
do $$
declare t text; v_ok boolean; r public.etiquetas;
begin
  foreach t in array array[
    'validade_horas, data_manipulacao) values (''11111111-1111-1111-1111-111111111111'',''a0000000-0000-0000-0000-000000000001'','''',''resfriado'', 23976, now())',
    'validade_horas, data_manipulacao) values (''11111111-1111-1111-1111-111111111111'',''a0000000-0000-0000-0000-000000000001'','''',''resfriado'', 73, now())',
    'data_validade, data_manipulacao) values (''11111111-1111-1111-1111-111111111111'',''a0000000-0000-0000-0000-000000000001'','''',''resfriado'', now() + interval ''10 days'', now())',
    'validade_horas, data_manipulacao) values (''11111111-1111-1111-1111-111111111111'',''a0000000-0000-0000-0000-000000000001'','''',''resfriado'', 24, now() - interval ''10 days'')'] loop
    v_ok := false;
    begin
      execute 'insert into public.etiquetas (unidade_id, produto_id, produto_nome, metodo, ' || t;
    exception when insufficient_privilege or invalid_parameter_value then v_ok := true;
    end;
    if not v_ok then raise exception 'T20: cozinheiro emitiu fora do limite: %', t; end if;
  end loop;
  v_ok := false;
  begin
    insert into public.etiquetas (unidade_id, produto_id, produto_nome, metodo, data_manipulacao)
    values ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', '', 'resfriado', now() + interval '1 day');
  exception when invalid_parameter_value then v_ok := true; end;
  if not v_ok then raise exception 'T20: manipulação no futuro aceita'; end if;
  -- validade menor que o padrão é permitida
  insert into public.etiquetas (unidade_id, produto_id, produto_nome, metodo, validade_horas)
  values ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', '', 'resfriado', 48)
  returning * into r;
  if r.validade_horas <> 48 then raise exception 'T20: validade menor que o padrão rejeitada'; end if;
  raise notice 'OK T20 cozinheiro limitado ao padrão do produto; manipulação futura/retroativa bloqueada';
end $$;
reset role;
select teste.login('aaaaaaaa-0000-0000-0000-000000000004');
set role authenticated;
do $$
declare r public.etiquetas; v_ok boolean := false;
begin
  insert into public.etiquetas (unidade_id, produto_id, produto_nome, metodo, validade_horas)
  values ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', '', 'resfriado', 120)
  returning * into r;
  if r.validade_horas <> 120 then raise exception 'T20: gerente não pôde estender'; end if;
  begin
    insert into public.etiquetas (unidade_id, produto_id, produto_nome, metodo, validade_horas)
    values ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', '', 'resfriado', 9000);
  exception when invalid_parameter_value then v_ok := true; end;
  if not v_ok then raise exception 'T20: validade > 365 dias aceita para gerente'; end if;
  raise notice 'OK T20b gerente estende até 365 dias';
end $$;

-- T21 — gerente: checklist_itens só da própria unidade (global → admin); RLS por unidade — achado novo
do $$
declare v_ok boolean; v_ck uuid; n int;
begin
  v_ok := false;
  begin
    insert into public.checklist_itens (checklist_id, texto) values ('d0000000-0000-0000-0000-000000000001', 'item pirata');
  exception when insufficient_privilege then v_ok := true; end;
  if not v_ok then raise exception 'T21: gerente alterou checklist global'; end if;
  delete from public.checklist_itens where checklist_id = 'd0000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T21: gerente apagou % itens do checklist global', n; end if;
  insert into public.checklists (unidade_id, nome) values ('11111111-1111-1111-1111-111111111111', 'Da unidade')
  returning id into v_ck;
  insert into public.checklist_itens (checklist_id, texto) values (v_ck, 'item ok');
  -- gerente não cria produto global nem de Búzios; não vê Búzios
  v_ok := false;
  begin insert into public.produtos (nome, validade_resfriado_horas) values ('Global do gerente', 24);
  exception when insufficient_privilege then v_ok := true; end;
  if not v_ok then raise exception 'T21: gerente criou produto global'; end if;
  insert into public.produtos (nome, unidade_id, validade_resfriado_horas)
  values ('Exclusivo Camboinhas', '11111111-1111-1111-1111-111111111111', 24)
  returning id into v_ck;
  perform teste.put('prod_excl', v_ck::text);
  select count(*) into n from public.etiquetas where unidade_id = '22222222-2222-2222-2222-222222222222';
  if n <> 0 then raise exception 'T21: gerente de Camboinhas vê Búzios'; end if;
  select count(*) into n from public.perfis;
  if n <> 2 then raise exception 'T21: gerente deveria ver só os 2 perfis de Camboinhas, viu %', n; end if;
  raise notice 'OK T21 gerente restrito à própria unidade (checklists, produtos, perfis)';
end $$;
reset role;

-- produto exclusivo de Camboinhas não pode ser usado em Búzios (nem visto)
select teste.login('aaaaaaaa-0000-0000-0000-000000000003');
set role authenticated;
do $$
declare n int; t text;
begin
  select count(*) into n from public.produtos where nome = 'Exclusivo Camboinhas';
  if n <> 0 then raise exception 'T21: Búzios vê produto exclusivo de Camboinhas'; end if;
  begin
    insert into public.etiquetas (unidade_id, produto_id, produto_nome, metodo)
    select '22222222-2222-2222-2222-222222222222', id, '', 'resfriado' from (
      select teste.get('prod_excl')::uuid as id) x;
    raise exception 'T21: Búzios emitiu etiqueta com produto exclusivo de Camboinhas';
  exception when insufficient_privilege then null;
  end;
  -- matriz de RLS: nenhuma tabela com unidade_id vaza linhas de Camboinhas para Búzios
  for t in select c.table_name from information_schema.columns c
            join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
           where c.table_schema = 'public' and c.column_name = 'unidade_id' loop
    execute format('select count(*) from public.%I where unidade_id = %L', t, '11111111-1111-1111-1111-111111111111') into n;
    if n <> 0 then raise exception 'T21: Búzios vê % linhas de Camboinhas em %', n, t; end if;
  end loop;
end $$;
reset role;

-- T22 — temperatura: conformidade recalculada em qualquer update; responsável/horário — achado novo
select teste.login('aaaaaaaa-0000-0000-0000-000000000004');
set role authenticated;
do $$
declare r public.registros_temperatura; v_ok boolean := false;
begin
  insert into public.registros_temperatura (equipamento_id, temperatura_c, conforme, responsavel_id)
  values ('e1000000-0000-0000-0000-000000000001', 12, true, 'aaaaaaaa-0000-0000-0000-000000000001') returning * into r;
  if r.conforme or r.responsavel_id <> auth.uid() then raise exception 'T22: conforme/responsável do cliente aceitos'; end if;
  update public.registros_temperatura set conforme = true where id = r.id returning * into r;
  if r.conforme then raise exception 'T22: gerente marcou conforme sem mudar a temperatura'; end if;
  begin
    insert into public.registros_temperatura (equipamento_id, temperatura_c, conforme, registrado_em)
    values ('e1000000-0000-0000-0000-000000000001', 3, true, now() + interval '1 day');
  exception when invalid_parameter_value then v_ok := true; end;
  if not v_ok then raise exception 'T22: registro no futuro aceito'; end if;
  raise notice 'OK T22 temperatura: conformidade sempre do servidor; responsável e horário controlados';
end $$;
reset role;
select teste.login('aaaaaaaa-0000-0000-0000-000000000002');
set role authenticated;
do $$
declare v_ok boolean := false;
begin
  begin
    insert into public.registros_temperatura (equipamento_id, temperatura_c, conforme, registrado_em)
    values ('e1000000-0000-0000-0000-000000000001', 3, true, now() - interval '3 days');
  exception when insufficient_privilege then v_ok := true; end;
  if not v_ok then raise exception 'T22: cozinheiro registrou temperatura retroativa de 3 dias'; end if;
end $$;
reset role;

\o
\echo 'SMOKE SQL: TODOS OS TESTES PASSARAM'
rollback;
