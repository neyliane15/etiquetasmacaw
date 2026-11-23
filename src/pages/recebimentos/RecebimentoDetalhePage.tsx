import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, PageHeader, Spinner, Table, useToast } from '@/components/ui';
import type { Column } from '@/components/ui';
import { useUnidade } from '@/contexts/UnidadeContext';
import { getRecebimento } from '@/lib/api';
import { formatarData, formatarDataHora, formatarQuantidade, formatarTemperatura } from '@/lib/format';
import type { RecebimentoComItens, RecebimentoItem } from '@/types/database';
import { STATUS_RECEBIMENTO } from '@/pages/recebimentos/RecebimentosPage';
import '@/pages/etiquetas/etiquetas.css';

function simNao(v: boolean | null) {
  if (v == null) return '—';
  return v ? 'Sim' : 'Não';
}

export default function RecebimentoDetalhePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { unidades } = useUnidade();
  const [rec, setRec] = useState<RecebimentoComItens | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    setCarregando(true);
    getRecebimento(id)
      .then(setRec)
      .catch((err) => {
        toast.error(err);
        setRec(null);
      })
      .finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (carregando) return <Spinner label="Carregando recebimento…" />;
  if (!rec) {
    return (
      <div className="fb-page">
        <PageHeader title="Recebimento" back="/recebimentos" />
        <EmptyState title="Recebimento não encontrado" />
      </div>
    );
  }

  function etiquetar(i: RecebimentoItem) {
    if (!rec) return;
    const q = new URLSearchParams({ tipo: 'recebimento', item: i.id, qtd: String(i.quantidade), um: i.unidade_medida });
    if (i.produto_id) q.set('produto', i.produto_id);
    if (i.lote) q.set('lote', i.lote);
    if (i.data_validade) q.set('validade_fab', i.data_validade);
    if (i.sif) q.set('sif', i.sif);
    if (rec.fornecedor_id) q.set('fornecedor', rec.fornecedor_id);
    navigate(`/etiquetas/nova?${q.toString()}`);
  }

  const columns: Column<RecebimentoItem>[] = [
    { key: 'produto_nome', header: 'Produto', render: (i) => <span style={{ fontWeight: 500 }}>{i.produto_nome}</span> },
    { key: 'quantidade', header: 'Qtd.', align: 'right', render: (i) => formatarQuantidade(i.quantidade, i.unidade_medida) },
    { key: 'lote', header: 'Lote', render: (i) => i.lote ?? '—' },
    { key: 'data_fabricacao', header: 'Fabricação', render: (i) => (i.data_fabricacao ? formatarData(i.data_fabricacao) : '—') },
    { key: 'data_validade', header: 'Validade', render: (i) => (i.data_validade ? formatarData(i.data_validade) : '—') },
    {
      key: 'temperatura_c',
      header: 'Temp.',
      align: 'right',
      render: (i) => (i.temperatura_c != null ? formatarTemperatura(i.temperatura_c) : '—'),
    },
    { key: 'sif', header: 'SIF', render: (i) => i.sif ?? '—' },
    { key: 'embalagem_integra', header: 'Embalagem', render: (i) => (i.embalagem_integra ? 'Íntegra' : 'Danificada') },
    {
      key: 'conforme',
      header: 'Conformidade',
      render: (i) =>
        i.conforme ? (
          <Badge variant="success">Conforme</Badge>
        ) : (
          <div>
            <Badge variant="danger">Não conforme</Badge>
            {i.motivo_nao_conformidade && <span className="fb-sub">{i.motivo_nao_conformidade}</span>}
          </div>
        ),
    },
    {
      key: 'acoes',
      header: '',
      align: 'right',
      render: (i) =>
        i.conforme ? (
          <Button size="sm" onClick={() => etiquetar(i)}>
            Etiquetar
          </Button>
        ) : null,
    },
  ];

  const st = STATUS_RECEBIMENTO[rec.status];

  return (
    <div className="fb-page">
      <PageHeader
        title={`Recebimento · ${rec.fornecedor?.nome ?? 'sem fornecedor'}`}
        subtitle={
          <span className="row" style={{ gap: 'var(--sp-3)' }}>
            <Badge variant={st.cor}>{st.rotulo}</Badge>
            <span className="muted">{formatarDataHora(rec.recebido_em)}</span>
            <span className="muted">{unidades.find((u) => u.id === rec.unidade_id)?.nome ?? ''}</span>
          </span>
        }
        back="/recebimentos"
      />
      <Card title="Entrega">
        <dl className="fb-kv">
          <div>
            <dt>Nota fiscal</dt>
            <dd className="mono">{rec.nota_fiscal ?? '—'}</dd>
          </div>
          <div>
            <dt>Temperatura do veículo</dt>
            <dd>{rec.temperatura_veiculo_c != null ? formatarTemperatura(rec.temperatura_veiculo_c) : '—'}</dd>
          </div>
          <div>
            <dt>Veículo limpo</dt>
            <dd>{simNao(rec.veiculo_limpo)}</dd>
          </div>
          <div>
            <dt>Entregador uniformizado</dt>
            <dd>{simNao(rec.entregador_uniformizado)}</dd>
          </div>
          <div>
            <dt>Itens</dt>
            <dd>
              {rec.itens.length} ({rec.itens.filter((i) => i.conforme).length} conformes)
            </dd>
          </div>
        </dl>
        {rec.observacoes && (
          <p style={{ margin: 'var(--sp-4) 0 0', whiteSpace: 'pre-wrap' }}>
            <span className="caps muted">Observações · </span>
            {rec.observacoes}
          </p>
        )}
      </Card>
      <Card title="Itens recebidos" padding="none">
        <Table columns={columns} rows={rec.itens} rowKey={(i) => i.id} compact empty="Sem itens." />
      </Card>
    </div>
  );
}
