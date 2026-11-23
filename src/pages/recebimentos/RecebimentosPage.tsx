import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Input, PageHeader, Pagination, Select, Table, useToast } from '@/components/ui';
import type { Column } from '@/components/ui';
import { useUnidade } from '@/contexts/UnidadeContext';
import { listFornecedores, listRecebimentos } from '@/lib/api';
import { formatarDataHora, formatarTemperatura } from '@/lib/format';
import type { BadgeVariant, Fornecedor, Recebimento, StatusRecebimento } from '@/types/database';
import '@/pages/etiquetas/etiquetas.css';

const LIMIT = 30;

export const STATUS_RECEBIMENTO: Record<StatusRecebimento, { rotulo: string; cor: BadgeVariant }> = {
  conforme: { rotulo: 'Conforme', cor: 'success' },
  parcial: { rotulo: 'Parcial', cor: 'warning' },
  recusado: { rotulo: 'Recusado', cor: 'danger' },
};

function simNao(v: boolean | null) {
  if (v == null) return '—';
  return v ? 'Sim' : <span className="text-danger">Não</span>;
}

export default function RecebimentosPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { unidadeId, unidades } = useUnidade();
  const [rows, setRows] = useState<Recebimento[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [fornecedorId, setFornecedorId] = useState('');

  useEffect(() => {
    listFornecedores({ incluirInativos: true }).then(setFornecedores).catch(() => undefined);
  }, []);

  useEffect(() => setOffset(0), [unidadeId, de, ate, fornecedorId]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await listRecebimentos({
        unidadeId,
        de: de || undefined,
        ate: ate || undefined,
        fornecedorId: fornecedorId || undefined,
        limit: LIMIT,
        offset,
      });
      setRows(r.data);
      setTotal(r.total);
    } catch (err) {
      toast.error(err);
    } finally {
      setCarregando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidadeId, de, ate, fornecedorId, offset]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const columns: Column<Recebimento>[] = [
    { key: 'recebido_em', header: 'Recebido em', render: (r) => formatarDataHora(r.recebido_em) },
    {
      key: 'fornecedor',
      header: 'Fornecedor',
      render: (r) => (
        <div>
          <span style={{ fontWeight: 500 }}>{r.fornecedor?.nome ?? '—'}</span>
          {unidadeId === null && (
            <span className="fb-sub">{unidades.find((u) => u.id === r.unidade_id)?.nome ?? ''}</span>
          )}
        </div>
      ),
    },
    { key: 'nota_fiscal', header: 'NF', render: (r) => <span className="mono">{r.nota_fiscal ?? '—'}</span> },
    {
      key: 'temperatura_veiculo_c',
      header: 'Temp. veículo',
      align: 'right',
      render: (r) => (r.temperatura_veiculo_c != null ? formatarTemperatura(r.temperatura_veiculo_c) : '—'),
    },
    { key: 'veiculo_limpo', header: 'Veículo limpo', align: 'center', render: (r) => simNao(r.veiculo_limpo) },
    {
      key: 'entregador_uniformizado',
      header: 'Uniforme',
      align: 'center',
      render: (r) => simNao(r.entregador_uniformizado),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <Badge variant={STATUS_RECEBIMENTO[r.status].cor}>{STATUS_RECEBIMENTO[r.status].rotulo}</Badge>,
    },
  ];

  return (
    <div className="fb-page">
      <PageHeader
        title="Recebimento"
        subtitle="Conferência de mercadorias: temperatura, integridade, lote e validade do fabricante."
        actions={
          <Button variant="primary" onClick={() => navigate('/recebimentos/novo')}>
            Novo recebimento
          </Button>
        }
      />
      <div className="fb-filters">
        <Input label="De" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        <Input label="Até" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        <Select
          label="Fornecedor"
          value={fornecedorId}
          onChange={(e) => setFornecedorId(e.target.value)}
          placeholder="Todos"
          options={fornecedores.map((f) => ({ value: f.id, label: f.nome }))}
        />
      </div>
      <Table
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        loading={carregando}
        compact
        onRowClick={(r) => navigate(`/recebimentos/${r.id}`)}
        empty="Nenhum recebimento no período."
      />
      {total > LIMIT && <Pagination total={total} limit={LIMIT} offset={offset} onChange={setOffset} />}
    </div>
  );
}
