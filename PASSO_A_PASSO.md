# Etiquetas Macaw — Passo a passo de instalação

Siga na ordem. Cada etapa diz **onde clicar** e **o que conferir** antes de passar para a próxima.

---

## ETAPA 1 — Banco de dados no Supabase (≈ 5 min)

Você só precisa de **um arquivo**: `supabase/TUDO_EM_UM.sql`.
Ele junta, na ordem certa, `0001_schema` → `0002_rls_policies` → `0003_rpc_views` → `0004_correcoes_revisao` → `seed`.

1. Acesse <https://supabase.com/dashboard> e abra o seu projeto.
2. Menu lateral → **SQL Editor** → botão **+ New query**.
3. Abra `TUDO_EM_UM.sql`, copie **todo** o conteúdo (Ctrl+A, Ctrl+C) e cole no editor.
4. Clique em **Run** (ou Ctrl+Enter). Aguarde a mensagem **Success. No rows returned**.
   - Avisos (NOTICE) em amarelo são normais.
   - Pode rodar de novo sem problema: não duplica nada.
5. **Conferir:** cole e rode esta consulta numa nova query:
   ```sql
   select (select count(*) from unidades)         as unidades,      -- 2
          (select count(*) from categorias)       as categorias,    -- 15
          (select count(*) from produtos)         as produtos,      -- 60
          (select count(*) from modelos_etiqueta) as modelos,       -- 5
          (select count(*) from equipamentos)     as equipamentos,  -- 10
          (select count(*) from checklists)       as checklists;    -- 2
   ```
   Tem que aparecer **2 · 15 · 60 · 5 · 10 · 2**.

> Prefere rodar arquivo por arquivo? Rode, nessa ordem: `0001_schema.sql`, `0002_rls_policies.sql`,
> `0003_rpc_views.sql`, `0004_correcoes_revisao.sql`, `seed.sql`. O resultado é o mesmo.
>
> **Não rode** os arquivos da pasta `supabase/tests/`: são só para teste local.

---

## ETAPA 2 — Criar o administrador (≈ 2 min)

O **primeiro usuário** criado vira **admin** automaticamente.

1. Menu lateral → **Authentication** → **Users** → **Add user** → **Create new user**.
2. Preencha seu e-mail e uma senha, e marque **Auto Confirm User**. Clique em **Create user**.
3. Coloque seu nome no perfil (SQL Editor):
   ```sql
   update public.perfis set nome = 'Seu Nome' where email = 'seu@email.com';
   ```
4. **Conferir:**
   ```sql
   select nome, email, papel, ativo from public.perfis;
   ```
   Deve aparecer você com `papel = admin` e `ativo = true`.

---

## ETAPA 3 — Configurar o login (≈ 2 min)

1. **Authentication** → **Sign In / Providers**:
   - **Email** ligado.
   - **Allow new users to sign up** → **DESLIGADO** (ninguém se cadastra sozinho; quem cria usuários é o admin).
2. **Authentication** → **URL Configuration**:
   - **Site URL**: o endereço onde o app vai ficar (ex.: `https://etiquetas-macaw.vercel.app`).
     Enquanto testa no computador: `http://localhost:5173`.
   - **Redirect URLs** → **Add URL**: `https://SEU-ENDERECO/redefinir-senha`
     (e também `http://localhost:5173/redefinir-senha` para testes).

---

## ETAPA 4 — Função para o admin criar usuários (≈ 3 min)

Sem esta função o botão **Usuários → Novo usuário** do app não funciona.

**Pelo painel (sem instalar nada):**
1. Menu lateral → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Nome da função: **`admin-criar-usuario`** (exatamente assim).
3. Apague o código de exemplo, cole todo o conteúdo de `supabase/functions/admin-criar-usuario/index.ts` e clique em **Deploy function**.
4. Não precisa configurar chaves: o Supabase já fornece `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` à função.

**Pelo terminal (alternativa):**
```bash
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase functions deploy admin-criar-usuario
```

**Sem a função (plano B):** em **Authentication → Users → Invite user**, convide o e-mail.
O usuário aparece no app em **Usuários** como *Aguardando liberação*; você escolhe papel e unidade e salva.

---

## ETAPA 5 — Pegar as chaves do projeto (≈ 1 min)

**Project Settings** (engrenagem) → **API** (ou **Data API / API Keys**). Anote:
- **Project URL** → ex.: `https://abcd1234.supabase.co`
- **anon / public key** (chave longa que começa com `eyJ...` ou `sb_publishable_...`)

> **Nunca** use a chave `service_role` no app.

---

## ETAPA 6 — Rodar o app no computador (≈ 5 min)

