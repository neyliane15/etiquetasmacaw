-- ============================================================
-- ETIQUETAS MACAW — SCRIPT ÚNICO (0001 a 0005 + seed)
-- Cole TUDO no Supabase → SQL Editor → New query → Run.
-- Pode rodar mais de uma vez sem duplicar dados.
-- ============================================================

-- >>>>>>>>>> INÍCIO: migrations/0001_schema.sql <<<<<<<<<<
-- =====================================================================
-- Etiquetas Macaw — 0001_schema.sql (Backend A)
-- Extensões, enums, tabelas, constraints, índices, funções e triggers.
-- Contrato: docs/PLANO.md §4.1–§4.5. RLS/grants ficam em 0002; views/RPCs em 0003.
-- Script idempotente sempre que razoável (pode ser reaplicado).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 4.1 Extensões
-- ---------------------------------------------------------------------
create extension if not exists pgcrypto;   -- utilitários (gen_random_uuid é nativa no PG13+)
create extension if not exists citext;     -- e-mails
create extension if not exists pg_trgm;    -- busca por nome

-- ---------------------------------------------------------------------
-- 4.2 Enums (criados apenas se ainda não existirem)
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'papel_usuario' and typnamespace = 'public'::regnamespace) then
    create type public.papel_usuario as enum ('admin','gerente','cozinheiro');
  end if;
  if not exists (select 1 from pg_type where typname = 'metodo_conservacao' and typnamespace = 'public'::regnamespace) then
    create type public.metodo_conservacao as enum ('resfriado','congelado','ambiente','descongelando');
  end if;
  if not exists (select 1 from pg_type where typname = 'tipo_etiqueta' and typnamespace = 'public'::regnamespace) then
    create type public.tipo_etiqueta as enum ('manipulacao','produto_aberto','porcionado','producao','descongelamento','amostra','recebimento');
  end if;
  if not exists (select 1 from pg_type where typname = 'status_etiqueta' and typnamespace = 'public'::regnamespace) then
    create type public.status_etiqueta as enum ('ativa','consumida','descartada','vencida');
  end if;
  if not exists (select 1 from pg_type where typname = 'tipo_movimentacao' and typnamespace = 'public'::regnamespace) then
    create type public.tipo_movimentacao as enum ('emissao','reimpressao','consumo','descarte','vencimento','alteracao','reativacao');
  end if;
  if not exists (select 1 from pg_type where typname = 'motivo_descarte' and typnamespace = 'public'::regnamespace) then
    create type public.motivo_descarte as enum ('vencido','contaminado','qualidade','sobra_producao','sobra_cliente','queda_acidente','temperatura_inadequada','devolucao','outro');
  end if;
  if not exists (select 1 from pg_type where typname = 'unidade_medida' and typnamespace = 'public'::regnamespace) then
    create type public.unidade_medida as enum ('kg','g','l','ml','un','porcao','cx','pct');
  end if;
  if not exists (select 1 from pg_type where typname = 'tipo_equipamento' and typnamespace = 'public'::regnamespace) then
    create type public.tipo_equipamento as enum ('geladeira','freezer','camara_fria','camara_congelada','balcao_refrigerado','balcao_termico','ultracongelador','pass_through','outro');
  end if;
  if not exists (select 1 from pg_type where typname = 'status_recebimento' and typnamespace = 'public'::regnamespace) then
    create type public.status_recebimento as enum ('conforme','parcial','recusado');
  end if;
  if not exists (select 1 from pg_type where typname = 'frequencia_checklist' and typnamespace = 'public'::regnamespace) then
    create type public.frequencia_checklist as enum ('diario','abertura','fechamento','semanal','mensal','eventual');
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- Função genérica de updated_at (usada pelos triggers trg_<tabela>_updated_at)
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Gerador de código curto da etiqueta.
-- Criada antes da tabela: o corpo plpgsql só é validado na execução.
-- Alfabeto sem 0/O/1/I (32 símbolos => byte % 32 sem viés).
-- ---------------------------------------------------------------------
create or replace function public.gerar_codigo_etiqueta()
returns text
language plpgsql
volatile
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

-- =====================================================================
-- 4.3 Tabelas (ordem respeita as FKs)
-- =====================================================================

