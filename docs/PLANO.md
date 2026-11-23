# Etiquetas Macaw — Plano Técnico e Contrato entre Agentes

> Sistema de etiquetagem e segurança de alimentos para os restaurantes **Macaw Camboinhas** e **Macaw Búzios** (mesmo grupo, duas unidades).
> Este documento é o **único contrato** entre os agentes (Backend A, Backend B, Frontend A, Frontend B e Testador). Nomes de tabelas, colunas, enums, funções, arquivos, rotas e assinaturas aqui definidos são **definitivos**. Se algo não estiver aqui, siga a convenção mais próxima descrita e **não** renomeie nada já definido.

---

## 1. Análise da Suflex (referência de mercado)

> Observação: os sites `suflex.com.br` e `materiais.suflex.com.br` não estavam acessíveis a partir do ambiente (rede bloqueada). A análise abaixo combina a página pública da empresa (LinkedIn) com conhecimento do produto e do mercado de etiquetagem para food service (Suflex, Cookmaster, etc.).

### 1.1 O que a Suflex oferece
A Suflex (SP, fundada em 2019 pelo chef Raphael Despirite) substitui etiquetas escritas à mão e planilhas por um sistema em nuvem onde **cada etiqueta vira um ponto de controle** (registro rastreável, sem limite de usuários). Principais recursos:

| Recurso | Descrição |
|---|---|
| Etiquetas de validade/manipulação | Impressão em impressora térmica com produto, data de manipulação, validade calculada automaticamente e responsável. |
| Produtos abertos | Etiqueta para embalagem original aberta (nova validade após abertura, conforme fabricante/RT). |
| Porcionados / pré-preparos / produção | Etiqueta de produção (mise en place, porcionamento), com controle de produção do dia e exportação. |
| Descongelamento | Etiqueta “descongelando” com início do descongelamento sob refrigeração e prazo de uso. |
| Amostras | Etiqueta de amostra de alimento preparado (guarda de 72 h sob refrigeração — exigência para coletividades/CVS-5). |
| Recebimento | Conferência de mercadoria: fornecedor, NF, temperatura, integridade, SIF, lote, validade do fabricante. |
| Rastreabilidade / QR Code | Cada etiqueta tem um código; o QR leva à ficha da etiqueta; contagem de estoque por leitura de QR sem duplicação. |
| PVPS / PEPS | “Primeiro que vence, primeiro que sai” — listas ordenadas por vencimento. |
| Alertas de vencimento | Painel de itens vencendo hoje / nas próximas horas e vencidos. |
| Desperdício | Registro de descartes (motivo, peso, custo) e relatórios. |
| Checklists | Rotinas de abertura/fechamento, higienização, BPF. |
| Temperatura | Registro de temperatura de geladeiras, freezers, câmaras, balcões. |
| Fichas técnicas | Receitas/rendimento (fora do escopo da 1ª versão — ver §1.3). |
| Multi-loja | Várias unidades sob um mesmo grupo, com visão consolidada. |
| Usuários e Responsável Técnico | Papéis (admin, gerente, cozinheiro); RT da unidade impresso/registrado. |
| Conformidade | ANVISA **RDC 216/2004** (BPF para serviços de alimentação) e **Portaria CVS-5/2013** (SP — referência de validades e temperaturas). |

### 1.2 Etiquetas: dimensões e campos usuais
Impressoras térmicas (Zebra, Elgin L42, Argox, Brother QL) usam rolos de:

| Modelo | Uso típico |
|---|---|
| **60 × 40 mm** | Padrão de mercado: produto, método, manipulação, validade, responsável, QR. |
| **60 × 60 mm** | Completa: + lote, fornecedor, SIF, alergênicos, quantidade. |
| **50 × 30 mm** | Compacta: produto, validade, código/QR pequeno. |
| **100 × 50 mm** | Recebimento / caixas / cubas grandes, todos os campos. |
| **40 × 40 mm** | Mínima: QR + produto + validade (potes pequenos). |

Campos impressos: nome do produto, **tipo** de etiqueta, **método de conservação** (RESFRIADO / CONGELADO / AMBIENTE / DESCONGELANDO) com faixa de temperatura, **data/hora de manipulação**, **validade** (data/hora, destacada), **responsável**, **lote**, **fornecedor**, **SIF/SIE**, **peso/quantidade**, **alergênicos** (RDC 26/2015), observações, **código curto + QR Code**, unidade (loja), logo.

### 1.3 O que vamos incluir
**Núcleo (v1):** emissão de etiquetas (manipulação, produto aberto, porcionado/produção, descongelamento, amostra, recebimento) com validade automática por método; reimpressão; baixa (consumida/descartada); vencimento automático; QR com página pública `/q/:codigo`; produtos/categorias/fornecedores; modelos de etiqueta com campos configuráveis; recebimento com itens e conformidade; equipamentos e registros de temperatura com conformidade automática; descartes e relatório de desperdício (kg e R$); checklists; multi-unidade; usuários com papéis; dashboard com PVPS e alertas.

**Extras que agregam ao Macaw:**
1. **Etiqueta derivada** (`etiqueta_origem_id`): ao descongelar ou porcionar a partir de uma etiqueta existente, herda lote/fornecedor/SIF — rastreabilidade em cadeia.
2. **Custo do desperdício**: `produtos.custo_unitario` → descarte gera `custo_estimado` (R$).
3. **Cópias em lote**: emitir N etiquetas idênticas, cada uma com código único.
4. **Busca por código** (digitado ou lido por leitor de QR/código como teclado) para baixa rápida.
5. **Snapshot** dos dados do produto na etiqueta (nome, alergênicos, responsável) — histórico não muda se o cadastro mudar.
6. **Situação de validade** padronizada (`vencida`, `vence_hoje`, `vence_24h`, `vence_72h`, `ok`) com cores.
7. Primeiro usuário cadastrado vira **admin** automaticamente (bootstrap).
8. Responsável Técnico por unidade (nome + registro), exibível na etiqueta 100×50.

**Fase 2 (não implementar agora):** fichas técnicas, contagem de inventário por QR, integração com impressora via ZPL/driver direto, PWA offline, pg_cron.

---

## 2. Stack (FIXA)

- **Vite 5 + React 18 + TypeScript 5** (strict).
- **react-router-dom v6** (`createBrowserRouter` ou `<BrowserRouter>` + `<Routes>` — Frontend A escolhe `<BrowserRouter>`).
- **@supabase/supabase-js v2**.
- **qrcode** (npm `qrcode`, + `@types/qrcode`) — gerar Data URL/SVG do QR.
- **date-fns v3** (+ `date-fns/locale/pt-BR`).
- **CSS puro** com variáveis (sem Tailwind, sem CSS-in-JS, sem libs de UI). Arquivos `.css` importados.
- Testes: **vitest** + **@testing-library/react** + **jsdom**.
- Impressão: `window.print()` com **CSS `@page { size: <largura>mm <altura>mm; margin: 0 }`** injetado dinamicamente com o tamanho exato do modelo. Todas as dimensões da etiqueta em **mm**.
- Variáveis de ambiente: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (em `.env.example`).
- Fuso: datas armazenadas como `timestamptz`; exibidas em `America/Sao_Paulo` (horário do navegador) via date-fns com locale `ptBR`.

### 2.1 package.json (Frontend A cria; versões mínimas)
```json
{
  "name": "etiquetas-macaw",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "tsc -b --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "date-fns": "^3.6.0",
    "qrcode": "^1.5.4",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.8",
    "@testing-library/react": "^16.0.0",
    "@types/qrcode": "^1.5.5",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "jsdom": "^24.1.1",
    "typescript": "^5.5.4",
    "vite": "^5.4.0",
    "vitest": "^2.0.5"
  }
}
```
`vite.config.ts` deve conter `test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test/setup.ts'] }` (usar `/// <reference types="vitest" />`). `src/test/setup.ts` (Frontend A) importa `@testing-library/jest-dom/vitest`. Alias `@` → `src` (em `vite.config.ts` e `tsconfig` `paths`). **Todos os imports internos usam `@/...`.**

---

## 3. Identidade visual (logo oficial)

Logo oficial recebida: **silhueta de arara em voo, cor única verde-oliva `#79731B` sobre fundo creme/rosado `#F3E7DB`**. Arquivo-fonte: **`src/assets/logo-macaw.jpg`** (1080×1080, já no repositório — não alterar).

- **Frontend A** gera **`src/assets/logo.svg`**: vetorização da silhueta (um `<path>` único, `fill="currentColor"`, `viewBox` quadrado, sem fundo), para herdar a cor do contexto (oliva na UI, **preto** na etiqueta). Se a vetorização fiel não for viável, o SVG embute o JPG (`<image href>`) como fallback — mas a preferência é o path. Importação: `import logoUrl from '@/assets/logo.svg'` (como `<img>`) ou componente `src/components/layout/Logo.tsx` que injeta o SVG inline (`?raw`) para usar `currentColor`. Ver §5 (Logo.tsx é do Frontend A).
- **Favicon**: `public/favicon.svg` (mesma silhueta, oliva `#79731B` sobre círculo `#F3E7DB`) + `<link rel="icon" type="image/svg+xml" href="/favicon.svg">` e `<meta name="theme-color" content="#79731B">` no `index.html` (Frontend A).
- **Etiquetas impressas são monocromáticas** (impressora térmica): logo e todos os elementos em **preto puro** sobre branco; nenhuma cor da paleta é usada no `@media print`.

Estética: **elegante e minimalista** — muito respiro relativo, fontes pequenas, bordas finas, poucos acentos de cor; a cor oliva é a única cor de marca.

