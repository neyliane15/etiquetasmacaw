import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Checkbox, ConfirmDialog, EmptyState, FormRow, Input, Modal, PageHeader, Select, Table, useToast } from '@/components/ui';
import type { Column } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useUnidade } from '@/contexts/UnidadeContext';
import { createEquipamento, deleteEquipamento, listEquipamentos, updateEquipamento } from '@/lib/api';
import { formatarTemperatura } from '@/lib/format';
import { TIPO_EQUIPAMENTO_ROTULO } from '@/types/database';
import type { Equipamento, Insert, TipoEquipamento, Unidade } from '@/types/database';
import '@/pages/etiquetas/etiquetas.css';

/** Faixas de referência por tipo (RDC 216 / CVS-5). */
const FAIXA_PADRAO: Record<TipoEquipamento, { min: number | null; max: number | null }> = {
  geladeira: { min: 0, max: 5 },
  freezer: { min: null, max: -18 },
  camara_fria: { min: 0, max: 4 },
  camara_congelada: { min: null, max: -18 },
  balcao_refrigerado: { min: 0, max: 5 },
  balcao_termico: { min: 60, max: null },
  ultracongelador: { min: null, max: -18 },
  pass_through: { min: 0, max: 5 },
  outro: { min: null, max: null },
};

function num(s: string): number | null {
  if (!s.trim()) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function EquipamentoForm(p: {
  equipamento: Equipamento | null;
  unidadeId: string;
  unidades: Unidade[];
  onSaved(): void;
  onCancel(): void;
}) {
  const toast = useToast();
  const e = p.equipamento;
  const [nome, setNome] = useState(e?.nome ?? '');
  const [tipo, setTipo] = useState<TipoEquipamento>(e?.tipo ?? 'geladeira');
  const [min, setMin] = useState(e ? (e.temp_min_c != null ? String(e.temp_min_c) : '') : '0');
  const [max, setMax] = useState(e ? (e.temp_max_c != null ? String(e.temp_max_c) : '') : '5');
  const [localizacao, setLocalizacao] = useState(e?.localizacao ?? '');
  const [unidadeId, setUnidadeId] = useState(e?.unidade_id ?? p.unidadeId);
  const [ativo, setAtivo] = useState(e?.ativo ?? true);
  const [salvando, setSalvando] = useState(false);

  function trocarTipo(t: TipoEquipamento) {
    setTipo(t);
    const f = FAIXA_PADRAO[t];
    setMin(f.min != null ? String(f.min) : '');
    setMax(f.max != null ? String(f.max) : '');
  }

  async function salvar(ev: { preventDefault(): void }) {
    ev.preventDefault();
    const mi = num(min);
    const ma = num(max);
    if (!nome.trim()) return toast.error('Informe o nome.');
    if (!unidadeId) return toast.error('Escolha a unidade.');
    if (mi != null && ma != null && mi > ma) return toast.error('A mínima não pode ser maior que a máxima.');
    const dados: Insert<Equipamento> = {
      nome: nome.trim(),
      tipo,
      temp_min_c: mi,
      temp_max_c: ma,
      localizacao: localizacao.trim() || null,
      unidade_id: unidadeId,
      ativo,
    };
    setSalvando(true);
    try {
      if (e) await updateEquipamento(e.id, dados);
      else await createEquipamento(dados);
      toast.success('Equipamento salvo.');
      p.onSaved();
    } catch (err) {
      toast.error(err);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form className="stack" onSubmit={salvar}>
      <Input label="Nome" value={nome} onChange={(ev) => setNome(ev.target.value)} placeholder="Ex.: Freezer 1 — Cozinha quente" required />
      <FormRow cols={2}>
        <Select
          label="Tipo"
          value={tipo}
          onChange={(ev) => trocarTipo(ev.target.value as TipoEquipamento)}
          options={Object.entries(TIPO_EQUIPAMENTO_ROTULO).map(([value, label]) => ({ value, label }))}
        />
        <Select
          label="Unidade"
          value={unidadeId}
          onChange={(ev) => setUnidadeId(ev.target.value)}
          placeholder="—"
          options={p.unidades.map((u) => ({ value: u.id, label: u.nome }))}
        />
      </FormRow>
      <FormRow cols={2}>
        <Input label="Temp. mínima" inputMode="decimal" suffix="°C" value={min} onChange={(ev) => setMin(ev.target.value)} hint="Vazio = sem limite" />
        <Input label="Temp. máxima" inputMode="decimal" suffix="°C" value={max} onChange={(ev) => setMax(ev.target.value)} hint="Vazio = sem limite" />
      </FormRow>
      <Input label="Localização" value={localizacao} onChange={(ev) => setLocalizacao(ev.target.value)} />
      <Checkbox label="Ativo" checked={ativo} onChange={(ev) => setAtivo(ev.target.checked)} />
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={p.onCancel}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" loading={salvando}>
          Salvar
        </Button>
      </div>
    </form>
  );
}

export default function EquipamentosPage() {
  const toast = useToast();
  const { temPapel } = useAuth();
  const isAdmin = temPapel('admin');
  const { unidadeId, unidades } = useUnidade();
  const [rows, setRows] = useState<Equipamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [editando, setEditando] = useState<Equipamento | 'novo' | null>(null);
  const [excluir, setExcluir] = useState<Equipamento | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setRows(await listEquipamentos(unidadeId, { incluirInativos: true }));
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

  async function confirmarExclusao() {
    if (!excluir) return;
    try {
      await deleteEquipamento(excluir.id);
      toast.success('Equipamento excluído.');
      setExcluir(null);
      void carregar();
    } catch (err) {
      toast.error(err);
    }
  }

  const faixa = (e: Equipamento) => {
    if (e.temp_min_c != null && e.temp_max_c != null)
      return `${formatarTemperatura(e.temp_min_c)} a ${formatarTemperatura(e.temp_max_c)}`;
    if (e.temp_max_c != null) return `≤ ${formatarTemperatura(e.temp_max_c)}`;
    if (e.temp_min_c != null) return `≥ ${formatarTemperatura(e.temp_min_c)}`;
    return '—';
  };

  const columns: Column<Equipamento>[] = [
    {
      key: 'nome',
      header: 'Equipamento',
      render: (e) => (
        <div>
          <span style={{ fontWeight: 500 }}>{e.nome}</span>
          {!e.ativo && (
            <>
              {' '}
              <Badge variant="neutral">Inativo</Badge>
            </>
          )}
          {e.localizacao && <span className="fb-sub">{e.localizacao}</span>}
        </div>
      ),
    },
    { key: 'tipo', header: 'Tipo', render: (e) => TIPO_EQUIPAMENTO_ROTULO[e.tipo] },
    { key: 'faixa', header: 'Faixa aceitável', render: faixa },
    {
      key: 'unidade',
      header: 'Unidade',
      render: (e) => unidades.find((u) => u.id === e.unidade_id)?.nome ?? '—',
    },
    {
      key: 'acoes',
      header: '',
      align: 'right',
      render: (e) => (
        <span className="fb-actions" onClick={(ev) => ev.stopPropagation()}>
          <Button size="sm" onClick={() => setEditando(e)}>
            Editar
          </Button>
          {isAdmin && (
            <Button size="sm" variant="ghost" onClick={() => setExcluir(e)}>
              Excluir
            </Button>
          )}
        </span>
      ),
    },
  ];

  const unidadePadrao = unidadeId ?? unidades[0]?.id ?? '';

  return (
    <div className="fb-page">
      <PageHeader
        title="Equipamentos"
        subtitle="Geladeiras, freezers, câmaras e balcões com a faixa de temperatura aceitável."
        back="/temperaturas"
        actions={
          <Button variant="primary" onClick={() => setEditando('novo')} disabled={!unidades.length}>
            Novo equipamento
          </Button>
        }
      />
      {!carregando && rows.length === 0 ? (
        <EmptyState title="Nenhum equipamento cadastrado" description="Cadastre o primeiro para começar a registrar temperaturas." />
      ) : (
        <Table
          columns={columns}
          rows={rows}
          rowKey={(e) => e.id}
          loading={carregando}
          compact
          onRowClick={(e) => setEditando(e)}
        />
      )}
      <Modal
        open={editando !== null}
        onClose={() => setEditando(null)}
        title={editando === 'novo' ? 'Novo equipamento' : 'Editar equipamento'}
      >
        {editando !== null && (
          <EquipamentoForm
            key={editando === 'novo' ? 'novo' : editando.id}
            equipamento={editando === 'novo' ? null : editando}
            unidadeId={unidadePadrao}
            unidades={unidades}
            onCancel={() => setEditando(null)}
            onSaved={() => {
              setEditando(null);
              void carregar();
            }}
          />
        )}
      </Modal>
      <ConfirmDialog
        open={!!excluir}
        title="Excluir equipamento"
        message={
          <>
            Excluir <strong>{excluir?.nome}</strong>? Todos os registros de temperatura dele serão apagados. Para manter o
            histórico, apenas desative-o.
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
