# Banco de dados — Etiquetas Macaw (Supabase)

Este diretório contém o schema, as políticas de segurança (RLS), as views/RPCs e os
dados iniciais do sistema de etiquetas das unidades **Macaw Camboinhas** e **Macaw Búzios**.

```
supabase/
├── migrations/
│   ├── 0001_schema.sql        # extensões, enums, tabelas, índices, funções e triggers
│   ├── 0002_rls_policies.sql  # RLS, grants e trigger perfis_protege_campos
│   ├── 0003_rpc_views.sql     # views (vw_*) e RPCs usadas pelo app
│   └── 0004_correcoes_revisao.sql # correções de segurança/integridade da revisão (docs/REVISAO.md)
├── functions/admin-criar-usuario/ # Edge Function: admin cria/convida usuários (service role no servidor)
├── seed.sql                   # unidades, categorias, produtos, modelos, equipamentos, checklists
└── tests/
    ├── auth_stub.sql          # stub do schema auth — SOMENTE para Postgres local de teste
    └── smoke.sql              # smoke tests (T01–T22), transação com ROLLBACK
```

> **Ordem obrigatória:** `0001` → `0002` → `0003` → `0004` → `seed.sql`.
> **Já aplicou 0001–0003?** Basta executar `0004_correcoes_revisao.sql` (e, se quiser, o seed de novo).
> Sempre que reaplicar migrações antigas, reaplique também as seguintes, na ordem (o `0004`
> redefine funções e políticas criadas em `0001`–`0003`).
> Não aplique `tests/auth_stub.sql` num projeto Supabase real (o Supabase já tem o schema `auth`).

---

## 1. Aplicar na base Supabase já criada

### Opção A — SQL Editor (mais simples)

1. Abra o projeto em <https://supabase.com/dashboard> → **SQL Editor** → **New query**.
2. Cole o conteúdo de `migrations/0001_schema.sql` e clique em **Run**.
3. Repita, **nessa ordem**, com `0002_rls_policies.sql`, `0003_rpc_views.sql`,
   `0004_correcoes_revisao.sql` e `seed.sql`.
4. Confira em **Table Editor** que as tabelas `unidades`, `produtos`, `modelos_etiqueta` etc. foram criadas
   e populadas (2 unidades, 15 categorias, 60 produtos, 5 modelos, 10 equipamentos, 2 checklists).

Todos os arquivos (`0001`–`0004` e `seed.sql`) são idempotentes: foram aplicados duas vezes
seguidas sem erro e sem duplicar dados (o `0001` usa `if not exists`/`create or replace`).

### Opção B — Supabase CLI

```bash
npm i -g supabase           # ou: brew install supabase/tap/supabase
supabase login
supabase link --project-ref <ref-do-projeto>   # o ref está na URL do dashboard
supabase db push                               # aplica supabase/migrations/* em ordem
psql "$(supabase db url)" -f supabase/seed.sql # ou cole o seed no SQL Editor
```

Para desenvolvimento local com Docker: `supabase start` e depois `supabase db reset`
(aplica as migrações e roda `supabase/seed.sql` automaticamente).

---

## 2. Configurar a autenticação

Em **Authentication → Providers → Email**:

- Mantenha **Email** habilitado (login por e-mail e senha).
- **Desative “Allow new users to sign up”** (*Authentication → Sign In / Providers*) logo depois
  de criar o primeiro admin. O app **não** usa mais `signUp` com a chave anon: usuários são criados
  pela Edge Function `admin-criar-usuario` (service role) ou convidados pelo dashboard — ambos
  funcionam com o cadastro público desligado.
  Mesmo que o cadastro público fique ligado, desde o `0004` quem se cadastrar sozinho nasce
  **inativo, sem unidade** e não lê nada (nem catálogo/unidades) até um admin liberar.
- **Confirm email** pode ficar ligado (convites e a Edge Function já confirmam o e-mail).
- Em **Authentication → URL Configuration**, defina **Site URL** com o endereço do app
  (ex.: `https://etiquetas.macaw.com.br` ou `http://localhost:5173`) e adicione
  `<site>/redefinir-senha` em **Redirect URLs** (links de “Esqueci minha senha” e de convite
  abrem a tela de definir nova senha).

---

## 3. Criar o primeiro usuário (admin)

O trigger `handle_new_user` cria automaticamente um registro em `perfis` para cada usuário do Auth.
**O primeiro usuário cadastrado vira `admin` ativo**; os seguintes entram como `cozinheiro`
**inativo e sem unidade** — papel e `unidade_id` enviados no metadata do cadastro são ignorados
(qualquer pessoa com a chave anon poderia forjá-los). Só um admin libera o acesso.

1. Dashboard → **Authentication → Users → Add user → Create new user**.
2. Informe e-mail e senha e marque **Auto Confirm User**.
3. (Opcional) Ajuste o nome:
   ```sql
   update public.perfis set nome = 'Nome do Admin' where email = 'admin@exemplo.com';
   ```
4. Entre no app com esse e-mail/senha. O admin enxerga **todas as unidades**
   (`perfis.unidade_id` nulo) e cria os demais usuários em **Gestão → Usuários**.

### 3.1 Criar os demais usuários

**Opção A — pelo app (recomendado):** publique a Edge Function uma vez:

```bash
supabase functions deploy admin-criar-usuario
# opcional: supabase secrets set ALLOWED_ORIGIN=https://etiquetas.macaw.com.br
```

