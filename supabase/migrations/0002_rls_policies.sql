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