### 3.1 Tokens (`src/styles/tokens.css`, em `:root`)
```css
:root {
  /* Marca — oliva (cor única da logo) */
  --olive: #79731B;           /* primária */
  --olive-700: #5C5714;       /* escura: hover, sidebar ativa, títulos */
  --olive-900: #3F3B0D;
  --olive-200: #E6E2B8;       /* clara: fundos de destaque, seleção */
  --olive-100: #F0EDD3;

  /* Fundos e superfícies */
  --cream: #F3E7DB;           /* fundo da logo — fundo do app */
  --bg: #F3E7DB;
  --surface: #FBF6F0;         /* cards, tabelas, modais */
  --surface-2: #F7EFE6;       /* cabeçalho de tabela, hover de linha */
  --sand: #E3D5C3;            /* bordas areia */

  /* Texto */
  --text: #2E2A1F;            /* escuro quente */
  --text-muted: #7A7262;
  --text-inverse: #FBF6F0;

  /* Bordas */
  --border: #E3D5C3;          /* areia, 1px */
  --border-strong: #CDBBA4;
  --border-accent: #79731B;   /* filete oliva */

  /* Semânticos discretos */
  --danger: #A9502F;          /* terracota — vencido, erro */
  --danger-bg: #F5E1D7;
  --warning: #B8862B;         /* âmbar/mostarda — a vencer */
  --warning-bg: #F6EACB;
  --success: #79731B;         /* oliva — ok/conforme */
  --success-bg: #ECE9C8;
  --info: #5E6B6E;            /* cinza-ardósia — informativo */
  --info-bg: #E6E6E0;
  --neutral: #7A7262;
  --neutral-bg: #EEE5DA;

  --color-primary: var(--olive);
  --color-danger: var(--danger);
  --color-warning: var(--warning);
  --color-success: var(--success);
  --color-info: var(--info);

  /* Métodos de conservação (somente tela; impressão = preto) */
  --metodo-resfriado: #5E7C86;     /* azul-acinzentado frio */
  --metodo-congelado: #3E5560;     /* ardósia escura */
  --metodo-ambiente: #9A7B4F;      /* areia escura */
  --metodo-descongelando: #8A6A7E; /* malva discreto */

  /* Detalhe de borda: filete oliva + linha creme dupla */
  --rule-detail: 2px solid var(--olive);  /* filete superior */
  --rule-double: 3px double var(--sand);  /* linha dupla creme/areia */

  /* Tipografia */
  --font-sans: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --font-display: 'Cormorant Garamond', Georgia, 'Times New Roman', serif; /* opcional: títulos de página e marca */
  --font-mono: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;
  --fs-xs: 11px; --fs-sm: 12px; --fs-base: 13px; --fs-md: 14px; --fs-lg: 16px; --fs-xl: 20px; --fs-2xl: 24px;
  --lh: 1.45;
  --tracking-caps: .08em;     /* rótulos em caixa alta */

  /* Espaçamento compacto */
  --sp-1: 2px; --sp-2: 4px; --sp-3: 8px; --sp-4: 12px; --sp-5: 16px; --sp-6: 24px; --sp-7: 32px;

  /* Bordas e sombras (mínimas) */
  --radius-sm: 2px; --radius: 4px; --radius-lg: 8px;
  --border-w: 1px;
  --shadow-sm: 0 1px 2px rgba(46, 42, 31, .05);
  --shadow: 0 2px 10px rgba(46, 42, 31, .07);

  /* Layout */
  --sidebar-w: 216px;
  --header-h: 48px;
}
```
Regras visuais:
- `body { font: var(--fs-base)/var(--lh) var(--font-sans); background: var(--bg); color: var(--text); }`.
- **Cards / modais / header**: fundo `--surface`, borda 1px `--border`, **filete oliva de 2px no topo** (`border-top: var(--rule-detail)`) e, abaixo do título do card, **linha dupla creme** (`border-bottom: var(--rule-double)`). Classe utilitária `.rule-top` (filete) e `.rule-double` (linha dupla).
- Títulos de página em `--olive-700`, peso 600 (ou `--font-display` se carregada); rótulos de formulário e cabeçalhos de tabela em caixa alta `--fs-xs` com `letter-spacing: var(--tracking-caps)` e cor `--text-muted`.
- **Sidebar**: fundo `--surface` com borda direita 1px `--border`; logo oliva no topo; item ativo com texto `--olive-700`, fundo `--olive-100` e filete esquerdo 2px `--olive`. (Sem blocos de cor sólida.)
- **Botões** (30px de altura): `primary` = fundo `--olive`, texto `--text-inverse`, hover `--olive-700`; `secondary` = fundo transparente, borda `--border-strong`, texto `--text`; `danger` = terracota; `warning` = mostarda; `success` = oliva; `ghost` = sem borda.
- Inputs 30px, borda `--border-strong`, foco com `outline: 2px solid var(--olive-200)` e borda `--olive`.
- Badges: pílula pequena, texto na cor semântica sobre fundo `*-bg`, sem borda grossa.
- Fontes via Google Fonts no `index.html`: Inter (400/500/600) e, opcional, Cormorant Garamond (500/600). Fallback system.

Classes utilitárias globais (Frontend A, `src/styles/global.css`): `.stack` (flex column gap `--sp-3`), `.row` (flex row gap `--sp-3` align center), `.grid-2`, `.grid-3`, `.muted`, `.mono`, `.caps`, `.rule-top`, `.rule-double`, `.sr-only`, `.text-danger`, `.text-success`, `.text-warning`.

---

## 4. Banco de dados (Supabase / Postgres 15) — CONTRATO

Convenções: `snake_case`, PK `id uuid default gen_random_uuid()` (exceto onde indicado), `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()` com trigger. Schema `public`. Textos em português sem acento nos identificadores.

### 4.1 Extensões
```sql
create extension if not exists pgcrypto;   -- gen_random_uuid, gen_random_bytes
create extension if not exists citext;     -- e-mails
create extension if not exists pg_trgm;    -- busca por nome
```

### 4.2 Enums
```sql
create type papel_usuario      as enum ('admin','gerente','cozinheiro');
create type metodo_conservacao as enum ('resfriado','congelado','ambiente','descongelando');
create type tipo_etiqueta      as enum ('manipulacao','produto_aberto','porcionado','producao','descongelamento','amostra','recebimento');
create type status_etiqueta    as enum ('ativa','consumida','descartada','vencida');
create type tipo_movimentacao  as enum ('emissao','reimpressao','consumo','descarte','vencimento','alteracao','reativacao');
create type motivo_descarte    as enum ('vencido','contaminado','qualidade','sobra_producao','sobra_cliente','queda_acidente','temperatura_inadequada','devolucao','outro');
create type unidade_medida     as enum ('kg','g','l','ml','un','porcao','cx','pct');
create type tipo_equipamento   as enum ('geladeira','freezer','camara_fria','camara_congelada','balcao_refrigerado','balcao_termico','ultracongelador','pass_through','outro');
create type status_recebimento as enum ('conforme','parcial','recusado');
create type frequencia_checklist as enum ('diario','abertura','fechamento','semanal','mensal','eventual');
```

### 4.3 Tabelas

#### `unidades`
| coluna | tipo | regras |
|---|---|---|
| id | uuid PK | default gen_random_uuid() |
| nome | text | not null, unique (ex.: “Macaw Camboinhas”) |
| slug | text | not null, unique (`camboinhas`, `buzios`) |
| endereco | text | null |
| cidade | text | null |
| uf | char(2) | null |
| cnpj | text | null |
| telefone | text | null |
| responsavel_tecnico | text | null (nome do RT) |
| registro_rt | text | null (CRN/CRMV etc.) |
| ativo | boolean | not null default true |
| created_at, updated_at | timestamptz | |

#### `perfis` (1:1 com `auth.users`)
| coluna | tipo | regras |
|---|---|---|
| id | uuid PK | FK → `auth.users(id)` on delete cascade |
| nome | text | not null |
| email | citext | not null unique |
| papel | papel_usuario | not null default 'cozinheiro' |
| unidade_id | uuid | FK → unidades(id) on delete set null; **null = acesso a todas** (somente admin) |
| ativo | boolean | not null default true |
| created_at, updated_at | timestamptz | |

#### `categorias` (globais ao grupo)
| coluna | tipo | regras |
|---|---|---|
| id | uuid PK | |
| nome | text | not null unique |
| cor | text | not null default '#79731B' (hex; seed usa tons terrosos discretos: oliva, terracota, mostarda, ardósia, areia, malva) |
| ordem | int | not null default 0 |
| temp_recebimento_max_c | numeric(5,1) | null (temperatura máxima aceita no recebimento) |
| ativo | boolean | not null default true |
| created_at, updated_at | | |

#### `fornecedores` (globais)
| coluna | tipo | regras |
|---|---|---|
| id | uuid PK | |
| nome | text | not null |
| razao_social | text | null |
| cnpj | text | null unique |
| contato | text | null |
| telefone | text | null |
| email | text | null |
| observacoes | text | null |
| ativo | boolean | not null default true |
| created_at, updated_at | | |

#### `produtos` (globais; `unidade_id` null = todas as unidades)
| coluna | tipo | regras |
|---|---|---|
| id | uuid PK | |
| nome | text | not null |
| categoria_id | uuid | FK → categorias on delete set null |
| fornecedor_padrao_id | uuid | FK → fornecedores on delete set null |
| unidade_id | uuid | FK → unidades on delete cascade; null = global |
| unidade_medida | unidade_medida | not null default 'kg' |
| metodo_padrao | metodo_conservacao | not null default 'resfriado' |
| validade_resfriado_horas | int | null, check > 0 |
| validade_congelado_horas | int | null, check > 0 |
| validade_ambiente_horas | int | null, check > 0 |
| validade_descongelando_horas | int | null, check > 0 |
| alergenicos | text[] | not null default '{}' (valores de `ALERGENICOS` §6) |
| sif | text | null |
| codigo_barras | text | null |
| custo_unitario | numeric(12,2) | null (R$ por `unidade_medida`) |
| observacoes | text | null (instruções de conservação) |
| ativo | boolean | not null default true |
| created_at, updated_at | | |

Validade **sempre em horas** no banco (`72` = 3 dias; `720` = 30 dias). A UI exibe/edita em “dias + horas”. Null = método não permitido para o produto.

#### `modelos_etiqueta`
| coluna | tipo | regras |
|---|---|---|
| id | uuid PK | |
| nome | text | not null (ex.: “Padrão 60×40”) |
| largura_mm | numeric(6,2) | not null check (largura_mm between 20 and 150) |
| altura_mm | numeric(6,2) | not null check (altura_mm between 15 and 200) |
| campos | text[] | not null default '{produto,metodo,data_manipulacao,validade,responsavel,qr}' — valores de `CampoEtiqueta` §6, **na ordem de exibição** |
| fonte_base_pt | numeric(4,1) | not null default 7 |
| mostrar_logo | boolean | not null default false |
| unidade_id | uuid | FK → unidades on delete cascade; null = global |
| padrao | boolean | not null default false |
| ativo | boolean | not null default true |
| created_at, updated_at | | |
Índice único parcial: `unique (coalesce(unidade_id,'00000000-0000-0000-0000-000000000000'::uuid)) where padrao` → um padrão por escopo.

#### `etiquetas`
| coluna | tipo | regras |
|---|---|---|
| id | uuid PK | |
| codigo | text | not null unique; default `gerar_codigo_etiqueta()`; 8 caracteres `[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]` |
| unidade_id | uuid | not null FK → unidades on delete restrict |
| produto_id | uuid | null FK → produtos on delete set null |
| produto_nome | text | not null (snapshot; preenchido pelo trigger se null) |
| categoria_nome | text | null (snapshot) |
| tipo | tipo_etiqueta | not null default 'manipulacao' |
| metodo | metodo_conservacao | not null |
| data_manipulacao | timestamptz | not null default now() |
| validade_horas | int | null (se null, trigger usa a do produto para o método) |
| data_validade | timestamptz | not null (calculada pelo trigger se null) |
| data_validade_fabricante | date | null (produto aberto/recebimento: validade original) |
| lote | text | null |
| fornecedor_id | uuid | null FK → fornecedores on delete set null |
| fornecedor_nome | text | null (snapshot) |
| sif | text | null |
| quantidade | numeric(12,3) | null check (quantidade >= 0) |
| unidade_medida | unidade_medida | null |
| alergenicos | text[] | not null default '{}' (snapshot do produto se vazio) |
| observacoes | text | null |
| responsavel_id | uuid | null FK → perfis on delete set null (default `auth.uid()`) |
| responsavel_nome | text | null (snapshot) |
| modelo_id | uuid | null FK → modelos_etiqueta on delete set null |
| etiqueta_origem_id | uuid | null FK → etiquetas(id) on delete set null |
| recebimento_item_id | uuid | null FK → recebimento_itens on delete set null |
| status | status_etiqueta | not null default 'ativa' |
| status_em | timestamptz | null (quando mudou de ativa) |
| status_por | uuid | null FK → perfis on delete set null |
| impressoes | int | not null default 0 |
| created_by | uuid | null FK → perfis default auth.uid() |
| created_at, updated_at | | |
Check: `data_validade > data_manipulacao`.

#### `etiqueta_movimentacoes`
| coluna | tipo | regras |
|---|---|---|
| id | bigint | PK generated always as identity |
| etiqueta_id | uuid | not null FK → etiquetas on delete cascade |
| tipo | tipo_movimentacao | not null |
| status_anterior | status_etiqueta | null |
| status_novo | status_etiqueta | null |
| detalhes | jsonb | not null default '{}' |
| usuario_id | uuid | null FK → perfis on delete set null (default auth.uid()) |
| created_at | timestamptz | not null default now() |

