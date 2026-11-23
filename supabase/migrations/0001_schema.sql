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
