# Banco de dados — Etiquetas Macaw (Supabase)

Este diretório contém o schema, as políticas de segurança (RLS), as views/RPCs e os
dados iniciais do sistema de etiquetas das unidades **Macaw Camboinhas** e **Macaw Búzios**.

```
supabase/
├── migrations/
│   ├── 0001_schema.sql        # extensões, enums, tabelas, índices, funções e triggers
│   ├── 0002_rls_policies.sql  # RLS, grants e trigger perfis_protege_campos
│   └── 0003_rpc_views.sql     # views (vw_*) e RPCs usadas pelo app
├── seed.sql                   # unidades, categorias, produtos, modelos, equipamentos, checklists
└── tests/auth_stub.sql        # stub do schema auth — SOMENTE para Postgres local de teste
```

> **Ordem obrigatória:** `0001` → `0002` → `0003` → `seed.sql`.
> Não aplique `tests/auth_stub.sql` num projeto Supabase real (o Supabase já tem o schema `auth`).

---

## 1. Aplicar na base Supabase já criada

### Opção A — SQL Editor (mais simples)

1. Abra o projeto em <https://supabase.com/dashboard> → **SQL Editor** → **New query**.
2. Cole o conteúdo de `migrations/0001_schema.sql` e clique em **Run**.
3. Repita, **nessa ordem**, com `0002_rls_policies.sql`, `0003_rpc_views.sql` e `seed.sql`.
4. Confira em **Table Editor** que as tabelas `unidades`, `produtos`, `modelos_etiqueta` etc. foram criadas
   e populadas (2 unidades, 15 categorias, 60 produtos, 5 modelos, 10 equipamentos, 2 checklists).

`0002`, `0003` e `seed.sql` são idempotentes (podem ser executados de novo sem duplicar dados).
O `0001` cria tipos e tabelas: execute-o uma única vez numa base vazia.

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
- **Confirm email**:
  - **Desligado (recomendado)**: o admin cria usuários pela tela *Usuários* do app e eles
    entram imediatamente com a senha definida.
  - **Ligado**: o usuário criado recebe um e-mail de confirmação e só consegue entrar
    depois de confirmar. Alternativa: convidar pelo dashboard (*Authentication → Users → Invite*).
- Em **Authentication → URL Configuration**, defina **Site URL** com o endereço do app
  (ex.: `https://etiquetas.macaw.com.br` ou `http://localhost:5173`) e adicione
  `<site>/login` em **Redirect URLs** (usado pelo e-mail de redefinição de senha).
- Opcional: desative **Allow new users to sign up** em *Authentication → Sign In / Providers*
  **depois** de criar o primeiro admin, se quiser que apenas o admin crie contas.
  (Com o cadastro público desativado, a criação de usuários pelo app também é bloqueada;
  nesse caso crie/convide usuários pelo dashboard e ajuste papel/unidade na tela *Usuários*.)

---

## 3. Criar o primeiro usuário (admin)

O trigger `handle_new_user` cria automaticamente um registro em `perfis` para cada usuário do Auth.
**O primeiro usuário cadastrado vira `admin`**; os seguintes entram como `cozinheiro`
(o papel enviado no cadastro é ignorado por segurança — o admin ajusta depois).

1. Dashboard → **Authentication → Users → Add user → Create new user**.
2. Informe e-mail e senha e marque **Auto Confirm User**.
3. (Opcional) Ajuste o nome:
   ```sql
   update public.perfis set nome = 'Nome do Admin' where email = 'admin@exemplo.com';
   ```
4. Entre no app com esse e-mail/senha. O admin enxerga **todas as unidades**
   (`perfis.unidade_id` nulo) e cria os demais usuários em **Gestão → Usuários**.

Papéis:

| Papel | Pode |
|---|---|
| `admin` | tudo, em todas as unidades; usuários, unidades, cadastros globais e exclusões |
| `gerente` | cadastros (produtos/modelos/checklists da sua unidade, categorias, fornecedores, equipamentos), relatórios, correção de registros da sua unidade |
| `cozinheiro` | emitir/baixar etiquetas, registrar recebimentos, temperaturas, descartes e checklists da sua unidade |

Para promover alguém manualmente (SQL Editor roda sem JWT, então o trigger de proteção permite):

```sql
update public.perfis
   set papel = 'gerente',
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
         supabase/seed.sql; do
  psql -v ON_ERROR_STOP=1 -d macaw_test -f "$f" || break
done
```

Para simular um usuário logado: `set role authenticated; select set_config('request.jwt.claim.sub', '<uuid>', false);`.