#### `descartes`
| coluna | tipo | regras |
|---|---|---|
| id | uuid PK | |
| unidade_id | uuid | not null FK → unidades |
| etiqueta_id | uuid | null FK → etiquetas on delete set null |
| produto_id | uuid | null FK → produtos on delete set null |
| produto_nome | text | not null (snapshot, trigger preenche via produto/etiqueta) |
| motivo | motivo_descarte | not null |
| quantidade | numeric(12,3) | not null check (> 0) |
| unidade_medida | unidade_medida | not null |
| peso_kg | numeric(12,3) | null (trigger: kg→q; g→q/1000; l→q; ml→q/1000; demais null salvo informado) |
| custo_estimado | numeric(12,2) | null (trigger: quantidade × produtos.custo_unitario quando unidade_medida igual à do produto) |
| observacao | text | null |
| responsavel_id | uuid | null FK → perfis default auth.uid() |
| descartado_em | timestamptz | not null default now() |
| created_at | timestamptz | not null default now() |

#### `recebimentos`
| coluna | tipo | regras |
|---|---|---|
| id | uuid PK | |
| unidade_id | uuid | not null FK → unidades |
| fornecedor_id | uuid | null FK → fornecedores on delete set null |
| nota_fiscal | text | null |
| recebido_em | timestamptz | not null default now() |
| temperatura_veiculo_c | numeric(5,1) | null |
| veiculo_limpo | boolean | null |
| entregador_uniformizado | boolean | null |
| status | status_recebimento | not null default 'conforme' |
| observacoes | text | null |
| responsavel_id | uuid | null FK → perfis default auth.uid() |
| created_at, updated_at | | |

#### `recebimento_itens`
| coluna | tipo | regras |
|---|---|---|
| id | uuid PK | |
| recebimento_id | uuid | not null FK → recebimentos on delete cascade |
| produto_id | uuid | null FK → produtos on delete set null |
| produto_nome | text | not null |
| quantidade | numeric(12,3) | not null check (> 0) |
| unidade_medida | unidade_medida | not null |
| lote | text | null |
| data_fabricacao | date | null |
| data_validade | date | null |
| temperatura_c | numeric(5,1) | null |
| sif | text | null |
| embalagem_integra | boolean | not null default true |
| conforme | boolean | not null default true |
| motivo_nao_conformidade | text | null |
| created_at | timestamptz | not null default now() |

#### `equipamentos`
| coluna | tipo | regras |
|---|---|---|
| id | uuid PK | |
| unidade_id | uuid | not null FK → unidades on delete cascade |
| nome | text | not null (ex.: “Freezer 1 — Cozinha quente”) |
| tipo | tipo_equipamento | not null |
| temp_min_c | numeric(5,1) | null |
| temp_max_c | numeric(5,1) | null |
| localizacao | text | null |
| ativo | boolean | not null default true |
| created_at, updated_at | | |

#### `registros_temperatura`
| coluna | tipo | regras |
|---|---|---|
| id | uuid PK | |
| equipamento_id | uuid | not null FK → equipamentos on delete cascade |
| unidade_id | uuid | not null FK → unidades (trigger copia do equipamento) |
| temperatura_c | numeric(5,1) | not null |
| conforme | boolean | not null (trigger: entre temp_min_c e temp_max_c, limites null ignorados) |
| acao_corretiva | text | null (obrigatória na UI quando não conforme) |
| responsavel_id | uuid | null FK → perfis default auth.uid() |
| registrado_em | timestamptz | not null default now() |
| created_at | timestamptz | not null default now() |

#### `checklists`
| coluna | tipo | regras |
|---|---|---|
| id | uuid PK | |
| unidade_id | uuid | null FK → unidades on delete cascade (null = todas) |
| nome | text | not null |
| descricao | text | null |
| frequencia | frequencia_checklist | not null default 'diario' |
| ativo | boolean | not null default true |
| created_at, updated_at | | |

#### `checklist_itens`
| id uuid PK · checklist_id uuid not null FK → checklists on delete cascade · ordem int not null default 0 · texto text not null · obrigatorio boolean not null default true · created_at |

#### `checklist_execucoes`
| id uuid PK · checklist_id uuid not null FK → checklists on delete cascade · unidade_id uuid not null FK → unidades · responsavel_id uuid FK → perfis default auth.uid() · executado_em timestamptz not null default now() · observacoes text null · total_itens int not null default 0 · itens_conformes int not null default 0 · created_at |

#### `checklist_respostas`
| id uuid PK · execucao_id uuid not null FK → checklist_execucoes on delete cascade · item_id uuid null FK → checklist_itens on delete set null · item_texto text not null (snapshot) · conforme boolean not null · observacao text null · unique (execucao_id, item_id) |

**Ordem de criação em 0001** (por causa das FKs): unidades → perfis → categorias → fornecedores → produtos → modelos_etiqueta → recebimentos → recebimento_itens → etiquetas → etiqueta_movimentacoes → descartes → equipamentos → registros_temperatura → checklists → checklist_itens → checklist_execucoes → checklist_respostas. Índice do modelo padrão: `create unique index modelos_etiqueta_um_padrao on modelos_etiqueta ((coalesce(unidade_id, '00000000-0000-0000-0000-000000000000'::uuid))) where padrao;`. Como `gerar_codigo_etiqueta()` consulta `etiquetas`, crie a função **antes** da tabela usando `language plpgsql` (corpo validado só na execução) ou defina o default via `alter table ... alter column codigo set default gerar_codigo_etiqueta()` após criar a tabela.

### 4.4 Índices
```sql
create index on perfis (unidade_id);
create index on produtos (categoria_id);
create index on produtos (unidade_id);
create index produtos_nome_trgm on produtos using gin (nome gin_trgm_ops);
create index on etiquetas (unidade_id, status, data_validade);
create index on etiquetas (produto_id);
create index on etiquetas (created_at desc);
create index on etiquetas (etiqueta_origem_id);
create index on etiqueta_movimentacoes (etiqueta_id, created_at);
create index on descartes (unidade_id, descartado_em);
create index on recebimentos (unidade_id, recebido_em desc);
create index on recebimento_itens (recebimento_id);
create index on equipamentos (unidade_id);
create index on registros_temperatura (equipamento_id, registrado_em desc);
create index on registros_temperatura (unidade_id, registrado_em desc);
create index on checklist_itens (checklist_id, ordem);
create index on checklist_execucoes (unidade_id, executado_em desc);
```

### 4.5 Funções e triggers (Backend A — `0001_schema.sql`)
Todas em `public`, `language plpgsql` (ou `sql`), com `set search_path = public`.

| Função | Assinatura | Comportamento |
|---|---|---|
| `set_updated_at()` | `returns trigger` | `new.updated_at := now()`. Trigger `trg_<tabela>_updated_at before update` em todas as tabelas com `updated_at`. |
| `gerar_codigo_etiqueta()` | `returns text`, volatile | 8 chars do alfabeto `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` (31 símbolos, sem 0/O/1/I) usando `gen_random_bytes`; repete até não existir em `etiquetas.codigo`. |
| `validade_padrao_horas(p_produto_id uuid, p_metodo metodo_conservacao)` | `returns int`, stable | Retorna a coluna `validade_<metodo>_horas` do produto (null se não houver). |
| `calcular_validade(p_produto_id uuid, p_metodo metodo_conservacao, p_data timestamptz default now(), p_horas int default null)` | `returns timestamptz`, stable | `p_data + make_interval(hours => coalesce(p_horas, validade_padrao_horas(...)))`; se horas null → `raise exception 'Produto sem validade definida para o método %'`. |
| `etiquetas_before_write()` | trigger **before insert or update** em `etiquetas` | Em INSERT: `codigo` default se null; snapshot `produto_nome`, `categoria_nome`, `alergenicos` (se vazio), `unidade_medida` (se null) a partir do produto; `fornecedor_nome` a partir de `fornecedor_id`; `responsavel_id := coalesce(new.responsavel_id, auth.uid())` e `responsavel_nome` de `perfis`; `validade_horas := coalesce(new.validade_horas, validade_padrao_horas(...))`; `data_validade := coalesce(new.data_validade, data_manipulacao + validade_horas h)`; se `data_validade` ainda null → exceção. Em UPDATE: se `metodo`, `data_manipulacao` ou `validade_horas` mudaram e `data_validade` não foi alterada explicitamente, recalcula; se `status` mudou de `ativa`, define `status_em := now()` e `status_por := coalesce(new.status_por, auth.uid())`. |
| `etiquetas_after_write()` | trigger **after insert or update** | INSERT → movimentação `emissao` (detalhes: `{tipo, metodo, data_validade}`). UPDATE com mudança de status → movimentação conforme status novo (`consumida`→`consumo`, `descartada`→`descarte`, `vencida`→`vencimento`, `ativa`→`reativacao`). UPDATE de outros campos (exceto `impressoes`, `updated_at`) → `alteracao`. |
| `descartes_before_insert()` | trigger before insert em `descartes` | Preenche `produto_id`/`produto_nome`/`unidade_id` a partir da etiqueta quando informada; calcula `peso_kg` e `custo_estimado` (regras §4.3). |
| `registros_temperatura_before_insert()` | trigger before insert | Copia `unidade_id` do equipamento; calcula `conforme`. |
| `checklist_execucoes_totais()` | trigger after insert/update/delete em `checklist_respostas` | Atualiza `total_itens` e `itens_conformes` da execução. |
| `handle_new_user()` | trigger **after insert on auth.users**, `security definer` | Insere em `perfis` (`id`, `email`, `nome := coalesce(raw_user_meta_data->>'nome', split_part(email,'@',1))`, `unidade_id := (raw_user_meta_data->>'unidade_id')::uuid` se válido). `papel := 'admin'` **se ainda não existe nenhum admin**, senão `'cozinheiro'` (papel do metadata é ignorado por segurança; admin ajusta depois). |
| `meu_papel()` | `returns papel_usuario`, stable, security definer | Papel do `auth.uid()` (perfil ativo) ou null. |
| `minha_unidade()` | `returns uuid`, stable, security definer | `unidade_id` do perfil. |
| `is_admin()` | `returns boolean`, stable, security definer | `meu_papel() = 'admin'`. |
| `is_gestor()` | `returns boolean`, stable, security definer | `meu_papel() in ('admin','gerente')`. |
| `tem_acesso_unidade(p_unidade uuid)` | `returns boolean`, stable, security definer | `true` se admin, ou se perfil ativo e (`perfis.unidade_id is null and papel='admin'` ou `perfis.unidade_id = p_unidade`). |

As funções `meu_papel`, `minha_unidade`, `is_admin`, `is_gestor`, `tem_acesso_unidade` ficam em **0001** (Backend A) porque 0002 depende delas.

### 4.6 RLS (Backend B — `0002_rls_policies.sql`)
`alter table ... enable row level security` em **todas** as tabelas de §4.3. Nenhuma permissão para `anon` em tabelas. Políticas (`to authenticated`):