Em **Gestão → Usuários → Novo usuário** o admin informa nome, e-mail, papel e unidade.
Com senha inicial (≥ 8 caracteres) a conta é criada já confirmada; sem senha, o usuário
recebe um **convite** por e-mail e define a senha em `/redefinir-senha`. A função verifica
que quem chama é admin ativo e usa a service role apenas no servidor.

**Opção B — sem Edge Function:** *Authentication → Users → Invite user* (ou *Add user*).
O usuário aparece em **Gestão → Usuários** como “Aguardando liberação”; o admin escolhe
papel e unidade e salva (RPC `admin_definir_perfil`, que só admins executam).

Papéis:

| Papel | Pode |
|---|---|
| `admin` | tudo, em todas as unidades; usuários, unidades, cadastros globais e exclusões |
| `gerente` | cadastros (produtos/modelos/checklists da sua unidade, categorias, fornecedores, equipamentos), relatórios, correção de registros da sua unidade |
| `cozinheiro` | emitir/baixar etiquetas, registrar recebimentos, temperaturas, descartes e checklists da sua unidade |

Para liberar/promover alguém manualmente (SQL Editor roda sem JWT, então o trigger de proteção permite):

```sql
update public.perfis
   set papel = 'gerente', ativo = true,
       unidade_id = '11111111-1111-1111-1111-111111111111'  -- Macaw Camboinhas
 where email = 'chef@exemplo.com';
-- Macaw Búzios: 22222222-2222-2222-2222-222222222222
```

---

## 4. Variáveis de ambiente do front-end

Copie `.env.example` para `.env` na raiz e preencha com os valores de
**Project Settings → API**:

```dotenv
VITE_SUPABASE_URL=https://<ref-do-projeto>.supabase.co
VITE_SUPABASE_ANON_KEY=<chave anon / publishable>
```

- Use **somente a chave `anon`** no front-end. **Nunca** coloque a `service_role` no app ou no repositório.
- Sem essas variáveis o app abre, mas a tela de login mostra um aviso (`supabaseConfigurado = false`).

---

## 5. Segurança (resumo)

- RLS habilitado em **todas** as tabelas; o papel `anon` não tem acesso a nenhuma tabela/view.
- A única função pública é `consultar_etiqueta_publica(codigo)` (página do QR `/q/:codigo`),
  que retorna apenas dados não sensíveis (sem ids, custos, fornecedor ou observações).
- Usuários não-admin só veem/alteram dados da própria unidade (`tem_acesso_unidade`).
- `perfis_protege_campos`: o usuário comum só altera o próprio `nome`; papel, unidade, e-mail
  e situação só mudam por admin, e o último admin ativo não pode ser rebaixado/desativado.
- Views usam `security_invoker = true` (respeitam o RLS de quem consulta).
- (0004) Escrita direta pelo cliente em `etiquetas`: só `observacoes`/`modelo_id` podem ser
  alterados; status, validade, método e snapshots mudam apenas pelas RPCs
  (`dar_baixa_etiqueta`, `emitir_etiqueta_derivada`, `registrar_(re)impressao`,
  `marcar_etiquetas_vencidas`), que são `security definer` e checam a unidade.
  Na emissão, responsável/criador = usuário logado, status `ativa`, cozinheiro não excede a
  validade padrão do produto (gerente/admin até 365 dias), manipulação não pode estar no
  futuro nem (cozinheiro) a mais de 7 dias.
- (0004) `etiqueta_movimentacoes` é imutável para o cliente (só triggers/RPCs gravam).
- (0004) `descartes`: custo sempre calculado pelo produto (gerente/admin pode informar),
  peso derivado da quantidade, limites para cozinheiro e etiqueta da mesma unidade.
- (0004) `registros_temperatura`: conformidade recalculada em qualquer alteração.
- (0004) Nenhuma função é executável por `anon`, exceto `consultar_etiqueta_publica`.

## 6. Etiquetas vencidas

`marcar_etiquetas_vencidas()` muda para `vencida` as etiquetas ativas com validade expirada.
O app chama a função ao abrir o painel e a lista de etiquetas. Opcionalmente, agende no
Supabase (*Database → Cron*, extensão `pg_cron`):

```sql
select cron.schedule('macaw-vencidas', '*/15 * * * *', $$select public.marcar_etiquetas_vencidas()$$);
```

## 7. Validades do seed

As validades dos produtos em `seed.sql` são **referências aproximadas** (Portaria CVS-5/2013,
RDC 216/2004 e práticas usuais) e **devem ser revisadas pelo Responsável Técnico** de cada unidade.
Ajuste-as em **Cadastros → Produtos**. Também cadastre o RT (nome e registro) em **Gestão → Unidades**.

## 8. Testar localmente (sem Supabase)

Com Postgres 15+ instalado:

```bash
createdb macaw_test
for f in supabase/tests/auth_stub.sql supabase/migrations/0001_schema.sql \
         supabase/migrations/0002_rls_policies.sql supabase/migrations/0003_rpc_views.sql \
         supabase/migrations/0004_correcoes_revisao.sql supabase/seed.sql; do
  psql -v ON_ERROR_STOP=1 -d macaw_test -f "$f" || break
done
psql -v ON_ERROR_STOP=1 -d macaw_test -f supabase/tests/smoke.sql   # base sem usuários
```

Para simular um usuário logado: `set role authenticated; select set_config('request.jwt.claim.sub', '<uuid>', false);`.
