import { supabase, unwrap } from '@/lib/supabase';
import type {
  Checklist,
  ChecklistComItens,
  ChecklistExecucao,
  ChecklistItem,
  ChecklistResposta,
  ISODate,
  Insert,
  NovaExecucaoChecklistInput,
  UUID,
} from '@/types/database';
import { fimExclusivoISO, inicioDoDiaISO, num } from './_shared';

const SELECT_EXEC = '*, checklist:checklists(id,nome), responsavel:perfis!responsavel_id(id,nome)';

function normExec(x: ChecklistExecucao): ChecklistExecucao {
  return { ...x, total_itens: num(x.total_itens), itens_conformes: num(x.itens_conformes) };
}

/** Checklists globais + da unidade. Por padrão só os ativos. */
export async function listChecklists(
  unidadeId: UUID | null,
  opts?: { incluirInativos?: boolean },
): Promise<Checklist[]> {
  let q = supabase.from('checklists').select('*').order('nome');
  if (unidadeId) q = q.or(`unidade_id.is.null,unidade_id.eq.${unidadeId}`);
  if (!opts?.incluirInativos) q = q.eq('ativo', true);
  const res = await q;
  return (unwrap(res) ?? []) as Checklist[];
}

export async function getChecklist(id: UUID): Promise<ChecklistComItens> {
  const res = await supabase.from('checklists').select('*, itens:checklist_itens(*)').eq('id', id).single();
  const c = unwrap(res) as ChecklistComItens;
  const itens = [...(c.itens ?? [])].sort((a, b) => a.ordem - b.ordem || a.created_at.localeCompare(b.created_at));
  return { ...c, itens };
}

/** Cria ou atualiza o checklist e sincroniza seus itens (remove os que saíram da lista). */
export async function salvarChecklist(
  input: Insert<Checklist> & {
    id?: UUID;
    itens: { id?: UUID; ordem: number; texto: string; obrigatorio: boolean }[];
  },
): Promise<ChecklistComItens> {
  const { id, itens, ...cabecalho } = input;

  let checklistId: UUID;
  if (id) {
    const res = await supabase.from('checklists').update(cabecalho).eq('id', id).select('id').single();
    checklistId = (unwrap(res) as { id: UUID }).id;
  } else {
    const res = await supabase.from('checklists').insert(cabecalho).select('id').single();
    checklistId = (unwrap(res) as { id: UUID }).id;
  }

  if (id) {
    const atuais = unwrap(await supabase.from('checklist_itens').select('id').eq('checklist_id', checklistId)) as
      | Pick<ChecklistItem, 'id'>[]
      | null;
    const manter = new Set(itens.map((i) => i.id).filter((v): v is UUID => Boolean(v)));
    const remover = (atuais ?? []).map((i) => i.id).filter((iid) => !manter.has(iid));
    if (remover.length) unwrap(await supabase.from('checklist_itens').delete().in('id', remover));
  }

  const existentes = itens.filter((i) => i.id);
  for (const item of existentes) {
    unwrap(
      await supabase
        .from('checklist_itens')
        .update({ ordem: item.ordem, texto: item.texto.trim(), obrigatorio: item.obrigatorio })
        .eq('id', item.id as UUID),
    );
  }

  const novos = itens
    .filter((i) => !i.id)
    .map((i) => ({ checklist_id: checklistId, ordem: i.ordem, texto: i.texto.trim(), obrigatorio: i.obrigatorio }));
  if (novos.length) unwrap(await supabase.from('checklist_itens').insert(novos));

  return getChecklist(checklistId);
}

export async function deleteChecklist(id: UUID): Promise<void> {
  const res = await supabase.from('checklists').delete().eq('id', id);
  unwrap(res);
}

/** Insere a execução e as respostas; totais são calculados pelo trigger do banco. */
export async function registrarExecucao(input: NovaExecucaoChecklistInput): Promise<ChecklistExecucao> {
  const resExec = await supabase
    .from('checklist_execucoes')
    .insert({
      checklist_id: input.checklist_id,
      unidade_id: input.unidade_id,
      observacoes: input.observacoes?.trim() || null,
    })
    .select('id')
    .single();
  const execId = (unwrap(resExec) as { id: UUID }).id;

  if (input.respostas.length) {
    const rows = input.respostas.map((r) => ({
      execucao_id: execId,
      item_id: r.item_id,
      item_texto: r.item_texto,
      conforme: r.conforme,
      observacao: r.observacao?.trim() || null,
    }));
    unwrap(await supabase.from('checklist_respostas').insert(rows));
  }

  const res = await supabase.from('checklist_execucoes').select(SELECT_EXEC).eq('id', execId).single();
  return normExec(unwrap(res) as ChecklistExecucao);
}

export async function listExecucoes(f: {
  unidadeId: UUID | null;
  checklistId?: UUID;
  de?: ISODate;
  ate?: ISODate;
  limit?: number;
}): Promise<ChecklistExecucao[]> {
  let q = supabase.from('checklist_execucoes').select(SELECT_EXEC);
  if (f.unidadeId) q = q.eq('unidade_id', f.unidadeId);
  if (f.checklistId) q = q.eq('checklist_id', f.checklistId);
  if (f.de) q = q.gte('executado_em', inicioDoDiaISO(f.de));
  if (f.ate) q = q.lt('executado_em', fimExclusivoISO(f.ate));
  const res = await q.order('executado_em', { ascending: false }).limit(f.limit ?? 50);
  return ((unwrap(res) ?? []) as ChecklistExecucao[]).map(normExec);
}

export async function getRespostas(execucaoId: UUID): Promise<ChecklistResposta[]> {
  const res = await supabase.from('checklist_respostas').select('*').eq('execucao_id', execucaoId);
  return (unwrap(res) ?? []) as ChecklistResposta[];
}