| Tabela | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| unidades | todos autenticados | is_admin() | is_admin() | is_admin() |
| perfis | `id = auth.uid()` or is_admin() or (is_gestor() and unidade_id = minha_unidade()) | — (só trigger) | is_admin(); ou `id = auth.uid()` (o usuário pode alterar só `nome` — garantir com trigger/`with check` que papel/unidade/ativo não mudam; Backend B cria trigger `perfis_protege_campos` em 0002) | is_admin() |
| categorias, fornecedores | autenticados | is_gestor() | is_gestor() | is_admin() |
| produtos, modelos_etiqueta, checklists | `unidade_id is null or tem_acesso_unidade(unidade_id)` | is_gestor() and (unidade_id is null → is_admin(); senão tem_acesso_unidade) | idem insert | is_admin() |
| checklist_itens | via checklist acessível (exists) | is_gestor() | is_gestor() | is_gestor() |
| etiquetas | tem_acesso_unidade(unidade_id) | tem_acesso_unidade(unidade_id) | tem_acesso_unidade(unidade_id) | is_admin() |
| etiqueta_movimentacoes | via etiqueta acessível | tem acesso à etiqueta | — | — |
| descartes, recebimentos, registros_temperatura, checklist_execucoes | tem_acesso_unidade(unidade_id) | tem_acesso_unidade(unidade_id) | is_gestor() and tem_acesso_unidade | is_admin() |
| recebimento_itens, checklist_respostas | via pai acessível | via pai acessível | via pai e is_gestor() | via pai e is_gestor() |
| equipamentos | tem_acesso_unidade | is_gestor() and tem_acesso_unidade | idem | is_admin() |

Grants: `grant usage on schema public to anon, authenticated;` `grant select, insert, update, delete on all tables in schema public to authenticated;` `grant usage, select on all sequences ... to authenticated;` `revoke all on all tables in schema public from anon;` `grant execute on function consultar_etiqueta_publica(text) to anon, authenticated;`

### 4.7 Views e RPCs (Backend B — `0003_rpc_views.sql`)
Todas as views com `with (security_invoker = true)` para respeitar RLS.

**`vw_etiquetas`** — `etiquetas.*` + `unidade_nome`, `modelo_nome`, `horas_restantes numeric` (= `extract(epoch from data_validade - now())/3600`, arredondado 1 casa), `situacao text`:
```
case
  when status <> 'ativa' then status::text
  when data_validade <= now() then 'vencida'
  when data_validade::date = (now() at time zone 'America/Sao_Paulo')::date  -- comparar ambos em SP
       then 'vence_hoje'
  when data_validade <= now() + interval '24 hours' then 'vence_24h'
  when data_validade <= now() + interval '72 hours' then 'vence_72h'
  else 'ok'
end
```
(Comparação de “hoje” deve usar `(data_validade at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date`.)

**`vw_etiquetas_a_vencer`** — `select * from vw_etiquetas where status = 'ativa' and data_validade <= now() + interval '72 hours' order by data_validade` (inclui vencidas ainda ativas — PVPS).

**`vw_desperdicio_diario`** — `unidade_id, unidade_nome, dia date (SP), motivo, produto_id, produto_nome, categoria_nome, total_quantidade, total_peso_kg, total_custo, registros int` agrupado de `descartes`.

**`vw_temperaturas_ultimas`** — último registro por equipamento ativo: `equipamento_id, equipamento_nome, tipo, unidade_id, temp_min_c, temp_max_c, temperatura_c, conforme, registrado_em, horas_desde_registro`.

RPCs (`language plpgsql`, `set search_path = public`):

| RPC | Assinatura | Segurança | Retorno |
|---|---|---|---|
| `consultar_etiqueta_publica` | `(p_codigo text)` | **security definer**, stable; normaliza `upper(trim())` | `table(codigo text, produto_nome text, tipo tipo_etiqueta, metodo metodo_conservacao, data_manipulacao timestamptz, data_validade timestamptz, status status_etiqueta, situacao text, unidade_nome text, lote text, alergenicos text[], responsavel_primeiro_nome text)` — 0 ou 1 linha. Não expõe ids, custos, fornecedor ou observações. |
| `dar_baixa_etiqueta` | `(p_etiqueta_id uuid, p_status status_etiqueta, p_motivo motivo_descarte default null, p_quantidade numeric default null, p_observacao text default null)` | security invoker | `etiquetas` (linha atualizada). `p_status` ∈ (`consumida`,`descartada`); exige status atual `ativa` ou `vencida`. Se `descartada`: insere em `descartes` (motivo default `'vencido'` se vencida senão `'outro'`; quantidade default = etiqueta.quantidade, unidade = etiqueta.unidade_medida; se ambos null usa 1 `un`). |
| `registrar_reimpressao` | `(p_etiqueta_id uuid)` | invoker | `int` (novo `impressoes`); incrementa e insere movimentação `reimpressao`. |
| `registrar_impressao` | `(p_etiqueta_ids uuid[])` | invoker | `void`; incrementa `impressoes` (primeira impressão, sem movimentação). |
| `marcar_etiquetas_vencidas` | `(p_unidade_id uuid default null)` | **security definer** (restrito a unidades em que `tem_acesso_unidade`) | `int` — atualiza `status='vencida'` onde `ativa` e `data_validade <= now()`. Chamada pelo front ao carregar dashboard/lista. |
| `dashboard_resumo` | `(p_unidade_id uuid)` | invoker | `json`: `{ ativas, vencidas, vence_hoje, vence_24h, vence_72h, emitidas_hoje, descartes_7d_kg, descartes_7d_custo, temperaturas_nao_conformes_24h, equipamentos_sem_registro_12h, recebimentos_hoje }` (inteiros/numéricos). |
| `relatorio_desperdicio` | `(p_unidade_id uuid, p_inicio date, p_fim date)` (`p_unidade_id` null = todas as acessíveis) | invoker | `table(agrupador text, chave text, total_peso_kg numeric, total_custo numeric, registros int)` — `union all` de agrupamentos `'motivo'`, `'produto'`, `'categoria'`, `'dia'`. |
| `relatorio_etiquetas` | `(p_unidade_id uuid, p_inicio date, p_fim date)` | invoker | `table(produto_nome text, emitidas int, consumidas int, descartadas int, vencidas int, ativas int)` |
| `emitir_etiqueta_derivada` | `(p_origem_id uuid, p_tipo tipo_etiqueta, p_metodo metodo_conservacao, p_quantidade numeric default null, p_validade_horas int default null)` | invoker | `etiquetas` nova linha herdando produto, lote, fornecedor, sif, alergênicos, unidade; `etiqueta_origem_id = p_origem_id`. Se a origem era `congelado` e o novo método é `descongelando`, a origem é marcada `consumida`. |

`grant execute` de todas (exceto a pública, já liberada) para `authenticated`.

### 4.8 Seed (Backend B — `supabase/seed.sql`, idempotente com `on conflict do nothing`)
- **Unidades**: `Macaw Camboinhas` (slug `camboinhas`, Niterói/RJ) e `Macaw Búzios` (slug `buzios`, Armação dos Búzios/RJ). UUIDs fixos: `11111111-1111-1111-1111-111111111111` (Camboinhas) e `22222222-2222-2222-2222-222222222222` (Búzios).
- **Categorias** (com cor em tons terrosos discretos harmonizados com o oliva `#79731B` e temp. máx. recebimento): Carnes bovinas (7 °C), Aves (4 °C), Suínos (7 °C), Pescados e frutos do mar (3 °C), Laticínios e frios (7 °C), Hortifrúti (10 °C), Ovos, Secos e grãos, Molhos e caldos, Massas, Sobremesas e confeitaria, Bebidas, Congelados industrializados (-12 °C), Pré-preparos / mise en place, Pães.
- **Produtos** (≥ 40, validades em horas — referência CVS-5/práticas usuais, **a validar pelo RT**): ex.: Filé mignon porcionado (resfr. 72, cong. 720, descong. 72), Picanha, Carne moída (resfr. 24, cong. 720, descong. 24), Frango peito (72/720/72), Coxa/sobrecoxa, Linguiça, Bacon aberto (resfr. 120), Salmão (24/720/24), Camarão limpo (24/720/24), Polvo cozido (72/720), Lula, Peixe branco, Queijo muçarela aberto (120), Parmesão ralado (120), Presunto fatiado (72), Creme de leite aberto (72), Leite aberto (72), Manteiga (ambiente aberto não; resfr. 720), Iogurte, Ovos (ambiente 336 / resfr. 504), Ovo cozido (72), Alface higienizada (48), Tomate picado (48), Cebola picada (72), Ervas frescas (72), Mix de folhas (48), Arroz cozido (resfr. 72, cong. 720), Feijão cozido (72/720), Molho de tomate (72/720), Caldo de peixe (72/720), Fundo escuro (72/720), Molho bechamel (48), Maionese de casa (24), Massa fresca (72/720), Pão de fermentação natural (amb. 48, cong. 720), Farinha de trigo aberta (amb. 2160), Arroz cru aberto (amb. 2160), Azeite aberto (amb. 2160), Leite de coco aberto (72), Chantilly (72), Mousse (72/720), Sorvete artesanal (cong. 720), Calda de chocolate (resfr. 168). Alergênicos preenchidos (glúten, leite, ovos, crustáceos, peixes, soja, etc.).
- **Modelos de etiqueta** (globais): `Padrão 60×40` (padrao=true; produto, tipo, metodo, data_manipulacao, validade, responsavel, codigo, qr), `Completa 60×60` (+ lote, fornecedor, sif, quantidade, alergenicos), `Compacta 50×30` (produto, metodo, validade, codigo, qr), `Recebimento 100×50` (todos + unidade, logo), `Mínima 40×40` (produto, validade, qr).
- **Equipamentos** por unidade: Geladeira cozinha (0 a 5 °C), Freezer (≤ -18: min null, max -18), Câmara fria (0 a 4), Balcão térmico (min 60, max null), Geladeira bar (0 a 7).
- **Checklist** global “Abertura da cozinha” e “Fechamento” com 6–10 itens (higienização de bancadas, temperaturas registradas, etiquetas vencidas retiradas, lixeiras, EPIs, etc.).
- Não criar usuários no seed (auth). README explica bootstrap.

### 4.9 Referência de temperaturas (RDC 216 / CVS-5) — usar em textos/labels
- Resfriado: **0 a 5 °C** (pescados ≤ 2-3 °C). Congelado: **≤ -18 °C** (recebimento tolerado até -12 °C). Quente: **≥ 60 °C**. Descongelamento: **sob refrigeração ≤ 5 °C**, nunca em temperatura ambiente. Amostras: guardar 72 h sob refrigeração.
Constante TS `FAIXA_METODO` (§6).

---

## 5. Divisão de arquivos por agente (SEM sobreposição)

> Cada agente cria **somente** os arquivos listados para ele. Se precisar de algo de outro agente, importe pelo caminho/assinatura deste contrato, mesmo que o arquivo ainda não exista.

### Backend A
- `supabase/migrations/0001_schema.sql` — extensões, enums, tabelas, constraints, índices, todas as funções/triggers de §4.5 (incluindo helpers de autorização e `handle_new_user`).

### Backend B
- `supabase/migrations/0002_rls_policies.sql` — RLS, grants, trigger `perfis_protege_campos`.
- `supabase/migrations/0003_rpc_views.sql` — views e RPCs de §4.7.
- `supabase/seed.sql` — §4.8.
- `supabase/README.md` — como aplicar (Supabase CLI `supabase db reset` ou SQL Editor na ordem 0001→0003→seed), bootstrap do admin, configuração de Auth (desabilitar “Confirm email” para criação de usuários pelo admin, ou habilitar e usar convite), variáveis.
- `src/types/database.ts` — tipos de domínio §6 (exatamente).
- `src/lib/supabase.ts` — cliente.
- `src/lib/api/*.ts` — §7.
- `src/lib/validade.ts` e `src/lib/format.ts` — funções puras §8.