-- Unidades (lojas do grupo)
create table if not exists public.unidades (
  id                  uuid primary key default gen_random_uuid(),
  nome                text not null unique,
  slug                text not null unique,
  endereco            text,
  cidade              text,
  uf                  char(2),
  cnpj                text,
  telefone            text,
  responsavel_tecnico text,
  registro_rt         text,
  ativo               boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Perfis (1:1 com auth.users)
create table if not exists public.perfis (
  id         uuid primary key references auth.users(id) on delete cascade,
  nome       text not null,
  email      citext not null unique,
  papel      public.papel_usuario not null default 'cozinheiro',
  unidade_id uuid references public.unidades(id) on delete set null, -- null = todas (somente admin)
  ativo      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Categorias (globais ao grupo)
create table if not exists public.categorias (
  id                     uuid primary key default gen_random_uuid(),
  nome                   text not null unique,
  cor                    text not null default '#79731B',
  ordem                  int not null default 0,
  temp_recebimento_max_c numeric(5,1),
  ativo                  boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- Fornecedores (globais)
create table if not exists public.fornecedores (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  razao_social text,
  cnpj         text unique,
  contato      text,
  telefone     text,
  email        text,
  observacoes  text,
  ativo        boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Produtos (globais; unidade_id null = todas as unidades). Validades em horas.
create table if not exists public.produtos (
  id                           uuid primary key default gen_random_uuid(),
  nome                         text not null,
  categoria_id                 uuid references public.categorias(id) on delete set null,
  fornecedor_padrao_id         uuid references public.fornecedores(id) on delete set null,
  unidade_id                   uuid references public.unidades(id) on delete cascade,
  unidade_medida               public.unidade_medida not null default 'kg',
  metodo_padrao                public.metodo_conservacao not null default 'resfriado',
  validade_resfriado_horas     int check (validade_resfriado_horas > 0),
  validade_congelado_horas     int check (validade_congelado_horas > 0),
  validade_ambiente_horas      int check (validade_ambiente_horas > 0),
  validade_descongelando_horas int check (validade_descongelando_horas > 0),
  alergenicos                  text[] not null default '{}',
  sif                          text,
  codigo_barras                text,
  custo_unitario               numeric(12,2),
  observacoes                  text,
  ativo                        boolean not null default true,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

-- Modelos de etiqueta (dimensões em mm, campos na ordem de exibição)
create table if not exists public.modelos_etiqueta (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  largura_mm    numeric(6,2) not null check (largura_mm between 20 and 150),
  altura_mm     numeric(6,2) not null check (altura_mm between 15 and 200),
  campos        text[] not null default '{produto,metodo,data_manipulacao,validade,responsavel,qr}',
  fonte_base_pt numeric(4,1) not null default 7,
  mostrar_logo  boolean not null default false,
  unidade_id    uuid references public.unidades(id) on delete cascade,
  padrao        boolean not null default false,
  ativo         boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Um modelo padrão por escopo (global ou por unidade)
create unique index if not exists modelos_etiqueta_um_padrao
  on public.modelos_etiqueta ((coalesce(unidade_id, '00000000-0000-0000-0000-000000000000'::uuid)))
  where padrao;

-- Recebimentos (cabeçalho)
create table if not exists public.recebimentos (
  id                      uuid primary key default gen_random_uuid(),
  unidade_id              uuid not null references public.unidades(id),
  fornecedor_id           uuid references public.fornecedores(id) on delete set null,
  nota_fiscal             text,
  recebido_em             timestamptz not null default now(),
  temperatura_veiculo_c   numeric(5,1),
  veiculo_limpo           boolean,
  entregador_uniformizado boolean,
  status                  public.status_recebimento not null default 'conforme',
  observacoes             text,
  responsavel_id          uuid default auth.uid() references public.perfis(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- Itens do recebimento
create table if not exists public.recebimento_itens (
  id                      uuid primary key default gen_random_uuid(),
  recebimento_id          uuid not null references public.recebimentos(id) on delete cascade,
  produto_id              uuid references public.produtos(id) on delete set null,
  produto_nome            text not null,
  quantidade              numeric(12,3) not null check (quantidade > 0),
  unidade_medida          public.unidade_medida not null,
  lote                    text,
  data_fabricacao         date,
  data_validade           date,
  temperatura_c           numeric(5,1),
  sif                     text,
  embalagem_integra       boolean not null default true,
  conforme                boolean not null default true,
  motivo_nao_conformidade text,
  created_at              timestamptz not null default now()
);

-- Etiquetas (cada etiqueta = ponto de controle rastreável)
create table if not exists public.etiquetas (
  id                       uuid primary key default gen_random_uuid(),
  codigo                   text not null unique default public.gerar_codigo_etiqueta(),
  unidade_id               uuid not null references public.unidades(id) on delete restrict,
  produto_id               uuid references public.produtos(id) on delete set null,
  produto_nome             text not null,
  categoria_nome           text,
  tipo                     public.tipo_etiqueta not null default 'manipulacao',
  metodo                   public.metodo_conservacao not null,
  data_manipulacao         timestamptz not null default now(),
  validade_horas           int,
  data_validade            timestamptz not null,
  data_validade_fabricante date,
  lote                     text,
  fornecedor_id            uuid references public.fornecedores(id) on delete set null,
  fornecedor_nome          text,
  sif                      text,
  quantidade               numeric(12,3) check (quantidade >= 0),
  unidade_medida           public.unidade_medida,
  alergenicos              text[] not null default '{}',
  observacoes              text,
  responsavel_id           uuid default auth.uid() references public.perfis(id) on delete set null,
  responsavel_nome         text,
  modelo_id                uuid references public.modelos_etiqueta(id) on delete set null,
  etiqueta_origem_id       uuid references public.etiquetas(id) on delete set null,
  recebimento_item_id      uuid references public.recebimento_itens(id) on delete set null,
  status                   public.status_etiqueta not null default 'ativa',
  status_em                timestamptz,
  status_por               uuid references public.perfis(id) on delete set null,
  impressoes               int not null default 0,
  created_by               uuid default auth.uid() references public.perfis(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint etiquetas_validade_apos_manipulacao check (data_validade > data_manipulacao)
);

-- Histórico de movimentações da etiqueta
create table if not exists public.etiqueta_movimentacoes (
  id              bigint generated always as identity primary key,
  etiqueta_id     uuid not null references public.etiquetas(id) on delete cascade,
  tipo            public.tipo_movimentacao not null,
  status_anterior public.status_etiqueta,
  status_novo     public.status_etiqueta,
  detalhes        jsonb not null default '{}',
  usuario_id      uuid default auth.uid() references public.perfis(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- Descartes / desperdício
create table if not exists public.descartes (
  id             uuid primary key default gen_random_uuid(),
  unidade_id     uuid not null references public.unidades(id),
  etiqueta_id    uuid references public.etiquetas(id) on delete set null,
  produto_id     uuid references public.produtos(id) on delete set null,
  produto_nome   text not null,
  motivo         public.motivo_descarte not null,
  quantidade     numeric(12,3) not null check (quantidade > 0),
  unidade_medida public.unidade_medida not null,
  peso_kg        numeric(12,3),
  custo_estimado numeric(12,2),
  observacao     text,
  responsavel_id uuid default auth.uid() references public.perfis(id) on delete set null,
  descartado_em  timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

-- Equipamentos de frio/calor
create table if not exists public.equipamentos (
  id          uuid primary key default gen_random_uuid(),
  unidade_id  uuid not null references public.unidades(id) on delete cascade,
  nome        text not null,
  tipo        public.tipo_equipamento not null,
  temp_min_c  numeric(5,1),
  temp_max_c  numeric(5,1),
  localizacao text,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Registros de temperatura
create table if not exists public.registros_temperatura (
  id             uuid primary key default gen_random_uuid(),
  equipamento_id uuid not null references public.equipamentos(id) on delete cascade,
  unidade_id     uuid not null references public.unidades(id),
  temperatura_c  numeric(5,1) not null,
  conforme       boolean not null,
  acao_corretiva text,
  responsavel_id uuid default auth.uid() references public.perfis(id) on delete set null,
  registrado_em  timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

-- Checklists (null em unidade_id = todas)
create table if not exists public.checklists (
  id         uuid primary key default gen_random_uuid(),
  unidade_id uuid references public.unidades(id) on delete cascade,
  nome       text not null,
  descricao  text,
  frequencia public.frequencia_checklist not null default 'diario',
  ativo      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.checklist_itens (
  id           uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.checklists(id) on delete cascade,
  ordem        int not null default 0,
  texto        text not null,
  obrigatorio  boolean not null default true,
  created_at   timestamptz not null default now()
);

create table if not exists public.checklist_execucoes (
  id              uuid primary key default gen_random_uuid(),
  checklist_id    uuid not null references public.checklists(id) on delete cascade,
  unidade_id      uuid not null references public.unidades(id),
  responsavel_id  uuid default auth.uid() references public.perfis(id) on delete set null,
  executado_em    timestamptz not null default now(),
  observacoes     text,
  total_itens     int not null default 0,
  itens_conformes int not null default 0,
  created_at      timestamptz not null default now()
);

create table if not exists public.checklist_respostas (
  id          uuid primary key default gen_random_uuid(),
  execucao_id uuid not null references public.checklist_execucoes(id) on delete cascade,
  item_id     uuid references public.checklist_itens(id) on delete set null,
  item_texto  text not null,
  conforme    boolean not null,
  observacao  text,
  constraint checklist_respostas_execucao_item_key unique (execucao_id, item_id)
);

-- =====================================================================
-- 4.4 Índices (nomes explícitos = nomes padrão do Postgres, p/ idempotência)
-- =====================================================================
create index if not exists perfis_unidade_id_idx                 on public.perfis (unidade_id);
create index if not exists produtos_categoria_id_idx             on public.produtos (categoria_id);
create index if not exists produtos_unidade_id_idx               on public.produtos (unidade_id);
create index if not exists produtos_nome_trgm                    on public.produtos using gin (nome gin_trgm_ops);
create index if not exists etiquetas_unidade_id_status_data_validade_idx on public.etiquetas (unidade_id, status, data_validade);
create index if not exists etiquetas_produto_id_idx              on public.etiquetas (produto_id);
create index if not exists etiquetas_created_at_idx              on public.etiquetas (created_at desc);
create index if not exists etiquetas_etiqueta_origem_id_idx      on public.etiquetas (etiqueta_origem_id);
create index if not exists etiqueta_movimentacoes_etiqueta_id_created_at_idx on public.etiqueta_movimentacoes (etiqueta_id, created_at);
create index if not exists descartes_unidade_id_descartado_em_idx on public.descartes (unidade_id, descartado_em);
create index if not exists recebimentos_unidade_id_recebido_em_idx on public.recebimentos (unidade_id, recebido_em desc);
create index if not exists recebimento_itens_recebimento_id_idx  on public.recebimento_itens (recebimento_id);
create index if not exists equipamentos_unidade_id_idx           on public.equipamentos (unidade_id);
create index if not exists registros_temperatura_equipamento_id_registrado_em_idx on public.registros_temperatura (equipamento_id, registrado_em desc);
create index if not exists registros_temperatura_unidade_id_registrado_em_idx     on public.registros_temperatura (unidade_id, registrado_em desc);
create index if not exists checklist_itens_checklist_id_ordem_idx on public.checklist_itens (checklist_id, ordem);
create index if not exists checklist_execucoes_unidade_id_executado_em_idx on public.checklist_execucoes (unidade_id, executado_em desc);

-- =====================================================================
-- 4.5 Funções e triggers
-- =====================================================================

-- Triggers de updated_at em todas as tabelas que possuem a coluna
do $$
declare
  t text;
begin
  foreach t in array array[
    'unidades','perfis','categorias','fornecedores','produtos','modelos_etiqueta',
    'recebimentos','etiquetas','equipamentos','checklists'
  ] loop
    execute format('drop trigger if exists %I on public.%I', 'trg_' || t || '_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      'trg_' || t || '_updated_at', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------
-- Validade padrão (horas) do produto para um método; null se não houver
-- ---------------------------------------------------------------------
create or replace function public.validade_padrao_horas(p_produto_id uuid, p_metodo public.metodo_conservacao)
returns int
language plpgsql
stable
set search_path = public
as $$
declare
  v_horas int;
begin
  if p_produto_id is null or p_metodo is null then
    return null;
  end if;
  select case p_metodo
           when 'resfriado'     then p.validade_resfriado_horas
           when 'congelado'     then p.validade_congelado_horas
           when 'ambiente'      then p.validade_ambiente_horas
           when 'descongelando' then p.validade_descongelando_horas
         end
    into v_horas
    from public.produtos p
   where p.id = p_produto_id;
  return v_horas;
end;
$$;

-- ---------------------------------------------------------------------
-- Calcula a data de validade (exceção se não houver horas definidas)
-- ---------------------------------------------------------------------
create or replace function public.calcular_validade(
  p_produto_id uuid,
  p_metodo     public.metodo_conservacao,
  p_data       timestamptz default now(),
  p_horas      int default null
)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  v_horas int := coalesce(p_horas, public.validade_padrao_horas(p_produto_id, p_metodo));
begin
  if v_horas is null then
    raise exception 'Produto sem validade definida para o método %', p_metodo;
  end if;
  return coalesce(p_data, now()) + make_interval(hours => v_horas);
end;
$$;

-- ---------------------------------------------------------------------
-- Helpers de autorização (usados pelas políticas de 0002)
-- security definer: leem perfis sem depender de RLS (evita recursão).
-- ---------------------------------------------------------------------
create or replace function public.meu_papel()
returns public.papel_usuario
language sql
stable
security definer
set search_path = public
as $$
  select p.papel from public.perfis p where p.id = auth.uid() and p.ativo;
$$;

create or replace function public.minha_unidade()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.unidade_id from public.perfis p where p.id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.meu_papel() = 'admin', false);
$$;

create or replace function public.is_gestor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.meu_papel() in ('admin','gerente'), false);
$$;

create or replace function public.tem_acesso_unidade(p_unidade uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
      or exists (
           select 1
             from public.perfis p
            where p.id = auth.uid()
              and p.ativo
              and ( (p.unidade_id is null and p.papel = 'admin')
                    or p.unidade_id = p_unidade )
         );
$$;

-- ---------------------------------------------------------------------
-- etiquetas: BEFORE INSERT OR UPDATE — snapshots, validade, status
-- security definer: as leituras de snapshot (produto, categoria,
-- fornecedor, perfil do responsável) não dependem da RLS do usuário;
-- a própria linha de etiqueta continua sujeita à RLS.
-- ---------------------------------------------------------------------
create or replace function public.etiquetas_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prod     public.produtos%rowtype;
  v_cat_nome text;
begin
  if tg_op = 'INSERT' then
    -- Código curto
    if new.codigo is null or btrim(new.codigo) = '' then
      new.codigo := public.gerar_codigo_etiqueta();
    else
      new.codigo := upper(btrim(new.codigo));
    end if;

    -- Snapshot do produto
    if new.produto_id is not null then
      select * into v_prod from public.produtos where id = new.produto_id;
      if found then
        if new.produto_nome is null or btrim(new.produto_nome) = '' then
          new.produto_nome := v_prod.nome;
        end if;
        if new.categoria_nome is null and v_prod.categoria_id is not null then
          select c.nome into v_cat_nome from public.categorias c where c.id = v_prod.categoria_id;
          new.categoria_nome := v_cat_nome;
        end if;
        if new.alergenicos is null or cardinality(new.alergenicos) = 0 then
          new.alergenicos := coalesce(v_prod.alergenicos, '{}');
        end if;
        if new.unidade_medida is null then
          new.unidade_medida := v_prod.unidade_medida;
        end if;
        if new.sif is null then
          new.sif := v_prod.sif;
        end if;
      end if;
    end if;
    new.alergenicos := coalesce(new.alergenicos, '{}');

    -- Snapshot do fornecedor
    if new.fornecedor_id is not null and new.fornecedor_nome is null then
      select f.nome into new.fornecedor_nome from public.fornecedores f where f.id = new.fornecedor_id;
    end if;

    -- Responsável
    new.responsavel_id := coalesce(new.responsavel_id, auth.uid());
    if new.responsavel_id is not null and new.responsavel_nome is null then
      select p.nome into new.responsavel_nome from public.perfis p where p.id = new.responsavel_id;
    end if;
    new.created_by := coalesce(new.created_by, auth.uid());

    -- Validade
    new.data_manipulacao := coalesce(new.data_manipulacao, now());
    new.validade_horas   := coalesce(new.validade_horas, public.validade_padrao_horas(new.produto_id, new.metodo));
    if new.data_validade is null and new.validade_horas is not null then
      new.data_validade := new.data_manipulacao + make_interval(hours => new.validade_horas);
    end if;
    if new.data_validade is null then
      raise exception 'Produto sem validade definida para o método %', new.metodo;
    end if;

    -- Status inicial diferente de ativa (raro) registra quando/quem
    if new.status is distinct from 'ativa' and new.status_em is null then
      new.status_em  := now();
      new.status_por := coalesce(new.status_por, auth.uid());
    end if;

  elsif tg_op = 'UPDATE' then
    -- Recalcula validade se método/manipulação/horas mudaram e data_validade não foi alterada explicitamente
    if (new.metodo is distinct from old.metodo
        or new.data_manipulacao is distinct from old.data_manipulacao
        or new.validade_horas is distinct from old.validade_horas)
       and new.data_validade is not distinct from old.data_validade then
      -- Mudou o método sem informar novas horas: usa a validade padrão do novo método
      if new.metodo is distinct from old.metodo and new.validade_horas is not distinct from old.validade_horas then
        new.validade_horas := coalesce(public.validade_padrao_horas(new.produto_id, new.metodo), new.validade_horas);
      end if;
      if new.validade_horas is not null then
        new.data_validade := new.data_manipulacao + make_interval(hours => new.validade_horas);
      end if;
    end if;

    -- Mudança de status
    if new.status is distinct from old.status then
      if new.status <> 'ativa' then
        new.status_em  := now();
        new.status_por := coalesce(new.status_por, auth.uid());
      else
        -- reativação: limpa marcação de baixa
        new.status_em  := null;
        new.status_por := null;
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_etiquetas_before_write on public.etiquetas;
create trigger trg_etiquetas_before_write
  before insert or update on public.etiquetas
  for each row execute function public.etiquetas_before_write();

-- ---------------------------------------------------------------------
-- etiquetas: AFTER INSERT OR UPDATE — registra movimentações
-- ---------------------------------------------------------------------
create or replace function public.etiquetas_after_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo    public.tipo_movimentacao;
  v_ignorar constant text[] := array['impressoes','updated_at','status','status_em','status_por'];
  v_campos  text[];
begin
  if tg_op = 'INSERT' then
    insert into public.etiqueta_movimentacoes (etiqueta_id, tipo, status_anterior, status_novo, detalhes, usuario_id)
    values (
      new.id, 'emissao', null, new.status,
      jsonb_build_object('tipo', new.tipo, 'metodo', new.metodo, 'data_validade', new.data_validade),
      coalesce(auth.uid(), new.created_by)
    );
    return new;
  end if;

  -- UPDATE: mudança de status
  if new.status is distinct from old.status then
    v_tipo := case new.status
                when 'consumida'  then 'consumo'
                when 'descartada' then 'descarte'
                when 'vencida'    then 'vencimento'
                when 'ativa'      then 'reativacao'
              end::public.tipo_movimentacao;
    insert into public.etiqueta_movimentacoes (etiqueta_id, tipo, status_anterior, status_novo, detalhes, usuario_id)
    values (new.id, v_tipo, old.status, new.status, '{}'::jsonb, coalesce(new.status_por, auth.uid()));
  end if;

  -- UPDATE: outros campos (exceto impressoes/updated_at e campos de status)
  select array_agg(n.key order by n.key)
    into v_campos
    from jsonb_each(to_jsonb(new)) n
    join jsonb_each(to_jsonb(old)) o on o.key = n.key
   where n.value is distinct from o.value
     and not (n.key = any (v_ignorar));

  if v_campos is not null and cardinality(v_campos) > 0 then
    insert into public.etiqueta_movimentacoes (etiqueta_id, tipo, status_anterior, status_novo, detalhes, usuario_id)
    values (new.id, 'alteracao', old.status, new.status, jsonb_build_object('campos', to_jsonb(v_campos)), auth.uid());
  end if;

  return new;
end;
$$;

drop trigger if exists trg_etiquetas_after_write on public.etiquetas;
create trigger trg_etiquetas_after_write
  after insert or update on public.etiquetas
  for each row execute function public.etiquetas_after_write();

-- ---------------------------------------------------------------------
-- descartes: BEFORE INSERT — herda dados da etiqueta, calcula peso e custo
-- ---------------------------------------------------------------------
create or replace function public.descartes_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_et   public.etiquetas%rowtype;
  v_prod public.produtos%rowtype;
begin
  if new.etiqueta_id is not null then
    select * into v_et from public.etiquetas where id = new.etiqueta_id;
    if found then
      new.produto_id     := coalesce(new.produto_id, v_et.produto_id);
      new.produto_nome   := coalesce(nullif(btrim(new.produto_nome), ''), v_et.produto_nome);
      new.unidade_id     := coalesce(new.unidade_id, v_et.unidade_id);
      new.unidade_medida := coalesce(new.unidade_medida, v_et.unidade_medida);
    end if;
  end if;

  if new.produto_id is not null then
    select * into v_prod from public.produtos where id = new.produto_id;
    if found then
      new.produto_nome := coalesce(nullif(btrim(new.produto_nome), ''), v_prod.nome);
    end if;
  end if;

  -- Peso em kg (informado prevalece)
  if new.peso_kg is null then
    new.peso_kg := case new.unidade_medida
                     when 'kg' then new.quantidade
                     when 'g'  then new.quantidade / 1000
                     when 'l'  then new.quantidade
                     when 'ml' then new.quantidade / 1000
                     else null
                   end;
  end if;

  -- Custo estimado: só quando a unidade de medida é a mesma do produto
  if new.custo_estimado is null
     and v_prod.id is not null
     and v_prod.custo_unitario is not null
     and v_prod.unidade_medida = new.unidade_medida then
    new.custo_estimado := round(new.quantidade * v_prod.custo_unitario, 2);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_descartes_before_insert on public.descartes;
create trigger trg_descartes_before_insert
  before insert on public.descartes
  for each row execute function public.descartes_before_insert();

-- ---------------------------------------------------------------------
-- registros_temperatura: BEFORE INSERT (e UPDATE) — unidade e conformidade
-- ---------------------------------------------------------------------
create or replace function public.registros_temperatura_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eq public.equipamentos%rowtype;
begin
  select * into v_eq from public.equipamentos where id = new.equipamento_id;
  if not found then
    raise exception 'Equipamento % não encontrado', new.equipamento_id;
  end if;
  new.unidade_id := v_eq.unidade_id;
  new.conforme   := (v_eq.temp_min_c is null or new.temperatura_c >= v_eq.temp_min_c)
                and (v_eq.temp_max_c is null or new.temperatura_c <= v_eq.temp_max_c);
  return new;
end;
$$;

drop trigger if exists trg_registros_temperatura_before_insert on public.registros_temperatura;
create trigger trg_registros_temperatura_before_insert
  before insert or update of equipamento_id, temperatura_c on public.registros_temperatura
  for each row execute function public.registros_temperatura_before_insert();

-- ---------------------------------------------------------------------
-- checklist_respostas: AFTER INSERT/UPDATE/DELETE — totais da execução
-- security definer: cozinheiro registra respostas, mas UPDATE em
-- checklist_execucoes é restrito a gestores pela RLS.
-- ---------------------------------------------------------------------
create or replace function public.checklist_execucoes_totais()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  if tg_op = 'DELETE' then
    v_ids := array[old.execucao_id];
  elsif tg_op = 'UPDATE' then
    v_ids := array[old.execucao_id, new.execucao_id];
  else
    v_ids := array[new.execucao_id];
  end if;

  update public.checklist_execucoes e
     set total_itens     = coalesce(s.total, 0),
         itens_conformes = coalesce(s.conformes, 0)
    from (
      select x.id,
             (select count(*) from public.checklist_respostas r where r.execucao_id = x.id)::int as total,
             (select count(*) from public.checklist_respostas r where r.execucao_id = x.id and r.conforme)::int as conformes
        from unnest(v_ids) as x(id)
    ) s
   where e.id = s.id;

  return null;
end;
$$;

drop trigger if exists trg_checklist_respostas_totais on public.checklist_respostas;
create trigger trg_checklist_respostas_totais
  after insert or update or delete on public.checklist_respostas
  for each row execute function public.checklist_execucoes_totais();

-- ---------------------------------------------------------------------
-- auth.users: AFTER INSERT — cria o perfil (primeiro usuário vira admin)
-- O papel do metadata é ignorado por segurança.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta    jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_unid_tx text  := nullif(btrim(v_meta->>'unidade_id'), '');
  v_unidade uuid;
  v_papel   public.papel_usuario;
  v_email   text  := coalesce(new.email, new.id::text || '@sem-email.local');
begin
  -- unidade_id do metadata apenas se for uuid válido e existente
  if v_unid_tx is not null
     and v_unid_tx ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select u.id into v_unidade from public.unidades u where u.id = v_unid_tx::uuid;
  end if;

  -- Serializa o bootstrap para que apenas um usuário vire o primeiro admin
  perform pg_advisory_xact_lock(hashtext('macaw.handle_new_user'));
  if exists (select 1 from public.perfis where papel = 'admin') then
    v_papel := 'cozinheiro';
  else
    v_papel := 'admin';
  end if;

  insert into public.perfis (id, nome, email, papel, unidade_id)
  values (
    new.id,
    coalesce(nullif(btrim(v_meta->>'nome'), ''), split_part(v_email, '@', 1)),
    v_email,
    v_papel,
    v_unidade
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- >>>>>>>>>> FIM: migrations/0001_schema.sql <<<<<<<<<<

-- >>>>>>>>>> INÍCIO: migrations/0002_rls_policies.sql <<<<<<<<<<
-- =============================================================================
-- Etiquetas Macaw — 0002_rls_policies.sql
-- Row Level Security, grants e proteção de campos do perfil.
-- Depende de 0001_schema.sql (tabelas + helpers meu_papel/minha_unidade/
-- is_admin/is_gestor/tem_acesso_unidade).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Trigger perfis_protege_campos
-- Usuário comum só pode alterar o próprio `nome`. Papel, unidade, ativo e e-mail
-- só mudam por admin (ou por processos do servidor sem auth.uid(), ex.: service
-- role / SQL editor). Também impede remover o último admin ativo.
-- -----------------------------------------------------------------------------
create or replace function public.perfis_protege_campos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Processos de servidor (sem JWT) podem tudo.
  if auth.uid() is null then
    return new;
  end if;

  if not public.is_admin() then
    if new.id is distinct from old.id
       or new.papel is distinct from old.papel
       or new.unidade_id is distinct from old.unidade_id
       or new.ativo is distinct from old.ativo
       or new.email is distinct from old.email then
      raise exception 'Somente administradores podem alterar papel, unidade, e-mail ou situação do usuário.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- Admin: não permitir deixar o sistema sem nenhum admin ativo.
  if old.papel = 'admin' and old.ativo
     and (new.papel <> 'admin' or not new.ativo) then
    if not exists (
      select 1 from public.perfis p
      where p.papel = 'admin' and p.ativo and p.id <> old.id
    ) then
      raise exception 'Não é possível remover o último administrador ativo.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists perfis_protege_campos on public.perfis;
create trigger perfis_protege_campos
  before update on public.perfis
  for each row execute function public.perfis_protege_campos();

-- -----------------------------------------------------------------------------
-- Habilitar RLS em todas as tabelas
-- -----------------------------------------------------------------------------
alter table public.unidades               enable row level security;
alter table public.perfis                 enable row level security;
alter table public.categorias             enable row level security;
alter table public.fornecedores           enable row level security;
alter table public.produtos               enable row level security;
alter table public.modelos_etiqueta       enable row level security;
alter table public.recebimentos           enable row level security;
alter table public.recebimento_itens      enable row level security;
alter table public.etiquetas              enable row level security;
alter table public.etiqueta_movimentacoes enable row level security;
alter table public.descartes              enable row level security;
alter table public.equipamentos           enable row level security;
alter table public.registros_temperatura  enable row level security;
alter table public.checklists             enable row level security;
alter table public.checklist_itens        enable row level security;
alter table public.checklist_execucoes    enable row level security;
alter table public.checklist_respostas    enable row level security;

-- -----------------------------------------------------------------------------
-- unidades
-- -----------------------------------------------------------------------------
drop policy if exists unidades_select on public.unidades;
create policy unidades_select on public.unidades
  for select to authenticated using (true);
drop policy if exists unidades_insert on public.unidades;
create policy unidades_insert on public.unidades
  for insert to authenticated with check (public.is_admin());
drop policy if exists unidades_update on public.unidades;
create policy unidades_update on public.unidades
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists unidades_delete on public.unidades;
create policy unidades_delete on public.unidades
  for delete to authenticated using (public.is_admin());

-- -----------------------------------------------------------------------------
-- perfis (insert só pelo trigger handle_new_user)
-- -----------------------------------------------------------------------------
drop policy if exists perfis_select on public.perfis;
create policy perfis_select on public.perfis
  for select to authenticated using (
    id = auth.uid()
    or public.is_admin()
    or (public.is_gestor() and unidade_id = public.minha_unidade())
  );
drop policy if exists perfis_update on public.perfis;
create policy perfis_update on public.perfis
  for update to authenticated
  using (public.is_admin() or id = auth.uid())
  with check (public.is_admin() or id = auth.uid());
drop policy if exists perfis_delete on public.perfis;
create policy perfis_delete on public.perfis
  for delete to authenticated using (public.is_admin());

-- -----------------------------------------------------------------------------
-- categorias, fornecedores (globais)
-- -----------------------------------------------------------------------------
drop policy if exists categorias_select on public.categorias;
create policy categorias_select on public.categorias
  for select to authenticated using (true);
drop policy if exists categorias_insert on public.categorias;
create policy categorias_insert on public.categorias
  for insert to authenticated with check (public.is_gestor());
drop policy if exists categorias_update on public.categorias;
create policy categorias_update on public.categorias
  for update to authenticated using (public.is_gestor()) with check (public.is_gestor());
drop policy if exists categorias_delete on public.categorias;
create policy categorias_delete on public.categorias
  for delete to authenticated using (public.is_admin());

drop policy if exists fornecedores_select on public.fornecedores;
create policy fornecedores_select on public.fornecedores
  for select to authenticated using (true);
drop policy if exists fornecedores_insert on public.fornecedores;
create policy fornecedores_insert on public.fornecedores
  for insert to authenticated with check (public.is_gestor());
drop policy if exists fornecedores_update on public.fornecedores;
create policy fornecedores_update on public.fornecedores
  for update to authenticated using (public.is_gestor()) with check (public.is_gestor());
drop policy if exists fornecedores_delete on public.fornecedores;
create policy fornecedores_delete on public.fornecedores
  for delete to authenticated using (public.is_admin());

-- -----------------------------------------------------------------------------
-- produtos, modelos_etiqueta, checklists (unidade_id null = global)
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['produtos', 'modelos_etiqueta', 'checklists'] loop
    execute format('drop policy if exists %1$s_select on public.%1$I', t);
    execute format($p$
      create policy %1$s_select on public.%1$I
        for select to authenticated
        using (unidade_id is null or public.tem_acesso_unidade(unidade_id))
    $p$, t);

    execute format('drop policy if exists %1$s_insert on public.%1$I', t);
    execute format($p$
      create policy %1$s_insert on public.%1$I
        for insert to authenticated
        with check (
          public.is_gestor() and (
            case when unidade_id is null then public.is_admin()
                 else public.tem_acesso_unidade(unidade_id) end
          )
        )
    $p$, t);

    execute format('drop policy if exists %1$s_update on public.%1$I', t);
    execute format($p$
      create policy %1$s_update on public.%1$I
        for update to authenticated
        using (
          public.is_gestor() and (
            case when unidade_id is null then public.is_admin()
                 else public.tem_acesso_unidade(unidade_id) end
          )
        )
        with check (
          public.is_gestor() and (
            case when unidade_id is null then public.is_admin()
                 else public.tem_acesso_unidade(unidade_id) end
          )
        )
    $p$, t);

    execute format('drop policy if exists %1$s_delete on public.%1$I', t);
    execute format($p$
      create policy %1$s_delete on public.%1$I
        for delete to authenticated using (public.is_admin())
    $p$, t);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- checklist_itens (via checklist acessível)
-- -----------------------------------------------------------------------------
drop policy if exists checklist_itens_select on public.checklist_itens;
create policy checklist_itens_select on public.checklist_itens
  for select to authenticated using (
    exists (
      select 1 from public.checklists c
      where c.id = checklist_itens.checklist_id
        and (c.unidade_id is null or public.tem_acesso_unidade(c.unidade_id))
    )
  );
drop policy if exists checklist_itens_insert on public.checklist_itens;
create policy checklist_itens_insert on public.checklist_itens
  for insert to authenticated with check (public.is_gestor());
drop policy if exists checklist_itens_update on public.checklist_itens;
create policy checklist_itens_update on public.checklist_itens
  for update to authenticated using (public.is_gestor()) with check (public.is_gestor());
drop policy if exists checklist_itens_delete on public.checklist_itens;
create policy checklist_itens_delete on public.checklist_itens
  for delete to authenticated using (public.is_gestor());

-- -----------------------------------------------------------------------------
-- etiquetas
-- -----------------------------------------------------------------------------
drop policy if exists etiquetas_select on public.etiquetas;
create policy etiquetas_select on public.etiquetas
  for select to authenticated using (public.tem_acesso_unidade(unidade_id));
drop policy if exists etiquetas_insert on public.etiquetas;
create policy etiquetas_insert on public.etiquetas
  for insert to authenticated with check (public.tem_acesso_unidade(unidade_id));
drop policy if exists etiquetas_update on public.etiquetas;
create policy etiquetas_update on public.etiquetas
  for update to authenticated
  using (public.tem_acesso_unidade(unidade_id))
  with check (public.tem_acesso_unidade(unidade_id));
drop policy if exists etiquetas_delete on public.etiquetas;
create policy etiquetas_delete on public.etiquetas
  for delete to authenticated using (public.is_admin());

-- -----------------------------------------------------------------------------
-- etiqueta_movimentacoes (somente leitura/inserção; histórico imutável)
-- -----------------------------------------------------------------------------
drop policy if exists etiqueta_movimentacoes_select on public.etiqueta_movimentacoes;
create policy etiqueta_movimentacoes_select on public.etiqueta_movimentacoes
  for select to authenticated using (
    exists (
      select 1 from public.etiquetas e
      where e.id = etiqueta_movimentacoes.etiqueta_id
        and public.tem_acesso_unidade(e.unidade_id)
    )
  );
drop policy if exists etiqueta_movimentacoes_insert on public.etiqueta_movimentacoes;
create policy etiqueta_movimentacoes_insert on public.etiqueta_movimentacoes
  for insert to authenticated with check (
    exists (
      select 1 from public.etiquetas e
      where e.id = etiqueta_movimentacoes.etiqueta_id
        and public.tem_acesso_unidade(e.unidade_id)
    )
  );

-- -----------------------------------------------------------------------------
-- descartes, recebimentos, registros_temperatura, checklist_execucoes
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['descartes', 'recebimentos', 'registros_temperatura', 'checklist_execucoes'] loop
    execute format('drop policy if exists %1$s_select on public.%1$I', t);
    execute format($p$
      create policy %1$s_select on public.%1$I
        for select to authenticated using (public.tem_acesso_unidade(unidade_id))
    $p$, t);

    execute format('drop policy if exists %1$s_insert on public.%1$I', t);
    execute format($p$
      create policy %1$s_insert on public.%1$I
        for insert to authenticated with check (public.tem_acesso_unidade(unidade_id))
    $p$, t);

    execute format('drop policy if exists %1$s_update on public.%1$I', t);
    execute format($p$
      create policy %1$s_update on public.%1$I
        for update to authenticated
        using (public.is_gestor() and public.tem_acesso_unidade(unidade_id))
        with check (public.is_gestor() and public.tem_acesso_unidade(unidade_id))
    $p$, t);

    execute format('drop policy if exists %1$s_delete on public.%1$I', t);
    execute format($p$
      create policy %1$s_delete on public.%1$I
        for delete to authenticated using (public.is_admin())
    $p$, t);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- recebimento_itens (via recebimento acessível)
-- -----------------------------------------------------------------------------
drop policy if exists recebimento_itens_select on public.recebimento_itens;
create policy recebimento_itens_select on public.recebimento_itens
  for select to authenticated using (
    exists (select 1 from public.recebimentos r
            where r.id = recebimento_itens.recebimento_id
              and public.tem_acesso_unidade(r.unidade_id))
  );
drop policy if exists recebimento_itens_insert on public.recebimento_itens;
create policy recebimento_itens_insert on public.recebimento_itens
  for insert to authenticated with check (
    exists (select 1 from public.recebimentos r
            where r.id = recebimento_itens.recebimento_id
              and public.tem_acesso_unidade(r.unidade_id))
  );
drop policy if exists recebimento_itens_update on public.recebimento_itens;
create policy recebimento_itens_update on public.recebimento_itens
  for update to authenticated
  using (
    public.is_gestor() and exists (select 1 from public.recebimentos r
            where r.id = recebimento_itens.recebimento_id
              and public.tem_acesso_unidade(r.unidade_id))
  )
  with check (
    public.is_gestor() and exists (select 1 from public.recebimentos r
            where r.id = recebimento_itens.recebimento_id
              and public.tem_acesso_unidade(r.unidade_id))
  );
drop policy if exists recebimento_itens_delete on public.recebimento_itens;
create policy recebimento_itens_delete on public.recebimento_itens
  for delete to authenticated using (
    public.is_gestor() and exists (select 1 from public.recebimentos r
            where r.id = recebimento_itens.recebimento_id
              and public.tem_acesso_unidade(r.unidade_id))
  );

-- -----------------------------------------------------------------------------
-- checklist_respostas (via execução acessível)
-- -----------------------------------------------------------------------------
drop policy if exists checklist_respostas_select on public.checklist_respostas;
create policy checklist_respostas_select on public.checklist_respostas
  for select to authenticated using (
    exists (select 1 from public.checklist_execucoes x
            where x.id = checklist_respostas.execucao_id
              and public.tem_acesso_unidade(x.unidade_id))
  );
drop policy if exists checklist_respostas_insert on public.checklist_respostas;
create policy checklist_respostas_insert on public.checklist_respostas
  for insert to authenticated with check (
    exists (select 1 from public.checklist_execucoes x
            where x.id = checklist_respostas.execucao_id
              and public.tem_acesso_unidade(x.unidade_id))
  );
drop policy if exists checklist_respostas_update on public.checklist_respostas;
create policy checklist_respostas_update on public.checklist_respostas
  for update to authenticated
  using (
    public.is_gestor() and exists (select 1 from public.checklist_execucoes x
            where x.id = checklist_respostas.execucao_id
              and public.tem_acesso_unidade(x.unidade_id))
  )
  with check (
    public.is_gestor() and exists (select 1 from public.checklist_execucoes x
            where x.id = checklist_respostas.execucao_id
              and public.tem_acesso_unidade(x.unidade_id))
  );
drop policy if exists checklist_respostas_delete on public.checklist_respostas;
create policy checklist_respostas_delete on public.checklist_respostas
  for delete to authenticated using (
    public.is_gestor() and exists (select 1 from public.checklist_execucoes x
            where x.id = checklist_respostas.execucao_id
              and public.tem_acesso_unidade(x.unidade_id))
  );

-- -----------------------------------------------------------------------------
-- equipamentos
-- -----------------------------------------------------------------------------
drop policy if exists equipamentos_select on public.equipamentos;
create policy equipamentos_select on public.equipamentos
  for select to authenticated using (public.tem_acesso_unidade(unidade_id));
drop policy if exists equipamentos_insert on public.equipamentos;
create policy equipamentos_insert on public.equipamentos
  for insert to authenticated
  with check (public.is_gestor() and public.tem_acesso_unidade(unidade_id));
drop policy if exists equipamentos_update on public.equipamentos;
create policy equipamentos_update on public.equipamentos
  for update to authenticated
  using (public.is_gestor() and public.tem_acesso_unidade(unidade_id))
  with check (public.is_gestor() and public.tem_acesso_unidade(unidade_id));
drop policy if exists equipamentos_delete on public.equipamentos;
create policy equipamentos_delete on public.equipamentos
  for delete to authenticated using (public.is_admin());

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- Helpers de autorização usados nas políticas
grant execute on function public.meu_papel() to authenticated;
grant execute on function public.minha_unidade() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_gestor() to authenticated;
grant execute on function public.tem_acesso_unidade(uuid) to authenticated;

-- Objetos criados futuramente pelo dono (postgres) seguem o mesmo padrão
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;
alter default privileges in schema public
  revoke all on tables from anon;

-- O grant de consultar_etiqueta_publica(text) para anon fica em 0003,
-- junto da criação da função.

-- >>>>>>>>>> FIM: migrations/0002_rls_policies.sql <<<<<<<<<<

-- >>>>>>>>>> INÍCIO: migrations/0003_rpc_views.sql <<<<<<<<<<
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

-- >>>>>>>>>> FIM: migrations/0003_rpc_views.sql <<<<<<<<<<

-- >>>>>>>>>> INÍCIO: migrations/0004_correcoes_revisao.sql <<<<<<<<<<
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

-- >>>>>>>>>> FIM: migrations/0004_correcoes_revisao.sql <<<<<<<<<<

-- >>>>>>>>>> INÍCIO: migrations/0005_corrige_codigo_etiqueta.sql <<<<<<<<<<
-- =====================================================================
-- 0005 — Corrige erro "function gen_random_bytes(integer) does not exist"
-- ao emitir etiquetas no Supabase.
--
-- Causa: no Supabase a extensão pgcrypto fica no schema "extensions", e a
-- função gerar_codigo_etiqueta() roda com search_path = public, então não
-- enxergava gen_random_bytes(). Agora usamos gen_random_uuid(), que é nativa
-- do Postgres (pg_catalog) e funciona em qualquer search_path.
--
-- Quem já aplicou 0001–0004: rode SOMENTE este arquivo no SQL Editor.
-- =====================================================================

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
    v_bytes  := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');  -- 16 bytes aleatórios
    v_codigo := '';
    for i in 0..7 loop
      v_codigo := v_codigo || substr(v_alfabeto, (get_byte(v_bytes, i) % v_tam) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.etiquetas e where e.codigo = v_codigo);
  end loop;
  return v_codigo;
end;
$$;

-- (create or replace mantém as permissões já definidas em 0002/0004)

-- Teste rápido (deve retornar um código de 8 caracteres):
-- select public.gerar_codigo_etiqueta();

-- >>>>>>>>>> FIM: migrations/0005_corrige_codigo_etiqueta.sql <<<<<<<<<<

-- >>>>>>>>>> INÍCIO: seed.sql <<<<<<<<<<
-- =============================================================================
-- Etiquetas Macaw — seed.sql
-- Dados iniciais: unidades, categorias, fornecedores, produtos, modelos,
-- equipamentos e checklists. Idempotente (UUIDs fixos + on conflict do nothing).
--
-- ATENÇÃO: as validades abaixo são referências aproximadas baseadas na
-- Portaria CVS-5/2013 e na RDC 216/2004 e em práticas usuais de cozinha
-- profissional. DEVEM SER VALIDADAS pelo Responsável Técnico (RT) de cada
-- unidade e ajustadas conforme as instruções do fabricante.
-- Validades sempre em HORAS (24 = 1 dia; 72 = 3 dias; 720 = 30 dias).
--
-- Não cria usuários (auth). Veja supabase/README.md para o bootstrap do admin.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Unidades
-- -----------------------------------------------------------------------------
insert into public.unidades (id, nome, slug, cidade, uf) values
  ('11111111-1111-1111-1111-111111111111', 'Macaw Camboinhas', 'camboinhas', 'Niterói',           'RJ'),
  ('22222222-2222-2222-2222-222222222222', 'Macaw Búzios',     'buzios',     'Armação dos Búzios', 'RJ')
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Categorias (tons terrosos harmonizados com o oliva #79731B)
-- -----------------------------------------------------------------------------
insert into public.categorias (id, nome, cor, ordem, temp_recebimento_max_c) values
  ('c0000000-0000-0000-0000-000000000001', 'Carnes bovinas',               '#A9502F',  1,   7.0),
  ('c0000000-0000-0000-0000-000000000002', 'Aves',                         '#B8862B',  2,   4.0),
  ('c0000000-0000-0000-0000-000000000003', 'Suínos',                       '#8A6A7E',  3,   7.0),
  ('c0000000-0000-0000-0000-000000000004', 'Pescados e frutos do mar',     '#5E7C86',  4,   3.0),
  ('c0000000-0000-0000-0000-000000000005', 'Laticínios e frios',           '#9A7B4F',  5,   7.0),
  ('c0000000-0000-0000-0000-000000000006', 'Hortifrúti',                   '#79731B',  6,  10.0),
  ('c0000000-0000-0000-0000-000000000007', 'Ovos',                         '#C2A15E',  7,   null),
  ('c0000000-0000-0000-0000-000000000008', 'Secos e grãos',                '#7A7262',  8,   null),
  ('c0000000-0000-0000-0000-000000000009', 'Molhos e caldos',              '#6E4B3A',  9,   null),
  ('c0000000-0000-0000-0000-000000000010', 'Massas',                       '#B59A6A', 10,   null),
  ('c0000000-0000-0000-0000-000000000011', 'Sobremesas e confeitaria',     '#A3807A', 11,   null),
  ('c0000000-0000-0000-0000-000000000012', 'Bebidas',                      '#5E6B6E', 12,   null),
  ('c0000000-0000-0000-0000-000000000013', 'Congelados industrializados',  '#3E5560', 13, -12.0),
  ('c0000000-0000-0000-0000-000000000014', 'Pré-preparos / mise en place', '#5C5714', 14,   null),
  ('c0000000-0000-0000-0000-000000000015', 'Pães',                         '#C4A27A', 15,   null)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Fornecedores (exemplos — substituir pelos fornecedores reais)
-- -----------------------------------------------------------------------------
insert into public.fornecedores (id, nome, observacoes) values
  ('f0000000-0000-0000-0000-000000000001', 'Frigorífico Serra Fluminense', 'Carnes bovinas e suínas. Exigir SIF e temperatura ≤ 7 °C.'),
  ('f0000000-0000-0000-0000-000000000002', 'Pescados Itaipu',              'Pescados frescos e frutos do mar. Recebimento ≤ 3 °C, gelo em escamas.'),
  ('f0000000-0000-0000-0000-000000000003', 'Hortifrúti Região dos Lagos',  'Entrega diária de folhas, legumes e frutas.'),
  ('f0000000-0000-0000-0000-000000000004', 'Laticínios Vale do Paraíba',   'Queijos, manteiga, creme de leite e iogurtes.'),
  ('f0000000-0000-0000-0000-000000000005', 'Distribuidora Niterói Secos',  'Secos, grãos, enlatados, azeite e farinhas.'),
  ('f0000000-0000-0000-0000-000000000006', 'Granja Boa Esperança',         'Aves e ovos. Ovos com carimbo de inspeção.')
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Produtos (globais: unidade_id null)
-- Colunas de validade: resfriado / congelado / ambiente / descongelando (horas)
-- -----------------------------------------------------------------------------
insert into public.produtos (
  id, nome, categoria_id, fornecedor_padrao_id, unidade_medida, metodo_padrao,
  validade_resfriado_horas, validade_congelado_horas, validade_ambiente_horas, validade_descongelando_horas,
  alergenicos, custo_unitario, observacoes
) values
  -- Carnes bovinas
  ('a0000000-0000-0000-0000-000000000001', 'Filé mignon porcionado', 'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'kg', 'resfriado',
    72, 720, null, 72, '{}', 89.90, 'Manter de 0 a 5 °C. Descongelar sob refrigeração.'),
  ('a0000000-0000-0000-0000-000000000002', 'Picanha', 'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'kg', 'resfriado',
    72, 720, null, 72, '{}', 79.90, 'Manter de 0 a 5 °C.'),
  ('a0000000-0000-0000-0000-000000000003', 'Carne moída', 'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'kg', 'resfriado',
    24, 720, null, 24, '{}', 42.00, 'Moer no dia. Alta perecibilidade: validade de 24 h resfriada.'),
  ('a0000000-0000-0000-0000-000000000004', 'Contrafilé (ancho)', 'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'kg', 'resfriado',
    72, 720, null, 72, '{}', 69.90, null),
  ('a0000000-0000-0000-0000-000000000005', 'Ragu de costela (cozido)', 'c0000000-0000-0000-0000-000000000001', null, 'kg', 'resfriado',
    72, 720, null, 72, '{aipo}', 48.00, 'Resfriar de 60 °C a 10 °C em até 2 h antes de armazenar.'),
  -- Aves
  ('a0000000-0000-0000-0000-000000000006', 'Peito de frango', 'c0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000006', 'kg', 'resfriado',
    72, 720, null, 72, '{}', 22.90, 'Manter de 0 a 4 °C. Nunca descongelar em temperatura ambiente.'),
  ('a0000000-0000-0000-0000-000000000007', 'Coxa e sobrecoxa de frango', 'c0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000006', 'kg', 'resfriado',
    72, 720, null, 72, '{}', 16.90, null),
  -- Suínos
  ('a0000000-0000-0000-0000-000000000008', 'Linguiça toscana', 'c0000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000001', 'kg', 'resfriado',
    72, 720, null, 72, '{}', 24.90, 'Verificar alergênicos no rótulo do fabricante.'),
  ('a0000000-0000-0000-0000-000000000009', 'Bacon (embalagem aberta)', 'c0000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000001', 'kg', 'resfriado',
    120, 720, null, 72, '{}', 39.90, 'Após aberto: 5 dias resfriado, respeitando a validade do fabricante.'),
  ('a0000000-0000-0000-0000-000000000010', 'Costelinha suína', 'c0000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000001', 'kg', 'resfriado',
    72, 720, null, 72, '{}', 29.90, null),
  -- Pescados e frutos do mar
  ('a0000000-0000-0000-0000-000000000011', 'Salmão (filé)', 'c0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000002', 'kg', 'resfriado',
    24, 720, null, 24, '{peixes}', 99.90, 'Pescado: manter ≤ 2 °C, sobre gelo. Para consumo cru, congelar previamente.'),
  ('a0000000-0000-0000-0000-000000000012', 'Camarão limpo', 'c0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000002', 'kg', 'resfriado',
    24, 720, null, 24, '{crustaceos}', 119.90, 'Manter ≤ 2 °C.'),
  ('a0000000-0000-0000-0000-000000000013', 'Polvo cozido', 'c0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000002', 'kg', 'resfriado',
    72, 720, null, 72, '{moluscos}', 149.90, null),
  ('a0000000-0000-0000-0000-000000000014', 'Lula limpa', 'c0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000002', 'kg', 'resfriado',
    24, 720, null, 24, '{moluscos}', 59.90, null),
  ('a0000000-0000-0000-0000-000000000015', 'Peixe branco (filé de pescada)', 'c0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000002', 'kg', 'resfriado',
    24, 720, null, 24, '{peixes}', 54.90, null),
  ('a0000000-0000-0000-0000-000000000016', 'Mexilhão limpo', 'c0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000002', 'kg', 'resfriado',
    24, 720, null, 24, '{moluscos}', 49.90, null),
  -- Laticínios e frios
  ('a0000000-0000-0000-0000-000000000017', 'Queijo muçarela (aberto)', 'c0000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000004', 'kg', 'resfriado',
    120, null, null, null, '{leite,lactose}', 44.90, 'Após aberto: 5 dias, respeitando a validade do fabricante.'),
  ('a0000000-0000-0000-0000-000000000018', 'Parmesão ralado', 'c0000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000004', 'kg', 'resfriado',
    120, null, null, null, '{leite,lactose}', 89.90, null),
  ('a0000000-0000-0000-0000-000000000019', 'Presunto fatiado', 'c0000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000004', 'kg', 'resfriado',
    72, null, null, null, '{}', 39.90, 'Frios fatiados: 3 dias resfriados.'),
  ('a0000000-0000-0000-0000-000000000020', 'Creme de leite fresco (aberto)', 'c0000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000004', 'l', 'resfriado',
    72, null, null, null, '{leite,lactose}', 24.00, null),
  ('a0000000-0000-0000-0000-000000000021', 'Leite integral (aberto)', 'c0000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000004', 'l', 'resfriado',
    72, null, null, null, '{leite,lactose}', 6.50, null),
  ('a0000000-0000-0000-0000-000000000022', 'Manteiga sem sal', 'c0000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000004', 'kg', 'resfriado',
    720, 2160, null, null, '{leite,lactose}', 59.90, 'Não manter em temperatura ambiente após aberta.'),
  ('a0000000-0000-0000-0000-000000000023', 'Iogurte natural (aberto)', 'c0000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000004', 'kg', 'resfriado',
    72, null, null, null, '{leite,lactose}', 18.00, null),
  ('a0000000-0000-0000-0000-000000000024', 'Requeijão cremoso (aberto)', 'c0000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000004', 'kg', 'resfriado',
    120, null, null, null, '{leite,lactose}', 32.00, null),
  -- Ovos
  ('a0000000-0000-0000-0000-000000000025', 'Ovos (in natura)', 'c0000000-0000-0000-0000-000000000007', 'f0000000-0000-0000-0000-000000000006', 'un', 'resfriado',
    504, null, 336, null, '{ovos}', 0.85, 'Não lavar antes de armazenar. Usar ovos com casca íntegra.'),
  ('a0000000-0000-0000-0000-000000000026', 'Ovo cozido', 'c0000000-0000-0000-0000-000000000007', null, 'un', 'resfriado',
    72, null, null, null, '{ovos}', 1.10, null),
  -- Hortifrúti
  ('a0000000-0000-0000-0000-000000000027', 'Alface higienizada', 'c0000000-0000-0000-0000-000000000006', 'f0000000-0000-0000-0000-000000000003', 'kg', 'resfriado',
    48, null, null, null, '{}', 12.00, 'Higienizar com solução clorada (100–200 ppm por 15 min) e enxaguar.'),
  ('a0000000-0000-0000-0000-000000000028', 'Tomate picado', 'c0000000-0000-0000-0000-000000000006', 'f0000000-0000-0000-0000-000000000003', 'kg', 'resfriado',
    48, null, null, null, '{}', 9.90, null),
  ('a0000000-0000-0000-0000-000000000029', 'Cebola picada', 'c0000000-0000-0000-0000-000000000006', 'f0000000-0000-0000-0000-000000000003', 'kg', 'resfriado',
    72, null, null, null, '{}', 6.90, null),
  ('a0000000-0000-0000-0000-000000000030', 'Ervas frescas higienizadas', 'c0000000-0000-0000-0000-000000000006', 'f0000000-0000-0000-0000-000000000003', 'kg', 'resfriado',
    72, null, null, null, '{}', 60.00, 'Salsa, cebolinha, coentro, manjericão.'),
  ('a0000000-0000-0000-0000-000000000031', 'Mix de folhas', 'c0000000-0000-0000-0000-000000000006', 'f0000000-0000-0000-0000-000000000003', 'kg', 'resfriado',
    48, null, null, null, '{}', 35.00, null),
  ('a0000000-0000-0000-0000-000000000032', 'Vinagrete', 'c0000000-0000-0000-0000-000000000014', null, 'kg', 'resfriado',
    48, null, null, null, '{}', 14.00, null),
  -- Pré-preparos / cozidos
  ('a0000000-0000-0000-0000-000000000033', 'Arroz cozido', 'c0000000-0000-0000-0000-000000000014', null, 'kg', 'resfriado',
    72, 720, null, 24, '{}', 4.50, 'Resfriar rapidamente após o cozimento.'),
  ('a0000000-0000-0000-0000-000000000034', 'Feijão cozido', 'c0000000-0000-0000-0000-000000000014', null, 'kg', 'resfriado',
    72, 720, null, 72, '{}', 6.00, null),
  ('a0000000-0000-0000-0000-000000000035', 'Farofa de manteiga', 'c0000000-0000-0000-0000-000000000014', null, 'kg', 'resfriado',
    120, null, null, null, '{leite,lactose}', 16.00, null),
  ('a0000000-0000-0000-0000-000000000036', 'Base de moqueca', 'c0000000-0000-0000-0000-000000000014', null, 'kg', 'resfriado',
    72, 720, null, 72, '{}', 22.00, 'Leite de coco, azeite de dendê, pimentões, tomate e coentro.'),
  -- Molhos e caldos
  ('a0000000-0000-0000-0000-000000000037', 'Molho de tomate da casa', 'c0000000-0000-0000-0000-000000000009', null, 'kg', 'resfriado',
    72, 720, null, 72, '{}', 12.00, null),
  ('a0000000-0000-0000-0000-000000000038', 'Caldo de peixe', 'c0000000-0000-0000-0000-000000000009', null, 'l', 'resfriado',
    72, 720, null, 72, '{peixes,aipo}', 8.00, null),
  ('a0000000-0000-0000-0000-000000000039', 'Fundo escuro', 'c0000000-0000-0000-0000-000000000009', null, 'l', 'resfriado',
    72, 720, null, 72, '{aipo}', 15.00, null),
  ('a0000000-0000-0000-0000-000000000040', 'Molho bechamel', 'c0000000-0000-0000-0000-000000000009', null, 'kg', 'resfriado',
    48, null, null, null, '{gluten,leite,lactose}', 18.00, null),
  ('a0000000-0000-0000-0000-000000000041', 'Maionese da casa', 'c0000000-0000-0000-0000-000000000009', null, 'kg', 'resfriado',
    24, null, null, null, '{ovos,mostarda}', 20.00, 'Preparar com ovos pasteurizados. Manter ≤ 5 °C.'),
  ('a0000000-0000-0000-0000-000000000042', 'Molho pesto', 'c0000000-0000-0000-0000-000000000009', null, 'kg', 'resfriado',
    72, 720, null, 72, '{leite,lactose,castanhas}', 65.00, null),
  -- Massas
  ('a0000000-0000-0000-0000-000000000043', 'Massa fresca', 'c0000000-0000-0000-0000-000000000010', null, 'kg', 'resfriado',
    72, 720, null, 24, '{gluten,ovos}', 28.00, null),
  ('a0000000-0000-0000-0000-000000000044', 'Nhoque de batata', 'c0000000-0000-0000-0000-000000000010', null, 'kg', 'resfriado',
    48, 720, null, 24, '{gluten,ovos}', 26.00, null),
  -- Pães
  ('a0000000-0000-0000-0000-000000000045', 'Pão de fermentação natural', 'c0000000-0000-0000-0000-000000000015', null, 'un', 'ambiente',
    null, 720, 48, null, '{gluten}', 18.00, 'Manter em local seco e arejado, protegido.'),
  ('a0000000-0000-0000-0000-000000000046', 'Pão de queijo (congelado)', 'c0000000-0000-0000-0000-000000000013', null, 'kg', 'congelado',
    null, 2160, null, null, '{leite,lactose,ovos}', 32.00, 'Assar direto do freezer.'),
  -- Secos e grãos
  ('a0000000-0000-0000-0000-000000000047', 'Farinha de trigo (aberta)', 'c0000000-0000-0000-0000-000000000008', 'f0000000-0000-0000-0000-000000000005', 'kg', 'ambiente',
    null, null, 2160, null, '{gluten}', 5.50, 'Após aberta, transferir para recipiente fechado e identificado.'),
  ('a0000000-0000-0000-0000-000000000048', 'Arroz cru (aberto)', 'c0000000-0000-0000-0000-000000000008', 'f0000000-0000-0000-0000-000000000005', 'kg', 'ambiente',
    null, null, 2160, null, '{}', 6.00, null),
  ('a0000000-0000-0000-0000-000000000049', 'Azeite extravirgem (aberto)', 'c0000000-0000-0000-0000-000000000008', 'f0000000-0000-0000-0000-000000000005', 'l', 'ambiente',
    null, null, 2160, null, '{}', 59.90, 'Proteger da luz e do calor.'),
  ('a0000000-0000-0000-0000-000000000050', 'Leite de coco (aberto)', 'c0000000-0000-0000-0000-000000000008', 'f0000000-0000-0000-0000-000000000005', 'l', 'resfriado',
    72, null, null, null, '{}', 18.00, 'Após aberto, transferir para recipiente e refrigerar.'),
  ('a0000000-0000-0000-0000-000000000051', 'Farinha de mandioca (aberta)', 'c0000000-0000-0000-0000-000000000008', 'f0000000-0000-0000-0000-000000000005', 'kg', 'ambiente',
    null, null, 2160, null, '{}', 8.00, null),
  -- Sobremesas e confeitaria
  ('a0000000-0000-0000-0000-000000000052', 'Chantilly', 'c0000000-0000-0000-0000-000000000011', null, 'kg', 'resfriado',
    72, null, null, null, '{leite,lactose}', 30.00, null),
  ('a0000000-0000-0000-0000-000000000053', 'Mousse de maracujá', 'c0000000-0000-0000-0000-000000000011', null, 'kg', 'resfriado',
    72, 720, null, 24, '{leite,lactose}', 35.00, null),
  ('a0000000-0000-0000-0000-000000000054', 'Sorvete artesanal', 'c0000000-0000-0000-0000-000000000011', null, 'l', 'congelado',
    null, 720, null, null, '{leite,lactose}', 45.00, 'Manter ≤ -18 °C. Não recongelar.'),
  ('a0000000-0000-0000-0000-000000000055', 'Calda de chocolate', 'c0000000-0000-0000-0000-000000000011', null, 'kg', 'resfriado',
    168, null, null, null, '{leite,lactose,soja}', 40.00, null),
  ('a0000000-0000-0000-0000-000000000056', 'Pudim de leite', 'c0000000-0000-0000-0000-000000000011', null, 'porcao', 'resfriado',
    72, null, null, null, '{leite,lactose,ovos}', 6.00, null),
  -- Bebidas
  ('a0000000-0000-0000-0000-000000000057', 'Suco de laranja natural', 'c0000000-0000-0000-0000-000000000012', 'f0000000-0000-0000-0000-000000000003', 'l', 'resfriado',
    24, 720, null, 24, '{}', 12.00, null),
  ('a0000000-0000-0000-0000-000000000058', 'Xarope de açúcar (bar)', 'c0000000-0000-0000-0000-000000000012', null, 'l', 'resfriado',
    720, null, null, null, '{}', 8.00, null),
  -- Congelados industrializados
  ('a0000000-0000-0000-0000-000000000059', 'Batata pré-frita congelada', 'c0000000-0000-0000-0000-000000000013', 'f0000000-0000-0000-0000-000000000005', 'kg', 'congelado',
    null, 2160, null, null, '{}', 19.90, 'Após aberta: fechar bem e respeitar a validade do fabricante.'),
  ('a0000000-0000-0000-0000-000000000060', 'Polpa de fruta congelada', 'c0000000-0000-0000-0000-000000000013', 'f0000000-0000-0000-0000-000000000003', 'kg', 'congelado',
    24, 2160, null, 24, '{}', 22.00, null)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Modelos de etiqueta (globais)
-- -----------------------------------------------------------------------------
insert into public.modelos_etiqueta (id, nome, largura_mm, altura_mm, campos, fonte_base_pt, mostrar_logo, padrao) values
  ('b0000000-0000-0000-0000-000000000001', 'Padrão 60×40', 60, 40,
    '{produto,tipo,metodo,data_manipulacao,validade,responsavel,codigo,qr}', 7, false, true),
  ('b0000000-0000-0000-0000-000000000002', 'Completa 60×60', 60, 60,
    '{produto,tipo,metodo,data_manipulacao,validade,responsavel,lote,fornecedor,sif,quantidade,alergenicos,codigo,qr}', 6.5, false, false),
  ('b0000000-0000-0000-0000-000000000003', 'Compacta 50×30', 50, 30,
    '{produto,metodo,validade,codigo,qr}', 6, false, false),
  ('b0000000-0000-0000-0000-000000000004', 'Recebimento 100×50', 100, 50,
    '{logo,unidade,produto,tipo,metodo,data_manipulacao,validade,validade_fabricante,responsavel,lote,fornecedor,sif,quantidade,alergenicos,observacoes,codigo,qr}', 8, true, false),
  ('b0000000-0000-0000-0000-000000000005', 'Mínima 40×40', 40, 40,
    '{produto,validade,qr}', 6, false, false)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Equipamentos por unidade (faixas de temperatura RDC 216 / CVS-5)
-- -----------------------------------------------------------------------------
insert into public.equipamentos (id, unidade_id, nome, tipo, temp_min_c, temp_max_c, localizacao) values
  -- Macaw Camboinhas
  ('e1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Geladeira cozinha',     'geladeira',      0,    5,   'Cozinha quente'),
  ('e1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Freezer 1',             'freezer',        null, -18, 'Estoque'),
  ('e1000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Câmara fria',           'camara_fria',    0,    4,   'Estoque'),
  ('e1000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Balcão térmico',        'balcao_termico', 60,   null, 'Passe'),
  ('e1000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'Geladeira bar',         'geladeira',      0,    7,   'Bar'),
  -- Macaw Búzios
  ('e2000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Geladeira cozinha',     'geladeira',      0,    5,   'Cozinha quente'),
  ('e2000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Freezer 1',             'freezer',        null, -18, 'Estoque'),
  ('e2000000-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'Câmara fria',           'camara_fria',    0,    4,   'Estoque'),
  ('e2000000-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222', 'Balcão térmico',        'balcao_termico', 60,   null, 'Passe'),
  ('e2000000-0000-0000-0000-000000000005', '22222222-2222-2222-2222-222222222222', 'Geladeira bar',         'geladeira',      0,    7,   'Bar')
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Checklists globais
-- -----------------------------------------------------------------------------
insert into public.checklists (id, unidade_id, nome, descricao, frequencia) values
  ('d0000000-0000-0000-0000-000000000001', null, 'Abertura da cozinha',
    'Rotina de abertura conforme Boas Práticas (RDC 216/2004).', 'abertura'),
  ('d0000000-0000-0000-0000-000000000002', null, 'Fechamento da cozinha',
    'Rotina de fechamento: higienização, armazenamento e descarte.', 'fechamento')
on conflict do nothing;

insert into public.checklist_itens (id, checklist_id, ordem, texto, obrigatorio) values
  -- Abertura
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 1, 'Colaboradores uniformizados, sem adornos, cabelos presos e protegidos', true),
  ('d1000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 2, 'Mãos higienizadas; pias com sabonete, papel toalha e álcool 70%', true),
  ('d1000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000001', 3, 'Temperaturas de geladeiras, freezers e câmaras registradas', true),
  ('d1000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000001', 4, 'Etiquetas vencidas retiradas e descartes registrados', true),
  ('d1000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000001', 5, 'Bancadas e utensílios higienizados antes do uso', true),
  ('d1000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000001', 6, 'Produtos em descongelamento sob refrigeração (nunca em temperatura ambiente)', true),
  ('d1000000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000001', 7, 'Lixeiras limpas, com tampa e acionamento por pedal', true),
  ('d1000000-0000-0000-0000-000000000008', 'd0000000-0000-0000-0000-000000000001', 8, 'EPIs disponíveis (luvas térmicas, luvas descartáveis, avental)', false),
  -- Fechamento
  ('d1000000-0000-0000-0000-000000000011', 'd0000000-0000-0000-0000-000000000002', 1, 'Alimentos armazenados cobertos e etiquetados', true),
  ('d1000000-0000-0000-0000-000000000012', 'd0000000-0000-0000-0000-000000000002', 2, 'Sobras de produção avaliadas, etiquetadas ou descartadas e registradas', true),
  ('d1000000-0000-0000-0000-000000000013', 'd0000000-0000-0000-0000-000000000002', 3, 'Temperaturas finais dos equipamentos registradas', true),
  ('d1000000-0000-0000-0000-000000000014', 'd0000000-0000-0000-0000-000000000002', 4, 'Bancadas, pisos, ralos e equipamentos higienizados', true),
  ('d1000000-0000-0000-0000-000000000015', 'd0000000-0000-0000-0000-000000000002', 5, 'Lixo retirado e lixeiras higienizadas', true),
  ('d1000000-0000-0000-0000-000000000016', 'd0000000-0000-0000-0000-000000000002', 6, 'Amostras do dia guardadas sob refrigeração por 72 h', true),
  ('d1000000-0000-0000-0000-000000000017', 'd0000000-0000-0000-0000-000000000002', 7, 'Panos e esponjas trocados ou higienizados', true),
  ('d1000000-0000-0000-0000-000000000018', 'd0000000-0000-0000-0000-000000000002', 8, 'Gás, fornos e equipamentos elétricos desligados', true)
on conflict do nothing;

-- >>>>>>>>>> FIM: seed.sql <<<<<<<<<<