Pré-requisito: **Node.js 18 ou mais novo** (<https://nodejs.org>, versão LTS).

1. Descompacte `etiquetasmacaw.zip` e abra a pasta `etiquetasmacaw` no terminal.
2. Copie o arquivo de exemplo de configuração:
   ```bash
   cp .env.example .env
   ```
   (No Windows: copie e renomeie `.env.example` para `.env`.)
3. Abra o `.env` e preencha:
   ```dotenv
   VITE_SUPABASE_URL=https://abcd1234.supabase.co
   VITE_SUPABASE_ANON_KEY=sua-chave-anon
   VITE_APP_URL=https://etiquetas-macaw.vercel.app
   ```
   `VITE_APP_URL` é o endereço público (Etapa 7). É ele que vai dentro do QR code; deixe vazio enquanto não tiver.
4. Instale e rode:
   ```bash
   npm install
   ```
   ```bash
   npm run dev
   ```
5. Abra <http://localhost:5173> e entre com o e-mail/senha do admin.

---

## ETAPA 7 — Colocar no ar (para o QR code funcionar no celular) (≈ 10 min)

O QR code abre a página da etiqueta no celular, então o app precisa ter um endereço público.

**Vercel (recomendado, gratuito):**
1. Entre em <https://vercel.com> com sua conta do GitHub.
2. **Add New → Project** → escolha o repositório **etiquetasmacaw** → **Import**.
3. Framework: **Vite** (detecta sozinho). Build: `npm run build`. Output: `dist`.
4. Em **Environment Variables**, adicione as 3 variáveis da Etapa 6 (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_URL` com o endereço da Vercel).
5. **Deploy**. O `vercel.json` do projeto já faz as rotas (`/q/CODIGO`, `/etiquetas`...) funcionarem.
6. Volte à **Etapa 3** e coloque esse endereço em **Site URL** e **Redirect URLs**.

> Netlify também funciona: o arquivo `public/_redirects` já está pronto.

---

## ETAPA 8 — Primeiro uso no app (≈ 15 min)

Faça como admin, nesta ordem:

1. **Unidades** → confira *Macaw Camboinhas* e *Macaw Búzios*; preencha endereço e **Responsável Técnico** (nome e registro). O nome da unidade sai na etiqueta; o RT fica registrado no sistema para fiscalização.
2. **Usuários** → **Novo usuário** → nome, e-mail, papel e unidade.
   - **Gerente**: cadastros e relatórios da unidade.
   - **Cozinheiro**: emite e dá baixa em etiquetas, registra recebimento, temperatura, descarte e checklist.
   - Com senha: a conta já fica pronta. Sem senha: a pessoa recebe um convite por e-mail.
3. **Fornecedores** → apague os 6 fictícios e cadastre os reais.
4. **Produtos** → revise as validades (resfriado / congelado / ambiente / descongelando) com o Responsável Técnico. As do cadastro inicial são aproximações da CVS-5 e da RDC 216.
5. **Modelos** → escolha o tamanho padrão da etiqueta da sua impressora (60×40, 60×60, 50×30, 100×50 ou 40×40 mm).
6. **Equipamentos** e **Checklists** → ajuste à realidade de cada cozinha.

---

## ETAPA 9 — Configurar a impressora térmica

1. Instale o driver da impressora (Elgin, Argox, Zebra, Bematech etc.) no computador ou tablet da cozinha.
2. Nas preferências do driver, crie um **tamanho de papel** igual ao da etiqueta (ex.: **60 × 40 mm**).
3. No app: **Etiquetas → Emitir** → escolha produto e método → **Imprimir**.
4. Na janela de impressão do navegador (use **Chrome** ou **Edge**):
   - Impressora: a térmica.
   - Tamanho do papel: o mesmo da etiqueta.
   - **Margens: Nenhuma**.
   - **Escala: 100%** (ou "Tamanho real").
   - **Gráficos de plano de fundo: ligado** (a faixa preta do método de conservação).
   - Cabeçalhos e rodapés: **desligado**.
5. Imprima uma etiqueta de teste e escaneie o QR com o celular: deve abrir a página da etiqueta.

---

## ETAPA 10 — Rotina na cozinha

| Situação | Onde no app |
|---|---|
| Abriu / manipulou / porcionou um produto | **Etiquetas → Emitir** |
| Tirou do freezer para descongelar | Abrir a etiqueta → **Derivar** → *Descongelando* (a original recebe baixa sozinha) |
| Usou o produto | **Baixa rápida** → digite ou escaneie o código → *Consumida* |
| Venceu ou estragou | **Baixa rápida** → *Descartada* (entra no relatório de desperdício em R$) |
| Chegou mercadoria | **Recebimento** → temperatura, NF, conformidade → **Etiquetar** |
| Medir geladeira/freezer | **Temperaturas** (fora da faixa fica marcado *não conforme*) |
| Abertura / fechamento | **Checklists** |
| Ver o que vence hoje e amanhã | **Painel** |
| Desperdício, PVPS, conformidade | **Relatórios** (gerente/admin) |

---

## Se der problema

| Sintoma | Solução |
|---|---|
| Login mostra "Supabase não configurado" | `.env` sem as variáveis (ou faltando na Vercel). Pare e rode `npm run dev` de novo. |
| Erro ao rodar o SQL | Rodou fora de ordem? Rode o `TUDO_EM_UM.sql` inteiro de novo. Se persistir, me mande a mensagem de erro. |
| "Novo usuário" dá erro | A função `admin-criar-usuario` não foi publicada (Etapa 4). |
| Usuário entra e não vê nada | Está *Aguardando liberação*: em **Usuários**, defina papel e unidade e marque ativo. |
| QR abre "localhost" ou não abre | Preencha `VITE_APP_URL` com o endereço público e publique de novo. |
| Etiqueta sai cortada ou pequena | Margens *Nenhuma*, escala *100%*, papel igual ao modelo (Etapa 9). |
| Etiqueta emitida com erro | Dê baixa como *Descartada* e emita de novo (por segurança, validade e status não podem ser editados). |
| Etiquetas vencidas não mudam de status sozinhas | Elas mudam ao abrir o painel. Para automatizar: SQL Editor → `select cron.schedule('macaw-vencidas', '*/15 * * * *', $$select public.marcar_etiquetas_vencidas()$$);` (ative antes a extensão **pg_cron** em Database → Extensions). |
