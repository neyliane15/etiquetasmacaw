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