### Frontend A
- Raiz: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `index.html`, `.env.example`, `.gitignore`, `README.md` (raiz, curto: como rodar).
- `src/main.tsx`, `src/App.tsx` (rotas §9), `src/vite-env.d.ts`, `src/test/setup.ts`.
- `src/styles/tokens.css`, `src/styles/global.css`, `src/styles/print.css`, `src/styles/layout.css`, `src/styles/ui.css`.
- `src/assets/logo.svg` (vetorização da silhueta de `src/assets/logo-macaw.jpg`, `fill="currentColor"`), `public/favicon.svg`, `src/components/layout/Logo.tsx` (`export function Logo(p: { size?: number; className?: string; title?: string }): JSX.Element` — SVG inline com `currentColor`; usado no layout, login, página pública e etiqueta).
- **Não alterar** `src/assets/logo-macaw.jpg` (arquivo oficial).
- `src/contexts/AuthContext.tsx`, `src/contexts/UnidadeContext.tsx` (§10).
- `src/components/layout/AppLayout.tsx`, `Sidebar.tsx`, `Header.tsx`, `UnidadeSelector.tsx`, `RequireAuth.tsx`, `RequireRole.tsx`.
- `src/components/ui/*` (§11) + `src/components/ui/index.ts` (barrel).
- `src/pages/LoginPage.tsx`, `src/pages/DashboardPage.tsx`, `src/pages/NotFoundPage.tsx`.

### Frontend B
- `src/components/label/LabelPreview.tsx`, `LabelPrintSheet.tsx`, `QrCode.tsx`, `label.css`, `printLabels.ts`, `labelFields.ts` (§12).
- `src/pages/etiquetas/EtiquetasPage.tsx` (lista/filtros/baixa/reimpressão), `EmitirEtiquetaPage.tsx`, `EtiquetaDetalhePage.tsx`, `BaixaRapidaPage.tsx` (por código/leitor).
- `src/pages/produtos/ProdutosPage.tsx` (+ `ProdutoForm.tsx`).
- `src/pages/categorias/CategoriasPage.tsx`.
- `src/pages/fornecedores/FornecedoresPage.tsx`.
- `src/pages/modelos/ModelosPage.tsx` (editor com preview ao vivo).
- `src/pages/recebimentos/RecebimentosPage.tsx`, `NovoRecebimentoPage.tsx`, `RecebimentoDetalhePage.tsx`.
- `src/pages/temperaturas/TemperaturasPage.tsx` (registro + histórico), `EquipamentosPage.tsx`.
- `src/pages/descartes/DescartesPage.tsx`.
- `src/pages/checklists/ChecklistsPage.tsx`, `ExecutarChecklistPage.tsx`.
- `src/pages/relatorios/RelatoriosPage.tsx` (desperdício, etiquetas, temperaturas; exportar CSV via Blob).
- `src/pages/usuarios/UsuariosPage.tsx`, `src/pages/unidades/UnidadesPage.tsx`.
- `src/pages/publico/ConsultaQrPage.tsx` (`/q/:codigo`, sem layout, sem login).
- CSS de páginas: `src/pages/<pasta>/<pasta>.css` quando necessário.

Todas as páginas: **`export default function NomeDaPagina()`**.

### Testador
- `src/lib/__tests__/validade.test.ts`, `src/lib/__tests__/format.test.ts`, `src/components/label/__tests__/LabelPreview.test.tsx`, `src/components/label/__tests__/labelFields.test.ts`, e scripts de verificação em `scripts/` se necessário.

---

## 6. Tipos de domínio — `src/types/database.ts` (Backend B; conteúdo exato mínimo)

```ts
export type UUID = string;
export type ISODateTime = string; // timestamptz ISO
export type ISODate = string;     // 'yyyy-MM-dd'

export type PapelUsuario = 'admin' | 'gerente' | 'cozinheiro';
export type MetodoConservacao = 'resfriado' | 'congelado' | 'ambiente' | 'descongelando';
export type TipoEtiqueta = 'manipulacao' | 'produto_aberto' | 'porcionado' | 'producao' | 'descongelamento' | 'amostra' | 'recebimento';
export type StatusEtiqueta = 'ativa' | 'consumida' | 'descartada' | 'vencida';
export type TipoMovimentacao = 'emissao' | 'reimpressao' | 'consumo' | 'descarte' | 'vencimento' | 'alteracao' | 'reativacao';
export type MotivoDescarte = 'vencido' | 'contaminado' | 'qualidade' | 'sobra_producao' | 'sobra_cliente' | 'queda_acidente' | 'temperatura_inadequada' | 'devolucao' | 'outro';
export type UnidadeMedida = 'kg' | 'g' | 'l' | 'ml' | 'un' | 'porcao' | 'cx' | 'pct';
export type TipoEquipamento = 'geladeira' | 'freezer' | 'camara_fria' | 'camara_congelada' | 'balcao_refrigerado' | 'balcao_termico' | 'ultracongelador' | 'pass_through' | 'outro';
export type StatusRecebimento = 'conforme' | 'parcial' | 'recusado';
export type FrequenciaChecklist = 'diario' | 'abertura' | 'fechamento' | 'semanal' | 'mensal' | 'eventual';
export type SituacaoValidade = 'vencida' | 'vence_hoje' | 'vence_24h' | 'vence_72h' | 'ok';
export type SituacaoEtiqueta = SituacaoValidade | 'consumida' | 'descartada';

export type CampoEtiqueta =
  | 'logo' | 'unidade' | 'produto' | 'tipo' | 'metodo' | 'data_manipulacao' | 'validade'
  | 'responsavel' | 'lote' | 'fornecedor' | 'sif' | 'quantidade' | 'alergenicos'
  | 'observacoes' | 'validade_fabricante' | 'codigo' | 'qr';

export const CAMPOS_ETIQUETA: { valor: CampoEtiqueta; rotulo: string }[] = [ /* todos acima com rótulo pt-BR */ ];

export const ALERGENICOS = [
  'gluten', 'crustaceos', 'ovos', 'peixes', 'amendoim', 'soja', 'leite', 'lactose',
  'castanhas', 'nozes', 'macadamia', 'pistache', 'amendoas', 'avelas', 'latex', 'sulfitos', 'gergelim', 'mostarda', 'aipo', 'moluscos',
] as const;
export type Alergenico = (typeof ALERGENICOS)[number];
export const ALERGENICO_ROTULO: Record<Alergenico, string>; // 'gluten' → 'Glúten', etc.

export const METODO_ROTULO: Record<MetodoConservacao, string>;   // 'RESFRIADO', 'CONGELADO', 'AMBIENTE', 'DESCONGELANDO'
export const FAIXA_METODO: Record<MetodoConservacao, string>;    // '0 a 5 °C', '≤ -18 °C', 'Temp. ambiente', 'Sob refrig. ≤ 5 °C'
export const TIPO_ETIQUETA_ROTULO: Record<TipoEtiqueta, string>;  // 'Manipulação','Produto aberto','Porcionado','Produção','Descongelamento','Amostra','Recebimento'
export const STATUS_ROTULO: Record<StatusEtiqueta, string>;
export const MOTIVO_DESCARTE_ROTULO: Record<MotivoDescarte, string>;
export const UNIDADE_MEDIDA_ROTULO: Record<UnidadeMedida, string>;
export const TIPO_EQUIPAMENTO_ROTULO: Record<TipoEquipamento, string>;
export const PAPEL_ROTULO: Record<PapelUsuario, string>;
export const FREQUENCIA_ROTULO: Record<FrequenciaChecklist, string>;

export interface Unidade { id: UUID; nome: string; slug: string; endereco: string | null; cidade: string | null; uf: string | null; cnpj: string | null; telefone: string | null; responsavel_tecnico: string | null; registro_rt: string | null; ativo: boolean; created_at: ISODateTime; updated_at: ISODateTime; }
export interface Perfil { id: UUID; nome: string; email: string; papel: PapelUsuario; unidade_id: UUID | null; ativo: boolean; created_at: ISODateTime; updated_at: ISODateTime; }
export interface Categoria { id: UUID; nome: string; cor: string; ordem: number; temp_recebimento_max_c: number | null; ativo: boolean; created_at: ISODateTime; updated_at: ISODateTime; }
export interface Fornecedor { id: UUID; nome: string; razao_social: string | null; cnpj: string | null; contato: string | null; telefone: string | null; email: string | null; observacoes: string | null; ativo: boolean; created_at: ISODateTime; updated_at: ISODateTime; }
export interface Produto {
  id: UUID; nome: string; categoria_id: UUID | null; fornecedor_padrao_id: UUID | null; unidade_id: UUID | null;
  unidade_medida: UnidadeMedida; metodo_padrao: MetodoConservacao;
  validade_resfriado_horas: number | null; validade_congelado_horas: number | null;
  validade_ambiente_horas: number | null; validade_descongelando_horas: number | null;
  alergenicos: string[]; sif: string | null; codigo_barras: string | null; custo_unitario: number | null;
  observacoes: string | null; ativo: boolean; created_at: ISODateTime; updated_at: ISODateTime;
}
export interface ProdutoComCategoria extends Produto { categoria: Pick<Categoria, 'id' | 'nome' | 'cor'> | null; }
export interface ModeloEtiqueta { id: UUID; nome: string; largura_mm: number; altura_mm: number; campos: CampoEtiqueta[]; fonte_base_pt: number; mostrar_logo: boolean; unidade_id: UUID | null; padrao: boolean; ativo: boolean; created_at: ISODateTime; updated_at: ISODateTime; }
export interface Etiqueta {
  id: UUID; codigo: string; unidade_id: UUID; produto_id: UUID | null; produto_nome: string; categoria_nome: string | null;
  tipo: TipoEtiqueta; metodo: MetodoConservacao; data_manipulacao: ISODateTime; validade_horas: number | null;
  data_validade: ISODateTime; data_validade_fabricante: ISODate | null; lote: string | null;
  fornecedor_id: UUID | null; fornecedor_nome: string | null; sif: string | null;
  quantidade: number | null; unidade_medida: UnidadeMedida | null; alergenicos: string[]; observacoes: string | null;
  responsavel_id: UUID | null; responsavel_nome: string | null; modelo_id: UUID | null;
  etiqueta_origem_id: UUID | null; recebimento_item_id: UUID | null;
  status: StatusEtiqueta; status_em: ISODateTime | null; status_por: UUID | null; impressoes: number;
  created_by: UUID | null; created_at: ISODateTime; updated_at: ISODateTime;
}
export interface EtiquetaDetalhe extends Etiqueta { unidade_nome: string; modelo_nome: string | null; horas_restantes: number; situacao: SituacaoEtiqueta; }
export interface EtiquetaPublica { codigo: string; produto_nome: string; tipo: TipoEtiqueta; metodo: MetodoConservacao; data_manipulacao: ISODateTime; data_validade: ISODateTime; status: StatusEtiqueta; situacao: SituacaoEtiqueta; unidade_nome: string; lote: string | null; alergenicos: string[]; responsavel_primeiro_nome: string | null; }
export interface EtiquetaMovimentacao { id: number; etiqueta_id: UUID; tipo: TipoMovimentacao; status_anterior: StatusEtiqueta | null; status_novo: StatusEtiqueta | null; detalhes: Record<string, unknown>; usuario_id: UUID | null; created_at: ISODateTime; usuario?: Pick<Perfil, 'id' | 'nome'> | null; }
export interface Descarte { id: UUID; unidade_id: UUID; etiqueta_id: UUID | null; produto_id: UUID | null; produto_nome: string; motivo: MotivoDescarte; quantidade: number; unidade_medida: UnidadeMedida; peso_kg: number | null; custo_estimado: number | null; observacao: string | null; responsavel_id: UUID | null; descartado_em: ISODateTime; created_at: ISODateTime; responsavel?: Pick<Perfil, 'id' | 'nome'> | null; }
export interface Recebimento { id: UUID; unidade_id: UUID; fornecedor_id: UUID | null; nota_fiscal: string | null; recebido_em: ISODateTime; temperatura_veiculo_c: number | null; veiculo_limpo: boolean | null; entregador_uniformizado: boolean | null; status: StatusRecebimento; observacoes: string | null; responsavel_id: UUID | null; created_at: ISODateTime; updated_at: ISODateTime; fornecedor?: Pick<Fornecedor, 'id' | 'nome'> | null; }
export interface RecebimentoItem { id: UUID; recebimento_id: UUID; produto_id: UUID | null; produto_nome: string; quantidade: number; unidade_medida: UnidadeMedida; lote: string | null; data_fabricacao: ISODate | null; data_validade: ISODate | null; temperatura_c: number | null; sif: string | null; embalagem_integra: boolean; conforme: boolean; motivo_nao_conformidade: string | null; created_at: ISODateTime; }
export interface RecebimentoComItens extends Recebimento { itens: RecebimentoItem[]; }
export interface Equipamento { id: UUID; unidade_id: UUID; nome: string; tipo: TipoEquipamento; temp_min_c: number | null; temp_max_c: number | null; localizacao: string | null; ativo: boolean; created_at: ISODateTime; updated_at: ISODateTime; }
export interface RegistroTemperatura { id: UUID; equipamento_id: UUID; unidade_id: UUID; temperatura_c: number; conforme: boolean; acao_corretiva: string | null; responsavel_id: UUID | null; registrado_em: ISODateTime; created_at: ISODateTime; equipamento?: Pick<Equipamento, 'id' | 'nome' | 'tipo'> | null; responsavel?: Pick<Perfil, 'id' | 'nome'> | null; }
export interface TemperaturaUltima { equipamento_id: UUID; equipamento_nome: string; tipo: TipoEquipamento; unidade_id: UUID; temp_min_c: number | null; temp_max_c: number | null; temperatura_c: number | null; conforme: boolean | null; registrado_em: ISODateTime | null; horas_desde_registro: number | null; }
export interface Checklist { id: UUID; unidade_id: UUID | null; nome: string; descricao: string | null; frequencia: FrequenciaChecklist; ativo: boolean; created_at: ISODateTime; updated_at: ISODateTime; }
export interface ChecklistItem { id: UUID; checklist_id: UUID; ordem: number; texto: string; obrigatorio: boolean; created_at: ISODateTime; }
export interface ChecklistComItens extends Checklist { itens: ChecklistItem[]; }
export interface ChecklistExecucao { id: UUID; checklist_id: UUID; unidade_id: UUID; responsavel_id: UUID | null; executado_em: ISODateTime; observacoes: string | null; total_itens: number; itens_conformes: number; created_at: ISODateTime; checklist?: Pick<Checklist, 'id' | 'nome'> | null; responsavel?: Pick<Perfil, 'id' | 'nome'> | null; }
export interface ChecklistResposta { id: UUID; execucao_id: UUID; item_id: UUID | null; item_texto: string; conforme: boolean; observacao: string | null; }

export interface DashboardResumo { ativas: number; vencidas: number; vence_hoje: number; vence_24h: number; vence_72h: number; emitidas_hoje: number; descartes_7d_kg: number; descartes_7d_custo: number; temperaturas_nao_conformes_24h: number; equipamentos_sem_registro_12h: number; recebimentos_hoje: number; }
export interface DesperdicioLinha { agrupador: 'motivo' | 'produto' | 'categoria' | 'dia'; chave: string; total_peso_kg: number; total_custo: number; registros: number; }
export interface RelatorioEtiquetaLinha { produto_nome: string; emitidas: number; consumidas: number; descartadas: number; vencidas: number; ativas: number; }

/** Dados mínimos para renderizar uma etiqueta (preview usa antes de salvar). */
export interface LabelData {
  codigo: string; // pode ser 'PREVIEW0' no preview
  produto_nome: string; tipo: TipoEtiqueta; metodo: MetodoConservacao;
  data_manipulacao: ISODateTime; data_validade: ISODateTime; data_validade_fabricante?: ISODate | null;
  responsavel_nome?: string | null; lote?: string | null; fornecedor_nome?: string | null; sif?: string | null;
  quantidade?: number | null; unidade_medida?: UnidadeMedida | null; alergenicos?: string[]; observacoes?: string | null;
  unidade_nome?: string | null;
}

// Inputs
export type Insert<T, Omit_ extends keyof T = never> = Omit<T, 'id' | 'created_at' | 'updated_at' | Omit_>;
export interface NovaEtiquetaInput {
  unidade_id: UUID; produto_id: UUID | null; produto_nome?: string; tipo: TipoEtiqueta; metodo: MetodoConservacao;
  data_manipulacao?: ISODateTime; validade_horas?: number | null; data_validade?: ISODateTime | null;
  data_validade_fabricante?: ISODate | null; lote?: string | null; fornecedor_id?: UUID | null; sif?: string | null;
  quantidade?: number | null; unidade_medida?: UnidadeMedida | null; alergenicos?: string[]; observacoes?: string | null;
  modelo_id?: UUID | null; etiqueta_origem_id?: UUID | null; recebimento_item_id?: UUID | null;
}
export interface FiltroEtiquetas { unidadeId: UUID | null; status?: StatusEtiqueta | 'todas'; situacao?: SituacaoEtiqueta; busca?: string; produtoId?: UUID; tipo?: TipoEtiqueta; metodo?: MetodoConservacao; de?: ISODate; ate?: ISODate; limit?: number; offset?: number; ordenarPor?: 'data_validade' | 'created_at'; }
export interface BaixaInput { status: 'consumida' | 'descartada'; motivo?: MotivoDescarte; quantidade?: number; observacao?: string; }
export interface NovoDescarteInput { unidade_id: UUID; etiqueta_id?: UUID | null; produto_id?: UUID | null; produto_nome?: string; motivo: MotivoDescarte; quantidade: number; unidade_medida: UnidadeMedida; peso_kg?: number | null; observacao?: string | null; descartado_em?: ISODateTime; }
export interface NovoRecebimentoInput { unidade_id: UUID; fornecedor_id: UUID | null; nota_fiscal?: string | null; recebido_em?: ISODateTime; temperatura_veiculo_c?: number | null; veiculo_limpo?: boolean | null; entregador_uniformizado?: boolean | null; status: StatusRecebimento; observacoes?: string | null; itens: Omit<RecebimentoItem, 'id' | 'recebimento_id' | 'created_at'>[]; }
export interface NovoRegistroTemperaturaInput { equipamento_id: UUID; temperatura_c: number; acao_corretiva?: string | null; registrado_em?: ISODateTime; }
export interface NovaExecucaoChecklistInput { checklist_id: UUID; unidade_id: UUID; observacoes?: string | null; respostas: { item_id: UUID; item_texto: string; conforme: boolean; observacao?: string | null }[]; }
export interface NovoUsuarioInput { email: string; senha: string; nome: string; papel: PapelUsuario; unidade_id: UUID | null; }
export interface Paginado<T> { data: T[]; total: number; }
```
Constantes `Record` acima devem ser **implementadas** (com valores) no arquivo — os comentários indicam os valores.

