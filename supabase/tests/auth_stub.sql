-- =====================================================================
-- Stub mínimo do Supabase para testar as migrações em Postgres local
-- (docs/PLANO.md §13). NÃO aplicar em um projeto Supabase real.
-- Uso: psql -v ON_ERROR_STOP=1 -d <banco> -f supabase/tests/auth_stub.sql
-- Para simular um usuário logado: select set_config('request.jwt.claim.sub', '<uuid>', false);
-- =====================================================================

-- Papéis do Supabase
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

-- auth.uid(): lê o "sub" do JWT simulado
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

-- auth.role(): papel do JWT simulado (opcional)
create or replace function auth.role()
returns text
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.role', true), '')::text
$$;

grant execute on function auth.uid()  to anon, authenticated, service_role;
grant execute on function auth.role() to anon, authenticated, service_role;
