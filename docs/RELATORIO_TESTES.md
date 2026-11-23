# Relatório de Testes — Etiquetas Macaw

Data: 2026-11-23 · Agente Testador · Plano: `docs/PLANO.md` §13
Nenhum arquivo da aplicação foi alterado. Foram criados apenas arquivos de teste:

- `supabase/tests/smoke.sql` — smoke tests SQL (13 cenários, asserts com `RAISE EXCEPTION`, roda em transação com `ROLLBACK`)
- `src/lib/__tests__/validade.test.ts`, `src/lib/__tests__/format.test.ts`
- `src/components/label/__tests__/labelFields.test.ts`, `src/components/label/__tests__/LabelPreview.test.tsx`
- `src/components/ui/__tests__/ui.test.tsx`
- Script E2E (fora do repositório): `/tmp/claude-0/-home-user-etiquetasmacaw/e428ed3b-2093-5a70-aa86-328069117af5/scratchpad/e2e/run.cjs` (screenshots em `.../scratchpad/e2e/shots/`)

## Resumo

| Etapa | Comando | Resultado |
|---|---|---|
| Typecheck | `npx tsc --noEmit` / `npm run typecheck` | PASSOU (0 erros, inclusive com os novos testes) |
| Build | `npx vite build` / `npm run build` | PASSOU (bundle principal 481 kB / 141 kB gzip; páginas em chunks lazy) |
| SQL — aplicação 2× | `auth_stub` → `0001` → `0002` → `0003` → `seed` (×2, `ON_ERROR_STOP=1`) | PASSOU nas duas rodadas (idempotente). Contagens: 2 unidades, 60 produtos, 5 modelos, 10 equipamentos, 16 itens de checklist (sem duplicação) |
| SQL — smoke | `psql -v ON_ERROR_STOP=1 -f supabase/tests/smoke.sql` | PASSOU (T01–T13) |
| Vitest | `npx vitest run` | PASSOU — 5 arquivos, 78 testes |
| E2E Playwright | `node scratchpad/e2e/run.cjs` | PASSOU — 89/89 checagens (desktop 1366 px e mobile 390 px) |
| Impressão | E2E (snapshot do `window.print` + PDF Chromium) | PASSOU — `@page { size: 60mm 40mm; margin: 0 }`, PDF com 1 página 59,9×39,9 mm (arredondamento do Chromium), nenhum elemento fora da etiqueta nos 5 modelos |

Apesar de tudo verde nos critérios de aceite, a exploração encontrou **falhas de autorização/integridade** (RLS permissiva demais) e alguns bugs de fluxo — ver seção “Bugs”.

---

## 1. Typecheck e build

```
$ npx tsc --noEmit        → EXIT=0
$ npx vite build          → ✓ built in 2.01s, EXIT=0
$ npm run build           → (tsc -b && vite build) ✓
```

## 2. SQL (Postgres 16.15 local)

O diretório de dados do Postgres ficou em `/tmp/macaw-pg` (o usuário `postgres` não tem permissão de atravessar o diretório do scratchpad, que é `0700` de root); logs dos `psql` foram gravados no scratchpad (`sql_run{1,2}_*.log`, `smoke.log`).

```bash
B=/usr/lib/postgresql/16/bin; P=/tmp/macaw-pg
su postgres -c "$B/initdb -D $P/data -U postgres --auth=trust && $B/pg_ctl -D $P/data -o '-p 54329 -k $P' start"
psql -h $P -p 54329 -U postgres -c "create database macaw"
for f in supabase/tests/auth_stub.sql supabase/migrations/000{1,2,3}_*.sql supabase/seed.sql; do
  psql -h $P -p 54329 -U postgres -d macaw -v ON_ERROR_STOP=1 -f $f; done   # 2 vezes
psql -h $P -p 54329 -U postgres -d macaw -v ON_ERROR_STOP=1 -f supabase/tests/smoke.sql
```

Saída do smoke:

```
OK T01 primeiro usuário admin / demais cozinheiro
OK T02 admin emite etiqueta em Búzios (snapshot responsável)
OK T03 RLS isolamento por unidade + proteção de papel
OK T04 validade por método, snapshots, código, movimentação emissao
OK T05 código curto: 5000 únicos, alfabeto sem 0/O/1/I, constraint unique
OK T06a anon sem acesso a tabelas/views/RPCs internas
OK T06b consulta pública anon (dados mínimos, código case-insensitive)
OK T06c colunas expostas: alergenicos,codigo,data_manipulacao,data_validade,lote,metodo,p_codigo,produto_nome,responsavel_primeiro_nome,situacao,status,tipo,unidade_nome
OK T07 dar_baixa (consumo/descarte com custo/peso), status_em, movimentações, reimpressão
OK T08 derivada: descongelamento (origem consumida, 72 h) e porcionado limitado à origem
OK T09 vw_etiquetas_a_vencer + dashboard_resumo: {"ativas" : 4, "vencidas" : 0, "vence_hoje" : 3, "vence_24h" : 0, "vence_72h" : 1, "emitidas_hoje" : 9, "descartes_7d_kg" : 2.500, "descartes_7d_custo" : 184.75, ...}
OK T10 temperatura fora da faixa → não-conforme (geladeira/freezer/balcão) + dashboard
OK T11 relatórios de desperdício e etiquetas retornam dados
OK T12 isolamento recíproco (Búzios)
OK T12 admin vê todas as unidades; último admin protegido
OK T13 recálculo de validade no update + marcar_etiquetas_vencidas (1)
SMOKE SQL: TODOS OS TESTES PASSARAM
```

Cobertura do smoke: primeiro usuário admin / seguintes cozinheiro (com unidade do metadata); RLS (cozinheiro de Camboinhas não vê etiquetas/equipamentos/descartes de Búzios, não insere etiqueta nem temperatura em Búzios, não altera nem dá baixa em etiqueta de Búzios, não muda o próprio papel, não cadastra produto; recíproco para Búzios; admin vê tudo e não pode se rebaixar sendo o último admin); validade por método (resfriado 72 h, congelado 720 h, `validade_horas` explícita, método sem validade → erro); snapshots (produto, categoria, unidade de medida, responsável); código de 8 caracteres do alfabeto, normalização de código informado, 5000 códigos únicos e índice unique; anon: `consultar_etiqueta_publica` em minúsculas/espaços retorna dados mínimos e anon recebe `permission denied` em 9 tabelas/views e nas RPCs internas; `dar_baixa_etiqueta` (descarte 2 kg × R$ 89,90 = R$ 179,80, peso 2 kg, movimentação `descarte` sem `alteracao` espúria; baixa dupla e status inválido falham; consumo sem descarte; descarte sem quantidade → 1 un; vencida → motivo `vencido`); update direto de status gera `status_em` + movimentação; reimpressão; derivada congelado→descongelando (72 h, origem consumida, nova derivação da origem falha) e porcionado limitado à validade da origem; `vw_etiquetas_a_vencer` (só ativas ≤ 72 h e da própria unidade); `dashboard_resumo` (11 chaves, contagens e custos batem, sem vazamento entre unidades); temperatura (9 °C em geladeira 0–5 → não conforme mesmo com `conforme=true` enviado; limites inclusivos; freezer −12 não conforme; balcão 55 °C não conforme); relatórios; `marcar_etiquetas_vencidas`.

Sondagens exploratórias adicionais (fora do smoke, em transação com rollback) originaram os bugs 1–4 abaixo.

## 3. Vitest

```
$ npx vitest run
 ✓ src/lib/__tests__/validade.test.ts (31 tests)
 ✓ src/lib/__tests__/format.test.ts (19 tests)
 ✓ src/components/label/__tests__/LabelPreview.test.tsx (8 tests)
 ✓ src/components/label/__tests__/labelFields.test.ts (16 tests)
 ✓ src/components/ui/__tests__/ui.test.tsx (4 tests)
 Test Files  5 passed (5)
      Tests  78 passed (78)
```