---

## 7. Camada de acesso — `src/lib/supabase.ts` e `src/lib/api/*.ts` (Backend B)

`src/lib/supabase.ts`:
```ts
export const supabase: SupabaseClient; // createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } })
export const supabaseConfigurado: boolean; // false se env ausente (UI mostra aviso no login)
export class ApiError extends Error { code?: string; details?: string; }
export function unwrap<T>(res: { data: T | null; error: PostgrestError | null }): T; // lança ApiError com mensagem pt-BR
```
Cliente **sem genérico** `Database`; tipagem via retornos das funções. Todas as funções `async`, lançam `ApiError` em erro. `src/lib/api/index.ts` re-exporta tudo (`export * from './etiquetas'` …).

| Arquivo | Funções |
|---|---|
| `auth.ts` | `signIn(email: string, senha: string): Promise<void>` · `signOut(): Promise<void>` · `getSessionUserId(): Promise<UUID \| null>` · `getPerfilAtual(): Promise<Perfil \| null>` · `onAuthChange(cb: (userId: UUID \| null) => void): () => void` · `enviarResetSenha(email: string): Promise<void>` · `atualizarSenha(nova: string): Promise<void>` |
| `unidades.ts` | `listUnidades(): Promise<Unidade[]>` · `getUnidade(id: UUID): Promise<Unidade>` · `updateUnidade(id: UUID, patch: Partial<Insert<Unidade>>): Promise<Unidade>` |
| `perfis.ts` | `listPerfis(unidadeId?: UUID \| null): Promise<Perfil[]>` · `updatePerfil(id: UUID, patch: Partial<Pick<Perfil, 'nome' \| 'papel' \| 'unidade_id' \| 'ativo'>>): Promise<Perfil>` · `criarUsuario(input: NovoUsuarioInput): Promise<Perfil>` (usa um 2º client `createClient(..., { auth: { persistSession: false, autoRefreshToken: false, storageKey: 'macaw-signup' } })` para `auth.signUp({ email, password, options: { data: { nome, unidade_id } } })`, depois `updatePerfil` com papel/unidade pelo admin logado) |
| `categorias.ts` | `listCategorias(opts?: { incluirInativas?: boolean }): Promise<Categoria[]>` · `createCategoria(input: Insert<Categoria>): Promise<Categoria>` · `updateCategoria(id, patch: Partial<Insert<Categoria>>): Promise<Categoria>` · `deleteCategoria(id): Promise<void>` |
| `fornecedores.ts` | `listFornecedores(opts?: { busca?: string; incluirInativos?: boolean })` · `createFornecedor` · `updateFornecedor` · `deleteFornecedor` (mesmos padrões) |
| `produtos.ts` | `listProdutos(opts?: { busca?: string; categoriaId?: UUID; unidadeId?: UUID \| null; incluirInativos?: boolean }): Promise<ProdutoComCategoria[]>` (select `*, categoria:categorias(id,nome,cor)`; filtra `unidade_id is null or = unidadeId`; ordena por nome) · `getProduto(id): Promise<ProdutoComCategoria>` · `createProduto(input: Insert<Produto>): Promise<Produto>` · `updateProduto(id, patch): Promise<Produto>` · `deleteProduto(id): Promise<void>` (soft: `ativo=false`) |
| `modelos.ts` | `listModelos(unidadeId?: UUID \| null): Promise<ModeloEtiqueta[]>` · `getModelo(id)` · `getModeloPadrao(unidadeId: UUID \| null): Promise<ModeloEtiqueta \| null>` (padrão da unidade, senão global) · `createModelo(input: Insert<ModeloEtiqueta>)` · `updateModelo(id, patch)` · `deleteModelo(id)` |
| `etiquetas.ts` | `listEtiquetas(f: FiltroEtiquetas): Promise<Paginado<EtiquetaDetalhe>>` (de `vw_etiquetas`, `count: 'exact'`, busca `ilike` em produto_nome/codigo/lote, default limit 50, ordenar data_validade asc) · `getEtiqueta(id): Promise<EtiquetaDetalhe>` · `getEtiquetaPorCodigo(codigo: string): Promise<EtiquetaDetalhe \| null>` · `emitirEtiquetas(input: NovaEtiquetaInput, copias?: number): Promise<Etiqueta[]>` (insert de `copias` linhas, 1..100) · `emitirEtiquetaDerivada(origemId, tipo, metodo, opts?: { quantidade?: number; validadeHoras?: number }): Promise<Etiqueta>` (RPC) · `registrarImpressao(ids: UUID[]): Promise<void>` · `registrarReimpressao(id): Promise<number>` · `darBaixa(id: UUID, input: BaixaInput): Promise<Etiqueta>` · `listMovimentacoes(etiquetaId): Promise<EtiquetaMovimentacao[]>` (join `usuario:perfis(id,nome)`) · `listAVencer(unidadeId: UUID \| null, limite?: number): Promise<EtiquetaDetalhe[]>` · `marcarVencidas(unidadeId?: UUID \| null): Promise<number>` · `consultarEtiquetaPublica(codigo: string): Promise<EtiquetaPublica \| null>` |
| `descartes.ts` | `listDescartes(f: { unidadeId: UUID \| null; de?: ISODate; ate?: ISODate; motivo?: MotivoDescarte; limit?: number; offset?: number }): Promise<Paginado<Descarte>>` · `registrarDescarte(input: NovoDescarteInput): Promise<Descarte>` · `deleteDescarte(id): Promise<void>` |
| `recebimentos.ts` | `listRecebimentos(f: { unidadeId: UUID \| null; de?: ISODate; ate?: ISODate; fornecedorId?: UUID; limit?: number; offset?: number }): Promise<Paginado<Recebimento>>` · `getRecebimento(id): Promise<RecebimentoComItens>` · `criarRecebimento(input: NovoRecebimentoInput): Promise<RecebimentoComItens>` (insere cabeçalho e depois itens) |
| `equipamentos.ts` | `listEquipamentos(unidadeId: UUID \| null, opts?: { incluirInativos?: boolean }): Promise<Equipamento[]>` · `createEquipamento(input: Insert<Equipamento>)` · `updateEquipamento(id, patch)` · `deleteEquipamento(id)` |
| `temperaturas.ts` | `listRegistrosTemperatura(f: { unidadeId: UUID \| null; equipamentoId?: UUID; de?: ISODate; ate?: ISODate; somenteNaoConformes?: boolean; limit?: number; offset?: number }): Promise<Paginado<RegistroTemperatura>>` · `registrarTemperatura(input: NovoRegistroTemperaturaInput): Promise<RegistroTemperatura>` · `listUltimasTemperaturas(unidadeId: UUID \| null): Promise<TemperaturaUltima[]>` |
| `checklists.ts` | `listChecklists(unidadeId: UUID \| null): Promise<Checklist[]>` · `getChecklist(id): Promise<ChecklistComItens>` · `salvarChecklist(input: Insert<Checklist> & { id?: UUID; itens: { id?: UUID; ordem: number; texto: string; obrigatorio: boolean }[] }): Promise<ChecklistComItens>` · `deleteChecklist(id)` · `registrarExecucao(input: NovaExecucaoChecklistInput): Promise<ChecklistExecucao>` · `listExecucoes(f: { unidadeId: UUID \| null; checklistId?: UUID; de?: ISODate; ate?: ISODate; limit?: number }): Promise<ChecklistExecucao[]>` · `getRespostas(execucaoId): Promise<ChecklistResposta[]>` |
| `relatorios.ts` | `getDashboardResumo(unidadeId: UUID): Promise<DashboardResumo>` · `relatorioDesperdicio(unidadeId: UUID \| null, de: ISODate, ate: ISODate): Promise<DesperdicioLinha[]>` · `relatorioEtiquetas(unidadeId: UUID \| null, de: ISODate, ate: ISODate): Promise<RelatorioEtiquetaLinha[]>` · `toCsv(rows: Record<string, unknown>[], colunas?: { chave: string; titulo: string }[]): string` · `baixarCsv(nome: string, csv: string): void` |

