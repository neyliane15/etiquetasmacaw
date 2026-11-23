# Revisão — Etiquetas Macaw

Data: 2026-11-23 · Agente Revisor · Entradas: `docs/RELATORIO_TESTES.md` (Testador), `docs/PLANO.md` (contrato).
Nada foi commitado.

## Resumo

- Os **13 bugs** do relatório foram **reproduzidos e confirmados**. O nº 9 só em parte: `anon` executava os helpers, mas `gerar_codigo_etiqueta` falhava por falta de SELECT. Todos foram **corrigidos**.
- Encontrei **7 problemas novos** (N1–N7 abaixo), também corrigidos.
- As correções de banco estão numa migração nova, `supabase/migrations/0004_correcoes_revisao.sql`. Ela é idempotente e pode ser aplicada em uma base que já tem 0001–0003.
- Resultado final: SQL 2× + smoke (T01–T22) PASSOU · `tsc` PASSOU · `vite build` PASSOU · vitest **97/97** PASSOU · E2E **92/92** PASSOU.

## 1. Revisão crítica dos testes do Testador

| Teste | Avaliação |
|---|---|
| T01 | **Validava o bug.** O teste exigia que o `unidade_id` do metadata do signUp fosse aplicado, o que é justamente a falha de segurança do bug #1. Foi reescrito: o metadata é ignorado, o usuário nasce inativo e o admin o libera com `admin_definir_perfil`. |
| T07 (“update direto de status (via app) → status_em + movimentação”) | **Validava o bug #2.** O teste tratava como correto que o cliente mudasse o status direto na tabela. Agora o teste exige que essa alteração seja **bloqueada**. O vencimento é testado pela RPC `marcar_etiquetas_vencidas`. |
| T06a | Cobertura parcial: verificava só 9 tabelas/views para `anon` e não olhava a permissão de EXECUTE nas funções. O T14 agora percorre **todas** as tabelas e views de `public` e todas as funções. |
| T03/T12 | Corretos, mas não havia nenhum teste com **gerente**, nem matriz de RLS por tabela. O T21 acrescenta o gerente e uma varredura genérica de toda tabela com `unidade_id`. |
| T08 | Correto, mas não cobria cópias > 1, a data de manipulação informada, nem o acesso via RPC `security definer` (T19). |
| `validade.test.ts` (`vence_hoje`) | **Dependia do fuso da máquina.** Usava `new Date(2026,5,15,…)` local e passava em UTC por acaso. Agora usa instantes UTC explícitos e verifica o fuso `America/Sao_Paulo` (bug #10). Também roda com `TZ=Asia/Tokyo`. |
| E2E | Pode ser reaproveitado. Fiz uma cópia, `scratchpad/e2e/run-revisao.cjs`, com 3 checagens novas: coluna Situação visível no mobile/desktop e botão de emissão fixo no mobile. A cópia também passa a usar `.first()`, porque no mobile agora existem dois botões “Emitir e imprimir”. |
| Lacunas apontadas no pedido | RLS em todas as tabelas, `anon`, escalonamento de papel, etiqueta de outra unidade via RPC `security definer` e consulta pública: agora cobertas por T14, T15, T19 e T21. A consulta pública foi revisada: expõe só os campos mínimos e o código tem 32⁸ combinações, então enumerar é inviável. Sem alteração. |

## 2. Veredito por item do relatório

| # | Veredito | Correção |
|---|---|---|
| 1 signUp anon + `unidade_id` do metadata | **Confirmado → corrigido** | O `handle_new_user` (0004) ignora papel e unidade vindos do metadata. O 1º usuário vira admin ativo; os demais nascem `cozinheiro`, **inativos e sem unidade**. Nova RPC `admin_definir_perfil(user, papel, unidade, ativo, nome)`, só para admin: não deixa o admin se rebaixar e exige unidade para gerente/cozinheiro. A leitura de dados globais (unidades, categorias, fornecedores, catálogo global, checklists) passa a exigir perfil ativo (`tem_perfil_ativo()`). A criação de usuários vai para a Edge Function `supabase/functions/admin-criar-usuario`: verifica se quem chama é admin, usa a service role no servidor e, sem senha, envia convite. `criarUsuario` chama essa função e não usa mais `signUp` nem um client anon. A tela Usuários ganhou o status “Aguardando liberação” e senha opcional (vazia = convite). Se a função não estiver publicada, a tela orienta convidar pelo painel do Supabase. |
| 2 cozinheiro altera qualquer coluna | **Confirmado → corrigido** | Novo trigger `trg_etiquetas_0_guarda`, sem `security definer`, que olha `current_user`. Em UPDATE direto do cliente, só `observacoes` e `modelo_id` podem mudar. Status, validade, método e snapshots mudam apenas pelas RPCs, que passaram a ser `security definer` e checam `tem_acesso_unidade`. Em INSERT: status `ativa`, `impressoes=0`, `created_by` e responsável = usuário logado (gestor pode indicar alguém da unidade), `responsavel_nome` recalculado, sem `etiqueta_origem_id`, e produto/modelo/item de recebimento da mesma unidade. |
| 3 movimentações forjadas | **Confirmado → corrigido** | A política de INSERT foi removida e foi feito REVOKE de insert/update/delete para `authenticated`/`anon`. Só os triggers e RPCs (`security definer`) gravam movimentações. |
| 4 custo/peso de descarte do cliente | **Confirmado → corrigido** | Trigger `trg_descartes_0_guarda`. Para não gestor, o custo do cliente é ignorado e calculado pelo produto. O peso de kg/g/l/ml é sempre derivado da quantidade. Limites para cozinheiro: 500 kg, 1000 un, até 7 dias retroativo. Data no futuro é bloqueada. A etiqueta vinculada precisa ser da mesma unidade e o responsável é sempre o usuário. `dar_baixa_etiqueta` não aceita quantidade maior que a da etiqueta. Gerente/admin podem informar custo manual. |
| 5 derivada com várias cópias | **Confirmado → corrigido** | `emitir_etiqueta_derivada(…, p_copias, p_data_manipulacao)` agora retorna `setof`: cria N cópias e só depois baixa a origem congelada. O front faz **uma** chamada. |
| 6 manipulação da derivada ignorada | **Confirmado → corrigido** | A RPC usa `p_data_manipulacao`, que não pode ser anterior à manipulação da origem nem estar no futuro. O preview aplica o mesmo limite de validade da origem que a RPC. |
| 7 redefinir senha | **Confirmado → corrigido** | Nova rota pública `/redefinir-senha` (`RedefinirSenhaPage`), que chama `atualizarSenha` e exige confirmação e mínimo de 8 caracteres. O `redirectTo` do reset e dos convites aponta para ela. `RecuperacaoSenha` (App) redireciona links antigos com `type=recovery`/`invite` e o evento `PASSWORD_RECOVERY`. |
| 8 validade/manipulação arbitrárias | **Confirmado → corrigido** | `validar_prazo_etiqueta()` vale para a emissão direta e para a derivada: manipulação no máximo 1 h no futuro, cozinheiro até 7 dias retroativo, máximo de 365 dias e cozinheiro ≤ padrão do produto/método. A UI espelha a regra (`validarPrazoEmissao`) e mostra o motivo. |
| 9 EXECUTE para PUBLIC/anon | **Confirmado (parcial) → corrigido** | `revoke execute on all functions … from public, anon`; ficam com `authenticated` e, para `anon`, só `consultar_etiqueta_publica`. Os default privileges também foram ajustados. |
| 10 fuso “vence hoje” | **Confirmado → corrigido** | `situacaoValidade` compara o dia civil em `America/Sao_Paulo` (`Intl.DateTimeFormat`), igual ao SQL. |
| 11 colisão de código entre unidades | **Confirmado (por análise) → corrigido** | `gerar_codigo_etiqueta` passou a ser `security definer` (vê todas as unidades). |
| 12 “Abrir no sistema” silencioso | **Confirmado → corrigido** | Mostra “Você não tem acesso à unidade desta etiqueta.” ou a mensagem do erro. |
| 13 README sobre o 0001 | **Confirmado → corrigido** | README revisado: ordem 0001→0004, todos os arquivos idempotentes, aplicar só o 0004 em bases existentes, criação de usuários (Edge Function ou convite + liberação), signup público desativado e Redirect URL `/redefinir-senha`. |
| UX mobile: Situação fora da tela | **Confirmado → corrigido** | Coluna Método oculta ≤ 720 px (o método aparece sob o produto) e Situação com `nowrap`. Classes utilitárias `hide-mobile`/`show-mobile` em `ui.css`. |
| UX mobile: botão Emitir no fim da página | **Confirmado → corrigido** | Barra fixa `.fb-emitir-fixo` (≤ 1100 px) com a validade ou o primeiro erro e o botão “Emitir e imprimir”. |

## 3. Achados novos (todos corrigidos no 0004)

| # | Sev. | Achado |
|---|---|---|
| N1 | Alta | **Gerente de uma unidade alterava ou apagava itens de checklists globais e de outras unidades.** A política de `checklist_itens` só checava `is_gestor()`; na reprodução, apagou os 9 itens do checklist global. Correção: `pode_gerir_checklist()` (global → só admin). |
| N2 | Média | **Gestor marcava um registro de temperatura como `conforme=true` sem mudar a temperatura.** O trigger só disparava `update of temperatura_c, equipamento_id`. Agora dispara em qualquer update. Responsável forçado para o usuário logado, horário não pode estar no futuro e o cozinheiro não registra com mais de 24 h de atraso. |
| N3 | Média | **Emissão com responsável, `created_by`, `responsavel_nome` e `impressoes` forjados** (ex.: “Chef Falso”, status `consumida` já na emissão). Coberto pela guarda do bug #2. |
| N4 | Média | **Descarte com `responsavel_id` de outro usuário e `etiqueta_id` de outra unidade.** O trigger `security definer` copiava o nome do produto da etiqueta da outra unidade. Corrigido pela guarda dos descartes. |
| N5 | Média | **Com a correção do bug #2, as RPCs precisavam virar `security definer`.** Ao fazer isso, faltava checar a unidade. Agora checam: `dar_baixa`, `registrar_reimpressao` e `emitir_etiqueta_derivada` respondem “não encontrada” para outra unidade, e `registrar_impressao` filtra por unidade e aceita no máximo 200 IDs (T19). |
| N6 | Baixa | **Usuário autenticado sem perfil ativo lia unidades, fornecedores (CNPJ/contato) e catálogo.** As políticas eram `using (true)`. Agora exigem perfil ativo. |
| N7 | Baixa | **Testes que validavam os bugs ou dependiam do fuso da máquina** (ver §1). |

## 4. Testes de regressão adicionados

- **`supabase/tests/smoke.sql`** — T01/T01b reescritos, T07 ajustado e T14–T22 novos:
  - RLS em todas as tabelas; `anon` sem acesso a tabelas, views e funções.
  - Usuário de signup sem acesso.
  - Gerente sem acesso à RPC de admin.
  - Guarda de etiquetas (10 tentativas de UPDATE e 2 de INSERT indevidos).
  - Movimentações imutáveis.
  - Descartes.
  - Derivada com 3 cópias e data informada.
  - RPCs bloqueadas para outra unidade.
  - Limites de validade e manipulação (cozinheiro e gerente).
  - Gerente e checklists/produtos/perfis, mais a matriz de RLS Búzios × Camboinhas.
  - Temperatura.
- Rodando o smoke atual contra uma base **sem** o 0004, ele falha logo no T01 (bug #1), como deveria.
- **Vitest:**
  - `src/lib/__tests__/validade.test.ts`: fuso SP e `validarPrazoEmissao`.
  - `src/lib/api/__tests__/revisao.test.ts`: `criarUsuario` usa a Edge Function e nunca `signUp`; `adminDefinirPerfil`; `emitirEtiquetaDerivada` em uma única RPC; helpers de recuperação de senha.
  - `src/pages/__tests__/RedefinirSenhaPage.test.tsx`.
- **E2E:** `scratchpad/e2e/run-revisao.cjs` (screenshots em `scratchpad/e2e/shots-revisao/`).

## 5. Resultado final

| Etapa | Resultado |
|---|---|
| `auth_stub` → 0001 → 0002 → 0003 → 0004 → seed, **2×** (Postgres 16, `ON_ERROR_STOP`) | PASSOU. Contagens do seed inalteradas: 2 unidades, 60 produtos, 5 modelos, 10 equipamentos, 16 itens de checklist. |
| Base existente (0001–0003 + seed) + **só o 0004** | PASSOU. O smoke completo também passa nessa base. |
| `smoke.sql` | PASSOU (27 blocos OK, T01–T22) |
| `npx tsc --noEmit` | PASSOU |
| `npx vite build` | PASSOU (bundle principal 482 kB / 142 kB gzip) |
| `npx vitest run` | PASSOU — 7 arquivos, 97 testes (também com `TZ=America/Sao_Paulo` e `TZ=Asia/Tokyo`) |
| E2E Playwright (`run-revisao.cjs`, desktop 1366 + mobile 390) | PASSOU — 92/92 |

## 6. Pendências / decisões para o time

1. **Publicar a Edge Function** (`supabase functions deploy admin-criar-usuario`) e **desativar “Allow new users to sign up”**. Ela não foi executada aqui: não há runtime Deno nem Supabase real. Só os testes de unidade do front cobrem o contrato.
2. **Revisar usuários existentes.** Quem se cadastrou pelo fluxo antigo (antes do 0004) manteve perfil e unidade. Confira a lista em Gestão → Usuários.
3. **Limites de negócio que defini e precisam de validação do RT:**
   - manipulação retroativa de 7 dias (cozinheiro);
   - validade máxima de 365 dias;
   - descarte de até 500 kg / 1000 un e 7 dias retroativo (cozinheiro);
   - registro de temperatura com até 24 h de atraso (cozinheiro).

   Produto **avulso** (sem cadastro) não tem padrão: o cozinheiro pode definir até 365 dias. Avaliar se deve ser exigido um gestor.
4. **Correções de etiqueta (ex.: lote ou validade digitados errado)** agora exigem descartar e reemitir, ou usar o SQL editor. Se o fluxo for necessário, criar uma RPC `corrigir_etiqueta` para gestor, com justificativa registrada em movimentação.
5. **Observações de UX não tratadas:**
   - o título do header ainda é truncado no mobile;
   - o `datetime-local` aparece no formato do idioma do navegador;
   - o rótulo do select de Modelo é truncado;
   - o modelo 60×60 fica com área vazia;
   - o toast só aparece depois do diálogo de impressão.
6. **RLS dos domínios secundários** (`recebimento_itens`, `checklist_respostas`) aceita IDs de item/checklist que não pertencem ao cabeçalho. É inócuo para isolamento entre unidades (o cabeçalho é verificado), mas pode gerar dados inconsistentes. Deixado como está.