Cobre: `calcularValidade` (72 h, virada de mês/ano/bissexto, horas e data inválidas lançam, não muta), `situacaoValidade` em todas as faixas com `agora` fixo, `horasRestantes` (sem −0), ida e volta dias/horas, `descreverPrazo`, `metodosDisponiveis`, `ordenarPVPS` não muta; `format.ts` (datas pt-BR, relativo com relógio falso, moeda sem NBSP, quantidade/porções, temperatura, `normalizarCodigo` com URL/minúsculas, `urlConsultaQr` e ida-e-volta); `linhasEtiqueta` (ordem do modelo, duplicados/qr/logo ignorados, vazios omitidos, obrigatórios com “—”, formatação, alergênicos); `tamanhoQrMm` (todos os modelos do seed, limites 10/30 mm, numeric como string); `LabelPreview` (60mm×40mm, 7pt, produto/“RESFRIADO”/validade, QR SVG só preto/branco, sem `qr` não renderiza QR, lote, escala, `label.css` 100% monocromático) e `LabelPrintSheet`; UI (`Button`, `Badge`, `Modal` com Esc/X).
Observação: os testes do QR geram avisos “not wrapped in act(...)” (estado assíncrono do `QrCode`) — apenas ruído.

## 4. E2E visual (Playwright/Chromium, `deviceScaleFactor: 1`)

Dois builds servidos com `vite preview`: sem `.env` (porta 4174) e com `VITE_SUPABASE_URL=https://mock-macaw.supabase.co` (porta 4173), cujas chamadas foram interceptadas com `page.route` (auth/token, rest/v1, rpc) usando dados do seed exportados do Postgres local. Log: `scratchpad/e2e/e2e-output.log`; resultados: `scratchpad/e2e/results.json`.

Cenários (desktop 1366 px e mobile 390 px) — todos PASSARAM:
- **Sem configuração**: `/login` mostra aviso “Supabase não configurado” e botão Entrar desabilitado; `/q/xxxx` mostra “Não foi possível consultar · Código XXXX” (sem tela branca, sem `pageerror`); `/` redireciona para `/login`.
- **Supabase configurado mas fora do ar** (conexões abortadas): `/q/K7P2X9QA` exibe erro amigável; login mostra “Falha de conexão com o servidor. Verifique sua internet.”
- **Mockado**: `/q/k7p2x9qa` mostra produto, “A VENCER”, alergênicos e não mostra “Abrir no sistema” para anônimo; senha errada → “E-mail ou senha incorretos.”; login → painel com contadores, PVPS e equipamentos; emissão (busca “filé”, lote, quantidade “1,5”) → preview 60×40 mm preto/branco com QR → `window.print()` chamado com 1 etiqueta em `#print-root` e `@page { size: 60mm 40mm; margin: 0 }` → toast “Etiqueta XXXX emitida.”; payload do insert correto (`validade_horas: 72`, `quantidade: 1.5`, modelo padrão); páginas etiquetas, temperaturas, descartes, produtos, modelos, relatórios, usuários, recebimentos/novo, checklists renderizam sem overflow horizontal da página.
- **Visual**: fundo creme `rgb(243,231,219)`, oliva `#79731B` presente, Inter 13 px base (mín. 9,5 px fora da etiqueta), títulos Cormorant; nenhuma página com `scrollWidth > clientWidth`. Tabelas no mobile rolam dentro do próprio wrapper.

Screenshots principais: `shots/07-dashboard-{desktop,mobile}.png`, `09-emitir-*.png`, `10-preview-*.png`, `12-preview-<modelo>.png`, `05-qr-ok-*.png`, `02-qr-sem-config-*.png`, `03-qr-offline-*.png`, `print-60x40.pdf`.

## 5. Impressão

- `printLabels.ts` injeta `@page { size: Lmm Amm; margin: 0 }` com as dimensões do modelo e fixa `#print-root .label` no mesmo tamanho; `print.css` oculta `#root` e exibe `#print-root` (verificado com `emulateMedia('print')`).
- PDF gerado pelo Chromium a partir do snapshot do momento do `print()`: 1 página de 59,9×39,9 mm (diferença = arredondamento px/pt do Chromium).
- Etiqueta com conteúdo extremo (produto com 4 alergênicos, lote de 38 caracteres) nos 5 modelos (60×40, 60×60, 50×30, 40×40, 100×50): faixa, validade e QR dentro da borda, nenhum filho ultrapassa o retângulo, lote longo truncado com reticências. Uma etiqueta por página (`break-after: page`, última `auto`).

---

## BUGS encontrados