Regra: `unidadeId === null` em filtros = “todas as unidades acessíveis” (só admin vê ambas).

---

## 8. Funções puras (Backend B) — testadas pelo Testador

`src/lib/validade.ts`:
```ts
export function horasValidadeProduto(produto: Pick<Produto, 'validade_resfriado_horas' | 'validade_congelado_horas' | 'validade_ambiente_horas' | 'validade_descongelando_horas'>, metodo: MetodoConservacao): number | null;
export function metodosDisponiveis(produto: Parameters<typeof horasValidadeProduto>[0]): MetodoConservacao[]; // ordem: resfriado, congelado, ambiente, descongelando
export function calcularValidade(dataManipulacao: Date | string, horas: number): Date; // lança Error se horas <= 0 ou não finito
export function situacaoValidade(dataValidade: Date | string, agora?: Date): SituacaoValidade; // mesmas regras da view (hoje = mesmo dia civil no fuso local)
export function horasRestantes(dataValidade: Date | string, agora?: Date): number; // negativo se vencida, 1 casa
export function horasParaDiasHoras(horas: number): { dias: number; horas: number };
export function diasHorasParaHoras(dias: number, horas: number): number;
export function descreverPrazo(horas: number): string; // 72 → '3 dias'; 30 → '1 dia e 6 h'; 12 → '12 h'; 720 → '30 dias'
export function ordenarPVPS<T extends { data_validade: string }>(itens: T[]): T[]; // asc por validade, sem mutar
```
`src/lib/format.ts`:
```ts
export function formatarDataHora(d: Date | string | null | undefined): string; // 'dd/MM/yy HH:mm' ; '—' se vazio
export function formatarData(d: Date | string | null | undefined): string;     // 'dd/MM/yyyy'
export function formatarDataCurta(d: Date | string | null | undefined): string; // 'dd/MM HH:mm' (etiqueta)
export function formatarRelativo(d: Date | string): string; // 'em 3 h', 'há 2 dias' (date-fns ptBR)
export function formatarQuantidade(q: number | null | undefined, um?: UnidadeMedida | null): string; // '1,5 kg'
export function formatarMoeda(v: number | null | undefined): string; // 'R$ 12,30'
export function formatarTemperatura(t: number | null | undefined): string; // '-18,0 °C'
export function rotuloSituacao(s: SituacaoEtiqueta): string; // 'Vencida','Vence hoje','Vence em 24 h','Vence em 72 h','Dentro do prazo','Consumida','Descartada'
export function corSituacao(s: SituacaoEtiqueta): BadgeVariant; // vencida→'danger', vence_hoje→'danger', vence_24h→'warning', vence_72h→'warning', ok→'success', consumida→'neutral', descartada→'neutral'
export function urlConsultaQr(codigo: string, origin?: string): string; // `${origin ?? window.location.origin}/q/${codigo}`
export function normalizarCodigo(input: string): string; // upper, remove espaços; se for URL contendo '/q/', extrai o código
```
`BadgeVariant` é importado de `@/components/ui` (Frontend A) — para evitar ciclo, **definir `BadgeVariant` em `src/types/database.ts`**: `export type BadgeVariant = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'olive';` e o Badge importa de lá.

---

## 9. Rotas (`src/App.tsx`, Frontend A)

`<BrowserRouter>` → `<AuthProvider>` → `<Routes>`:

| Rota | Componente (arquivo) | Acesso |
|---|---|---|
| `/login` | `pages/LoginPage` | público |
| `/q/:codigo` | `pages/publico/ConsultaQrPage` | público, **sem** layout |
| `/` (layout `RequireAuth` + `UnidadeProvider` + `AppLayout` com `<Outlet/>`) | | autenticado |
| `/` index | `pages/DashboardPage` | todos |
| `/etiquetas` | `pages/etiquetas/EtiquetasPage` | todos |
| `/etiquetas/nova` | `pages/etiquetas/EmitirEtiquetaPage` (query opcional `?produto=<id>&origem=<etiquetaId>`) | todos |
| `/etiquetas/baixa` | `pages/etiquetas/BaixaRapidaPage` | todos |
| `/etiquetas/:id` | `pages/etiquetas/EtiquetaDetalhePage` | todos |
| `/recebimentos` | `pages/recebimentos/RecebimentosPage` | todos |
| `/recebimentos/novo` | `pages/recebimentos/NovoRecebimentoPage` | todos |
| `/recebimentos/:id` | `pages/recebimentos/RecebimentoDetalhePage` | todos |
| `/temperaturas` | `pages/temperaturas/TemperaturasPage` | todos |
| `/equipamentos` | `pages/temperaturas/EquipamentosPage` | gerente+ |
| `/descartes` | `pages/descartes/DescartesPage` | todos |
| `/checklists` | `pages/checklists/ChecklistsPage` | todos (edição gerente+) |
| `/checklists/:id/executar` | `pages/checklists/ExecutarChecklistPage` | todos |
| `/produtos` | `pages/produtos/ProdutosPage` | todos (edição gerente+) |
| `/categorias` | `pages/categorias/CategoriasPage` | gerente+ |
| `/fornecedores` | `pages/fornecedores/FornecedoresPage` | gerente+ |
| `/modelos` | `pages/modelos/ModelosPage` | gerente+ |
| `/relatorios` | `pages/relatorios/RelatoriosPage` | gerente+ |
| `/usuarios` | `pages/usuarios/UsuariosPage` | admin |
| `/unidades` | `pages/unidades/UnidadesPage` | admin |
| `*` | `pages/NotFoundPage` | |

Páginas de Frontend B carregadas com `React.lazy(() => import('@/pages/...'))` + `<Suspense fallback={<Spinner/>}>`. Restrição por papel: `<RequireRole papeis={['admin','gerente']}>`.

Sidebar (ordem, com ícones SVG inline simples): Painel · Emitir etiqueta (destaque, botão primário oliva) · Etiquetas · Baixa rápida · Recebimento · Temperaturas · Descartes · Checklists · — Cadastros: Produtos · Categorias · Fornecedores · Modelos · Equipamentos · — Gestão: Relatórios · Usuários · Unidades. Itens ocultos conforme papel. Header: nome da página, `UnidadeSelector`, nome/papel do usuário, sair. Responsivo: abaixo de 900px a sidebar vira gaveta (botão ☰).

---

## 10. Contextos (Frontend A)

`src/contexts/AuthContext.tsx`:
```ts
interface AuthContextValue { userId: UUID | null; perfil: Perfil | null; carregando: boolean; signIn(email: string, senha: string): Promise<void>; signOut(): Promise<void>; recarregarPerfil(): Promise<void>; temPapel(...papeis: PapelUsuario[]): boolean; }
export function AuthProvider(props: { children: ReactNode }): JSX.Element;
export function useAuth(): AuthContextValue;
```
`src/contexts/UnidadeContext.tsx`:
```ts
interface UnidadeContextValue { unidades: Unidade[]; unidadeAtual: Unidade | null; unidadeId: UUID | null; /* null só p/ admin em 'Todas' */ podeTrocar: boolean; setUnidadeId(id: UUID | null): void; carregando: boolean; }
export function UnidadeProvider(props: { children: ReactNode }): JSX.Element;
export function useUnidade(): UnidadeContextValue;
```
Regras: não-admin fica fixo em `perfil.unidade_id`; admin escolhe (persistido em `localStorage['macaw.unidadeId']`, com try/catch), opção “Todas as unidades” = `null`. Telas de **emissão/registro** exigem unidade concreta: se `unidadeId === null`, mostrar `EmptyState` pedindo para escolher a unidade.

`RequireAuth`: se `carregando` → Spinner; sem `userId` → `<Navigate to="/login" state={{ from }} />`; perfil `ativo=false` → mensagem de acesso bloqueado. `RequireRole({ papeis, children })` → se não tem papel, `EmptyState` “Sem permissão”.

Mensagens: toasts via `useToast()` (ver §11).

---

## 11. Componentes UI base — `src/components/ui/*` (Frontend A)

Todos exportados nomeadamente via `src/components/ui/index.ts`. Estilos em `src/styles/ui.css` (classes prefixo `ui-`). Props estendem atributos HTML nativos quando indicado.

