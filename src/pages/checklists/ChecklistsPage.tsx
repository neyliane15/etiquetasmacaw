import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  FormRow,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
  Table,
  Textarea,
  useToast,
} from '@/components/ui';
import type { Column } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useUnidade } from '@/contexts/UnidadeContext';
import { deleteChecklist, getChecklist, getRespostas, listChecklists, listExecucoes, salvarChecklist } from '@/lib/api';
import { formatarDataHora } from '@/lib/format';
import { FREQUENCIA_ROTULO } from '@/types/database';
import type { Checklist, ChecklistExecucao, ChecklistResposta, FrequenciaChecklist, Unidade } from '@/types/database';
import '@/pages/etiquetas/etiquetas.css';
import '@/pages/checklists/checklists.css';

interface ItemEd {
  key: string;
  id?: string;
  texto: string;
  obrigatorio: boolean;
}

let seq = 1;

function ChecklistEditor(p: {
  checklistId: string | null;
  unidades: Unidade[];
  isAdmin: boolean;
  unidadePadrao: string | null;
  onSaved(): void;
  onCancel(): void;
}) {
  const toast = useToast();
  const [carregando, setCarregando] = useState(!!p.checklistId);
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [frequencia, setFrequencia] = useState<FrequenciaChecklist>('diario');
  const [unidadeId, setUnidadeId] = useState<string>(p.isAdmin ? '' : (p.unidadePadrao ?? ''));
  const [ativo, setAtivo] = useState(true);
  const [itens, setItens] = useState<ItemEd[]>([{ key: `n${seq++}`, texto: '', obrigatorio: true }]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!p.checklistId) return;
    getChecklist(p.checklistId)
      .then((c) => {
        setNome(c.nome);
        setDescricao(c.descricao ?? '');
        setFrequencia(c.frequencia);
        setUnidadeId(c.unidade_id ?? '');
        setAtivo(c.ativo);
        setItens(
          [...c.itens]
            .sort((a, b) => a.ordem - b.ordem)
            .map((i) => ({ key: i.id, id: i.id, texto: i.texto, obrigatorio: i.obrigatorio })),
        );
      })
      .catch((err) => toast.error(err))
      .finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.checklistId]);

  function mover(i: number, d: -1 | 1) {
    setItens((l) => {
      const j = i + d;
      if (j < 0 || j >= l.length) return l;
      const c = [...l];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
  }

  async function salvar(e: { preventDefault(): void }) {
    e.preventDefault();
    const validos = itens.filter((i) => i.texto.trim());
    if (!nome.trim()) return toast.error('Informe o nome.');
    if (!validos.length) return toast.error('Inclua ao menos um item.');
    if (!p.isAdmin && !unidadeId) return toast.error('Escolha a unidade.');
    setSalvando(true);
    try {
      await salvarChecklist({
        id: p.checklistId ?? undefined,
        nome: nome.trim(),
        descricao: descricao.trim() || null,
        frequencia,
        unidade_id: unidadeId || null,
        ativo,
        itens: validos.map((i, ordem) => ({ id: i.id, ordem, texto: i.texto.trim(), obrigatorio: i.obrigatorio })),
      });
      toast.success('Checklist salvo.');
      p.onSaved();
    } catch (err) {
      toast.error(err);
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) return <Spinner />;

  return (
    <form className="stack" onSubmit={salvar}>
      <FormRow cols={2}>
        <Input label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
        <Select
          label="Frequência"
          value={frequencia}
          onChange={(e) => setFrequencia(e.target.value as FrequenciaChecklist)}
          options={Object.entries(FREQUENCIA_ROTULO).map(([value, label]) => ({ value, label }))}
        />
      </FormRow>
      <FormRow cols={2}>
        <Select
          label="Unidade"
          value={unidadeId}
          onChange={(e) => setUnidadeId(e.target.value)}
          options={[
            { value: '', label: 'Todas as unidades', disabled: !p.isAdmin },
            ...p.unidades.map((u) => ({ value: u.id, label: u.nome })),
          ]}
        />
        <div style={{ alignSelf: 'flex-end', paddingBottom: 6 }}>
          <Checkbox label="Ativo" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
        </div>
      </FormRow>
      <Textarea label="Descrição" rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} />

      <div>
        <h4 className="fb-section-title">Itens</h4>
        <ol className="chk-ed">
          {itens.map((it, i) => (
            <li key={it.key}>
              <span className="chk-ed__n">{i + 1}</span>
              <div className="chk-ed__txt">
                <Input
                  aria-label={`Item ${i + 1}`}
                  value={it.texto}
                  placeholder="Ex.: Bancadas higienizadas com solução clorada"
                  onChange={(e) => setItens((l) => l.map((x) => (x.key === it.key ? { ...x, texto: e.target.value } : x)))}
                />
              </div>
              <Checkbox
                label="Obrig."
                checked={it.obrigatorio}
                onChange={(e) =>
                  setItens((l) => l.map((x) => (x.key === it.key ? { ...x, obrigatorio: e.target.checked } : x)))
                }
              />
              <Button size="sm" variant="ghost" aria-label="Subir" disabled={i === 0} onClick={() => mover(i, -1)}>
                ↑
              </Button>
              <Button size="sm" variant="ghost" aria-label="Descer" disabled={i === itens.length - 1} onClick={() => mover(i, 1)}>
                ↓
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label="Remover item"
                disabled={itens.length === 1}
                onClick={() => setItens((l) => l.filter((x) => x.key !== it.key))}
              >
                ×
              </Button>
            </li>
          ))}
        </ol>
        <Button
          size="sm"
          style={{ marginTop: 'var(--sp-3)' }}
          onClick={() => setItens((l) => [...l, { key: `n${seq++}`, texto: '', obrigatorio: true }])}
        >
          + Item
        </Button>
      </div>

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={p.onCancel}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" loading={salvando}>
          Salvar checklist
        </Button>
      </div>
    </form>
  );
}

export default function ChecklistsPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { temPapel } = useAuth();
  const podeEditar = temPapel('admin', 'gerente');
  const isAdmin = temPapel('admin');
  const { unidadeId, unidades } = useUnidade();

  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [execucoes, setExecucoes] = useState<ChecklistExecucao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [editando, setEditando] = useState<string | 'novo' | null>(null);
  const [excluir, setExcluir] = useState<Checklist | null>(null);
  const [verExec, setVerExec] = useState<ChecklistExecucao | null>(null);
  const [respostas, setRespostas] = useState<ChecklistResposta[] | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [cs, ex] = await Promise.all([listChecklists(unidadeId), listExecucoes({ unidadeId, limit: 30 })]);
      setChecklists(cs);
      setExecucoes(ex);
    } catch (err) {
      toast.error(err);
    } finally {
      setCarregando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidadeId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    if (!verExec) {
      setRespostas(null);
      return;
    }
    getRespostas(verExec.id)
      .then(setRespostas)
      .catch((err) => toast.error(err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verExec]);

  async function confirmarExclusao() {
    if (!excluir) return;
    try {
      await deleteChecklist(excluir.id);
      toast.success('Checklist excluído.');
      setExcluir(null);
      void carregar();
    } catch (err) {
      toast.error(err);
    }
  }

  const ultimaExec = (id: string) => execucoes.find((e) => e.checklist_id === id);

  const colunasExec: Column<ChecklistExecucao>[] = [
    { key: 'executado_em', header: 'Data', render: (e) => formatarDataHora(e.executado_em) },
    { key: 'checklist', header: 'Checklist', render: (e) => e.checklist?.nome ?? '—' },
    {
      key: 'resultado',
      header: 'Resultado',
      render: (e) => {
        const ok = e.total_itens > 0 && e.itens_conformes === e.total_itens;
        return (
          <Badge variant={ok ? 'success' : 'warning'}>
            {e.itens_conformes}/{e.total_itens} conformes
          </Badge>
        );
      },
    },
    { key: 'responsavel', header: 'Responsável', render: (e) => e.responsavel?.nome ?? '—' },
    { key: 'observacoes', header: 'Observações', render: (e) => e.observacoes ?? '—' },
  ];

  return (
    <div className="fb-page">
      <PageHeader
        title="Checklists"
        subtitle="Rotinas de abertura, fechamento e boas práticas (RDC 216)."
        actions={
          podeEditar && (
            <Button variant="primary" onClick={() => setEditando('novo')}>
              Novo checklist
            </Button>
          )
        }
      />

      {carregando ? (
        <Spinner />
      ) : checklists.length === 0 ? (
        <EmptyState title="Nenhum checklist" description={podeEditar ? 'Crie o primeiro checklist.' : undefined} />
      ) : (
        <div className="chk-grid">
          {checklists.map((c) => {
            const u = ultimaExec(c.id);
            return (
              <Card
                key={c.id}
                title={
                  <span className="row" style={{ gap: 'var(--sp-2)' }}>
                    {c.nome}
                    {!c.ativo && <Badge variant="neutral">Inativo</Badge>}
                  </span>
                }
                padding="sm"
              >
                <div className="stack" style={{ gap: 'var(--sp-3)' }}>
                  <div className="row" style={{ gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
                    <Badge variant="olive">{FREQUENCIA_ROTULO[c.frequencia]}</Badge>
                    <span className="fb-sub" style={{ display: 'inline' }}>
                      {c.unidade_id ? (unidades.find((x) => x.id === c.unidade_id)?.nome ?? 'Unidade') : 'Todas as unidades'}
                    </span>
                  </div>
                  {c.descricao && <p className="muted" style={{ margin: 0, fontSize: 'var(--fs-sm)' }}>{c.descricao}</p>}
                  <span className="fb-sub">
                    {u ? `Última execução: ${formatarDataHora(u.executado_em)} (${u.itens_conformes}/${u.total_itens})` : 'Ainda não executado'}
                  </span>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <div className="row" style={{ gap: 'var(--sp-2)' }}>
                      {podeEditar && (
                        <Button size="sm" variant="ghost" onClick={() => setEditando(c.id)}>
                          Editar
                        </Button>
                      )}
                      {isAdmin && (
                        <Button size="sm" variant="ghost" onClick={() => setExcluir(c)}>
                          Excluir
                        </Button>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={!c.ativo}
                      onClick={() => navigate(`/checklists/${c.id}/executar`)}
                    >
                      Executar
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <div>
        <h3 className="fb-section-title">Execuções recentes</h3>
        <Table
          columns={colunasExec}
          rows={execucoes}
          rowKey={(e) => e.id}
          compact
          onRowClick={(e) => setVerExec(e)}
          empty="Nenhuma execução registrada."
        />
      </div>

      <Modal
        open={editando !== null}
        onClose={() => setEditando(null)}
        title={editando === 'novo' ? 'Novo checklist' : 'Editar checklist'}
        size="lg"
      >
        {editando !== null && (
          <ChecklistEditor
            key={editando}
            checklistId={editando === 'novo' ? null : editando}
            unidades={unidades}
            isAdmin={isAdmin}
            unidadePadrao={unidadeId}
            onCancel={() => setEditando(null)}
            onSaved={() => {
              setEditando(null);
              void carregar();
            }}
          />
        )}
      </Modal>

      <Modal
        open={!!verExec}
        onClose={() => setVerExec(null)}
        title={verExec ? `${verExec.checklist?.nome ?? 'Checklist'} · ${formatarDataHora(verExec.executado_em)}` : ''}
      >
        {!respostas ? (
          <Spinner />
        ) : (
          <div className="stack">
            <ul className="chk-resp">
              {respostas.map((r) => (
                <li key={r.id} className={r.conforme ? '' : 'chk-resp--nc'}>
                  <Badge variant={r.conforme ? 'success' : 'danger'}>{r.conforme ? 'Sim' : 'Não'}</Badge>
                  <div>
                    {r.item_texto}
                    {r.observacao && <span className="fb-sub">{r.observacao}</span>}
                  </div>
                </li>
              ))}
            </ul>
            {verExec?.observacoes && (
              <p style={{ margin: 0 }}>
                <span className="caps muted">Observações · </span>
                {verExec.observacoes}
              </p>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!excluir}
        title="Excluir checklist"
        message={
          <>
            Excluir <strong>{excluir?.nome}</strong> e todas as suas execuções? Para manter o histórico, apenas desative-o.
          </>
        }
        confirmLabel="Excluir"
        variant="danger"
        onConfirm={confirmarExclusao}
        onCancel={() => setExcluir(null)}
      />
    </div>
  );
}