| # | Severidade | Onde | Descrição |
|---|---|---|---|
| 1 | **Alta** (segurança) | `src/lib/api/perfis.ts:30-33`; `supabase/migrations/0001_schema.sql:846-850,866` | O cadastro de usuários usa `auth.signUp` com a chave anon pública, o que exige *signup público habilitado* no Supabase. Qualquer pessoa com a URL/anon key (embutidas no bundle) pode se cadastrar e, passando `unidade_id` em `user_metadata`, o trigger `handle_new_user` a vincula à unidade como cozinheiro — passando a ler/emitir/baixar etiquetas, descartes e temperaturas daquela unidade. **Reprodução:** `insert into auth.users(id,email,raw_user_meta_data) values (gen_random_uuid(),'x@x','{"unidade_id":"11111111-1111-1111-1111-111111111111"}')` → perfil cozinheiro de Camboinhas (T01 confirma que o metadata é aplicado). Sugestão: ignorar `unidade_id` do metadata (admin define depois) e/ou criar usuários via Edge Function com service role / desabilitar signup. |
| 2 | **Alta** (integridade/segurança alimentar) | `supabase/migrations/0002_rls_policies.sql:229-233` | A política `etiquetas_update` permite a qualquer cozinheiro da unidade atualizar **qualquer coluna**. Via API direta ele pode estender a validade (`update etiquetas set data_validade = now()+'365 days'`) ou **reativar** etiqueta consumida/descartada (`status='ativa'`), mesmo após o descarte ter sido registrado em `descartes`. **Reprodução (cozinheiro Camboinhas):** emitir carne moída (24 h) → `update ... set data_validade = now()+interval '365 days'` retorna 1 linha; `update ... set status='consumida'` e depois `status='ativa'` → reativada. Sugestão: restringir update de cozinheiro a colunas/estados permitidos (trigger que bloqueia `data_validade`/`validade_horas`/reativação para não gestores) e forçar baixa só por RPC. |
| 3 | Média | `supabase/migrations/0002_rls_policies.sql:250-258` | `etiqueta_movimentacoes` é descrito como “histórico imutável”, mas a política de INSERT permite a qualquer usuário da unidade inserir movimentações arbitrárias (tipo, status e `detalhes` livres), falsificando o histórico/rastreabilidade. **Reprodução:** como cozinheiro, `insert into etiqueta_movimentacoes(etiqueta_id,tipo,detalhes) values (<id>,'consumo','{"fake":true}')` → sucesso. Sugestão: remover a policy de insert (os triggers/RPCs são `security definer` ou podem passar a ser). |
| 4 | Média | `0002_rls_policies.sql:263-278` + `0001_schema.sql:732,743` | Descartes aceitam `custo_estimado`/`peso_kg` informados pelo cliente sem validação (o trigger só calcula se vierem nulos). Um cozinheiro pode registrar descarte de R$ 999.999,00, distorcendo dashboard e relatório de desperdício. **Reprodução:** `insert into descartes(unidade_id,produto_nome,motivo,quantidade,unidade_medida,custo_estimado) values (<camb>,'x','outro',1,'kg',999999)` → aceito. |
| 5 | Média | `src/pages/etiquetas/EmitirEtiquetaPage.tsx:299-306` + `0003_rpc_views.sql:583-587` | Etiqueta derivada de origem **congelada** para **descongelando** com “Cópias” > 1: a 1ª chamada a `emitir_etiqueta_derivada` marca a origem como consumida e a 2ª falha com “A etiqueta de origem … não está ativa”. Resultado: 1 etiqueta criada, erro exibido, impressão não ocorre. **Reprodução:** detalhe de etiqueta congelada → derivar → cópias = 2 → “Emitir e imprimir”. (Confirmado no SQL: T08 — derivar de origem consumida lança erro.) |
| 6 | Baixa/Média | `src/pages/etiquetas/EmitirEtiquetaPage.tsx:301-304`; `0003_rpc_views.sql:536,563` | Na etiqueta derivada, a data de manipulação escolhida no formulário (que aparece no preview) é ignorada: a RPC usa sempre `now()`. Preview e etiqueta gravada/impressa podem divergir em manipulação e validade. |
| 7 | Média | `src/lib/api/auth.ts:34-43`; `src/pages/LoginPage.tsx:45-58` | Fluxo “Esqueci minha senha” incompleto: envia o e-mail com `redirectTo=/login`, mas nenhuma tela trata o evento `PASSWORD_RECOVERY` nem chama `atualizarSenha` (função nunca usada). O usuário volta logado pelo link de recuperação e cai no painel sem poder definir nova senha. |
| 8 | Média (regra de negócio) | `EmitirEtiquetaPage.tsx:529-543`; `0001_schema.sql:592` | Qualquer usuário (inclusive cozinheiro) pode emitir com validade arbitrária (ex.: 999 dias) para produto cadastrado; nem a UI nem o banco limitam ao padrão do produto/método nem exigem justificativa/gestor. Também não há validação de data de manipulação futura/retroativa. |
| 9 | Baixa | `0001_schema.sql` (funções `calcular_validade`, `validade_padrao_horas`, `is_admin`, `meu_papel`, `gerar_codigo_etiqueta`…) | Funções do 0001 mantêm o `EXECUTE` padrão para `PUBLIC`, logo `anon` pode chamá-las via `/rpc` (confirmado: `set role anon; select public.is_admin(), public.calcular_validade(null,'resfriado',now(),5)` funciona). Não vaza dados hoje (as que leem tabelas falham por falta de SELECT ou são inócuas), mas convém `revoke execute ... from public, anon`. |
| 10 | Baixa | `src/lib/validade.ts:43-52` vs `0003_rpc_views.sql:23-24` | “Vence hoje” usa o fuso do navegador no TS e `America/Sao_Paulo` no SQL; um dispositivo com fuso diferente mostra situações divergentes da view. |
| 11 | Baixa | `0001_schema.sql:91,240` | `gerar_codigo_etiqueta()` é `security invoker` e é chamada como DEFAULT da coluna: a checagem de colisão só enxerga etiquetas visíveis pela RLS do usuário. Em colisão (32⁸ ≈ 10¹², muito improvável) com etiqueta de outra unidade, o insert falha com `23505` em vez de gerar outro código. |
| 12 | Baixa (UX) | `src/pages/publico/ConsultaQrPage.tsx:60-68` | “Abrir no sistema” falha silenciosamente se o usuário logado não tiver acesso à unidade da etiqueta (RLS → `null`) ou em erro: o botão só para de carregar, sem mensagem. |
| 13 | Baixa (docs) | `supabase/README.md` (seção 1) | Diz que `0001` deve ser executado “uma única vez numa base vazia”, mas ele é idempotente (aplicado 2× sem erro). |