```ts
// Button.tsx
type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost' | 'warning';
type ButtonSize = 'sm' | 'md';
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean; icon?: React.ReactNode; block?: boolean; }
export const Button: React.ForwardRefExoticComponent<ButtonProps & React.RefAttributes<HTMLButtonElement>>; // default variant 'secondary', type 'button'

// Input.tsx
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> { label?: string; hint?: string; error?: string; suffix?: React.ReactNode; }
export const Input: ForwardRef<HTMLInputElement, InputProps>; // gera id automático (useId) ligando label
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> { label?: string; hint?: string; error?: string; }
export const Textarea: ForwardRef<HTMLTextAreaElement, TextareaProps>;
interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> { label: React.ReactNode; }
export const Checkbox: ForwardRef<HTMLInputElement, CheckboxProps>;

// Select.tsx
interface SelectOption { value: string; label: string; disabled?: boolean; }
interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> { label?: string; hint?: string; error?: string; options: SelectOption[]; placeholder?: string; }
export const Select: ForwardRef<HTMLSelectElement, SelectProps>; // placeholder vira <option value="">

// Card.tsx
interface CardProps extends React.HTMLAttributes<HTMLDivElement> { title?: React.ReactNode; actions?: React.ReactNode; accent?: boolean /* default true: filete oliva no topo + linha dupla creme sob o título */; padding?: 'none' | 'sm' | 'md'; }
export function Card(p: CardProps): JSX.Element;
interface StatCardProps { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: 'olive' | 'danger' | 'warning' | 'success' | 'neutral'; to?: string /* link */; }
export function StatCard(p: StatCardProps): JSX.Element;

// Table.tsx
interface Column<T> { key: string; header: React.ReactNode; render?: (row: T) => React.ReactNode; width?: string | number; align?: 'left' | 'center' | 'right'; className?: string; }
interface TableProps<T> { columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string; loading?: boolean; empty?: React.ReactNode; onRowClick?: (row: T) => void; compact?: boolean; }
export function Table<T>(p: TableProps<T>): JSX.Element; // sem render → String(row[key] ?? '—')
interface PaginationProps { total: number; limit: number; offset: number; onChange(offset: number): void; }
export function Pagination(p: PaginationProps): JSX.Element;

// Badge.tsx
import type { BadgeVariant } from '@/types/database';
interface BadgeProps { variant?: BadgeVariant; children: React.ReactNode; title?: string; dot?: boolean; }
export function Badge(p: BadgeProps): JSX.Element;

// Modal.tsx
interface ModalProps { open: boolean; onClose(): void; title: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; size?: 'sm' | 'md' | 'lg'; }
export function Modal(p: ModalProps): JSX.Element | null; // portal em document.body, ESC fecha, foco no primeiro campo
interface ConfirmDialogProps { open: boolean; title: string; message: React.ReactNode; confirmLabel?: string; variant?: 'danger' | 'primary'; loading?: boolean; onConfirm(): void; onCancel(): void; }
export function ConfirmDialog(p: ConfirmDialogProps): JSX.Element | null;

// PageHeader.tsx
interface PageHeaderProps { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode; back?: string /* rota */; }
export function PageHeader(p: PageHeaderProps): JSX.Element; // também define document.title = `${title} · Etiquetas Macaw`

// EmptyState.tsx
interface EmptyStateProps { title: string; description?: React.ReactNode; action?: React.ReactNode; icon?: React.ReactNode; }
export function EmptyState(p: EmptyStateProps): JSX.Element;

// Spinner.tsx
export function Spinner(p: { size?: number; label?: string }): JSX.Element;

// Toast.tsx
export function ToastProvider(p: { children: React.ReactNode }): JSX.Element; // montado em main.tsx
export function useToast(): { success(msg: string): void; error(msg: string | unknown): void; info(msg: string): void; };

// Tabs.tsx
interface TabsProps { tabs: { id: string; label: React.ReactNode }[]; active: string; onChange(id: string): void; }
export function Tabs(p: TabsProps): JSX.Element;

// FormRow.tsx — grid responsivo de campos
export function FormRow(p: { children: React.ReactNode; cols?: 1 | 2 | 3 | 4 }): JSX.Element;
```
Exportar também os tipos (`ButtonProps`, `Column`, `SelectOption`, etc.).

---

## 12. Etiqueta: preview e impressão (Frontend B — `src/components/label/*`)

```ts
// labelFields.ts
export function linhasEtiqueta(data: LabelData, campos: CampoEtiqueta[]): { campo: CampoEtiqueta; rotulo: string; valor: string }[];
// ignora campos vazios (ex.: lote null), exceto produto/validade; formata datas com formatarDataCurta; alergênicos 'Contém: Glúten, Leite'
export function tamanhoQrMm(modelo: Pick<ModeloEtiqueta, 'largura_mm' | 'altura_mm'>): number; // min(altura*0.55, largura*0.4), limitado 10..30

// QrCode.tsx
export function QrCode(p: { value: string; sizeMm: number; className?: string }): JSX.Element; // usa QRCode.toString(value, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }) e injeta SVG; em erro mostra código

// LabelPreview.tsx
export interface LabelPreviewProps { data: LabelData; modelo: Pick<ModeloEtiqueta, 'largura_mm' | 'altura_mm' | 'campos' | 'fonte_base_pt' | 'mostrar_logo'>; escala?: number /* só na tela; default 1 */; qrOrigin?: string; }
export function LabelPreview(p: LabelPreviewProps): JSX.Element;
// raiz: <div className="label" data-testid="label-preview" style={{ width: `${largura_mm}mm`, height: `${altura_mm}mm`, fontSize: `${fonte_base_pt}pt` }}>
// layout (100% monocromático — preto sobre branco, inclusive na tela, para refletir a térmica): faixa do método no topo em texto invertido (fundo preto, letra branca: METODO_ROTULO + FAIXA_METODO),
// logo (componente Logo em preto, quando mostrar_logo/'logo' ∈ campos),
// nome do produto em negrito (até 2 linhas, ellipsis), validade destacada 'VAL: dd/MM HH:mm' em caixa com borda grossa,
// demais campos em linhas 'Rótulo: valor', QR à direita (quando 'qr' ∈ campos) com código abaixo em mono.
// Impressão térmica é monocromática: nenhuma cor da paleta em label.css; use #000 e #fff apenas. Na tela o preview fica sobre um 'papel' branco com sombra leve.

// LabelPrintSheet.tsx
export function LabelPrintSheet(p: { itens: LabelData[]; modelo: LabelPreviewProps['modelo'] }): JSX.Element; // cada etiqueta numa página (page-break-after: always)

// printLabels.ts
export async function imprimirEtiquetas(itens: LabelData[], modelo: LabelPreviewProps['modelo']): Promise<void>;
// 1) monta LabelPrintSheet em #print-root via createRoot; 2) injeta <style id="macaw-page-size">@page { size: ${largura}mm ${altura}mm; margin: 0 }</style>;
// 3) aguarda QR (Promise) e 2 requestAnimationFrame; 4) window.print(); 5) no 'afterprint' desmonta e remove o style.
export function etiquetaParaLabelData(e: Etiqueta | EtiquetaDetalhe, unidadeNome?: string): LabelData;
```
Frontend A garante em `index.html` um `<div id="print-root"></div>` após `#root` e em `src/styles/print.css`:
```css
#print-root { display: none; }
@media print {
  html, body { margin: 0; padding: 0; background: #fff; }
  body > #root { display: none !important; }
  #print-root { display: block; }
  #print-root .label { page-break-after: always; break-after: page; box-shadow: none; border: none; }
}
```

Fluxo Emitir etiqueta: escolher produto (busca com autocomplete) → tipo → método (só os disponíveis; preenche validade padrão, editável em dias/horas) → data/hora de manipulação (default agora) → campos opcionais (lote, fornecedor, SIF, quantidade, observações) → modelo (default `getModeloPadrao`) → cópias → **preview ao vivo** → “Emitir e imprimir” (`emitirEtiquetas` → `imprimirEtiquetas` → `registrarImpressao`). Produto sem validade para o método: exigir validade manual.

Página pública `/q/:codigo`: logo, nome do produto grande, situação com Badge grande (VENCIDA terracota / A VENCER mostarda / OK oliva), fundo `--bg` creme, datas, método, unidade, alergênicos; se usuário logado, botão “Abrir no sistema” → `/etiquetas/:id` via `getEtiquetaPorCodigo`. Código inexistente → EmptyState.

---

## 13. Plano de testes (Testador)

1. **Instalação e build**: `npm install`; `npm run typecheck` (tsc strict sem erros); `npm run build` (Vite) sem erros.
2. **SQL em Postgres local** (se `postgres`/`psql` disponível ou instalável via apt): criar banco, simular Supabase com stub mínimo — `create schema auth; create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$; create role anon; create role authenticated;` — aplicar `0001` → `0002` → `0003` → `seed.sql` com `psql -v ON_ERROR_STOP=1`. Verificar:
   - inserir usuário em `auth.users` gera `perfis` com papel `admin` (primeiro) e `cozinheiro` (segundo);
   - insert em `etiquetas` sem `data_validade` calcula pela validade do produto/método; `codigo` com 8 caracteres do alfabeto; movimentação `emissao` criada;
   - update de status cria movimentação e `status_em`;
   - `dar_baixa_etiqueta(..., 'descartada')` cria `descartes` com `peso_kg`/`custo_estimado`;
   - `registros_temperatura` calcula `conforme`;
   - `consultar_etiqueta_publica` funciona como `anon` (`set role anon`) e `select` direto em `etiquetas` como `anon` falha/retorna vazio;
   - RLS: cozinheiro de Camboinhas (`set request.jwt.claim.sub`) não vê etiquetas de Búzios.
3. **Unitários (vitest)**:
   - `validade.ts`: `calcularValidade` (72 h, virada de mês, horas inválidas lançam), `situacaoValidade` (cada faixa com `agora` fixo), `horasParaDiasHoras`/`diasHorasParaHoras` ida e volta, `descreverPrazo`, `metodosDisponiveis`, `ordenarPVPS` não muta.
   - `format.ts`: datas pt-BR, moeda, quantidade, `normalizarCodigo` (URL → código, minúsculas → maiúsculas), `urlConsultaQr`.
   - `labelFields.ts`: ordem dos campos respeita o modelo; campos vazios omitidos; alergênicos formatados; `tamanhoQrMm` nos limites.
   - `LabelPreview`: renderiza com `data-testid="label-preview"`, `style.width === '60mm'`/`height '40mm'`, mostra nome do produto, texto do método (“RESFRIADO”), validade formatada; sem `'qr'` em campos não renderiza QR; com `'lote'` mostra lote.
4. **Revisão estática**: imports `@/` resolvem; nenhum arquivo fora da divisão; nomes de colunas usados em `src/lib/api` batem com §4.3; nenhuma chave secreta no repositório; `.env.example` presente.
5. **Smoke manual (opcional, com Supabase real)**: login → emitir 60×40 → imprimir (diálogo do navegador com tamanho 60×40 mm) → ler QR → página pública → baixa.

Critério de aceite: typecheck + build + testes vitest verdes; SQL aplica sem erro em Postgres 15+ com o stub de auth.

---

## 14. Convenções gerais
- Textos de UI em pt-BR, com acentos. Identificadores de código/banco sem acento.
- Sem `any` implícito; `any` explícito só em `src/lib/api` ao converter respostas do Supabase.
- Datas enviadas ao banco como ISO (`toISOString()`); datas `date` como `'yyyy-MM-dd'`.
- Números: `numeric` do Postgres chega como `number` (supabase-js) — normalizar com `Number()` na API quando necessário.
- Acessibilidade: labels em todos os inputs; botões com texto; contraste AA.
- Não commitar `.env`. Não criar arquivos fora da sua divisão.