## Observações de UX / visual

- Identidade aplicada corretamente: creme `#F3E7DB`, superfícies `#FBF6F0`, filetes oliva nos cards, Inter 13 px, títulos Cormorant, badges terracota/mostarda/oliva discretos. Layout denso e elegante no desktop.
- Mobile (390 px): sem overflow horizontal da página; menu hambúrguer presente. Porém na tabela “A vencer · PVPS” do painel a coluna **Situação** (a mais importante) fica fora da área visível e o nome do produto quebra em muitas linhas — considerar layout em cartões ou esconder a coluna Método no mobile (`shots/07-dashboard-mobile.png`).
- Emitir etiqueta no mobile: preview e botão “Emitir e imprimir” ficam no fim de uma página longa (~2000 px); sugerido botão fixo no rodapé. O título do header é truncado (“Emitir e…”).
- O campo `datetime-local` de Manipulação, em navegadores em inglês, mostra `MM/DD/YYYY hh:mm` e corta o AM/PM no desktop (coluna estreita) — risco de leitura errada da hora.
- Select “Modelo” trunca o rótulo (“Padrão 60×40 (60×4…”) no desktop.
- Etiqueta 60×60 “Completa” fica com ~40 % de área vazia quando os campos opcionais estão vazios; 50×30 e 40×40 ficam legíveis (fonte 6 pt) com QR de 16–16,5 mm.
- O toast de sucesso da emissão só aparece depois que o diálogo de impressão fecha (ou após 1,5 s de fallback).
- A página pública `/q/:codigo` é clara e bem hierarquizada (status em destaque, alergênicos destacados) e degrada graciosamente sem backend.
