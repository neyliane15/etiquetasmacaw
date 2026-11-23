import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Input, PageHeader, Pagination, Select, Table, useToast } from '@/components/ui';
import type { Column } from '@/components/ui';
import { useUnidade } from '@/contexts/UnidadeContext';
import { listEtiquetas, marcarVencidas } from '@/lib/api';
import { corSituacao, formatarDataCurta, formatarRelativo, rotuloSituacao } from '@/lib/format';
import {
  METODO_ROTULO,
  STATUS_ROTULO,
  TIPO_ETIQUETA_ROTULO,
} from '@/types/database';
import type {
  EtiquetaDetalhe,
  FiltroEtiquetas,
  MetodoConservacao,
  SituacaoEtiqueta,
  StatusEtiqueta,
  TipoEtiqueta,
} from '@/types/database';
import { BaixaEtiquetaModal } from '@/components/label/BaixaEtiquetaModal';
import { reimprimirEtiqueta } from '@/components/label/printLabels';
import '@/pages/etiquetas/etiquetas.css';

const LIMIT = 50;

const opcoes = (r: Record<string, string>) => Object.entries(r).map(([value, label]) => ({ value, label }));

const SITUACOES: SituacaoEtiqueta[] = ['vencida', 'vence_hoje', 'vence_24h', 'vence_72h', 'ok', 'consumida', 'descartada'];

export default function EtiquetasPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { unidadeId } = useUnidade();

  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [status, setStatus] = useState<StatusEtiqueta | 'todas'>('ativa');
  const [situacao, setSituacao] = useState<SituacaoEtiqueta | ''>('');
  const [tipo, setTipo] = useState<TipoEtiqueta | ''>('');
  const [metodo, setMetodo] = useState<MetodoConservacao | ''>('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [ordenarPor, setOrdenarPor] = useState<'data_validade' | 'created_at'>('data_validade');
  const [offset, setOffset] = useState(0);

  const [rows, setRows] = useState<EtiquetaDetalhe[]>([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [baixa, setBaixa] = useState<EtiquetaDetalhe | null>(null);
  const [imprimindo, setImprimindo] = useState<string | null>(null);

  // Debounce da busca
  useEffect(() => {
    const t = setTimeout(() => setBuscaAplicada(busca.trim()), 300);
    return () => clearTimeout(t);
  }, [busca]);

  useEffect(() => {
    setOffset(0);
  }, [unidadeId, buscaAplicada, status, situacao, tipo, metodo, de, ate, ordenarPor]);

  const filtro = useMemo<FiltroEtiquetas>(
    () => ({
      unidadeId,
      status,
      situacao: situacao || undefined,
      busca: buscaAplicada || undefined,
      tipo: tipo || undefined,
      metodo: metodo || undefined,
      de: de || undefined,
      ate: ate || undefined,
      limit: LIMIT,
      offset,
      ordenarPor,
    }),
    [unidadeId, status, situacao, buscaAplicada, tipo, metodo, de, ate, offset, ordenarPor],
  );

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await listEtiquetas(filtro);
      setRows(r.data);
      setTotal(r.total);
    } catch (err) {
      toast.error(err);
    } finally {
      setCarregando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro]);

  // Marca vencidas ao entrar/trocar de unidade, depois carrega.
  useEffect(() => {
    let vivo = true;
    marcarVencidas(unidadeId)
      .catch(() => 0)
      .finally(() => {
        if (vivo) void carregar();
      });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidadeId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function reimprimir(e: EtiquetaDetalhe) {
    setImprimindo(e.id);
    try {
      await reimprimirEtiqueta(e);
      toast.success(`Etiqueta ${e.codigo} enviada para impressão.`);
      void carregar();
    } catch (err) {
      toast.error(err);
    } finally {
      setImprimindo(null);
    }
  }

  function limpar() {
    setBusca('');
    setStatus('ativa');
    setSituacao('');
    setTipo('');
    setMetodo('');
    setDe('');
    setAte('');
  }

  const columns: Column<EtiquetaDetalhe>[] = [
    {
      key: 'codigo',
      header: 'Código',
      width: 96,
      render: (r) => <span className="fb-code">{r.codigo}</span>,
    },
    {
      key: 'produto_nome',
      header: 'Produto',
      render: (r) => (
        <div>
          <strong style={{ fontWeight: 500 }}>{r.produto_nome}</strong>
          <span className="fb-sub">
            {TIPO_ETIQUETA_ROTULO[r.tipo]}
            {r.lote ? ` · lote ${r.lote}` : ''}
            {unidadeId === null ? ` · ${r.unidade_nome}` : ''}
          </span>
        </div>
      ),
    },
    {
      key: 'metodo',
      header: 'Método',
      render: (r) => <span className={`fb-metodo fb-metodo--${r.metodo}`}>{METODO_ROTULO[r.metodo]}</span>,
    },
    { key: 'data_manipulacao', header: 'Manipulação', render: (r) => formatarDataCurta(r.data_manipulacao) },
    {
      key: 'data_validade',
      header: 'Validade',
      render: (r) => (
        <div>
          <strong style={{ fontWeight: 600 }}>{formatarDataCurta(r.data_validade)}</strong>
          {r.status === 'ativa' && <span className="fb-sub">{formatarRelativo(r.data_validade)}</span>}
        </div>
      ),
    },
    {
      key: 'situacao',
      header: 'Situação',
      render: (r) => <Badge variant={corSituacao(r.situacao)}>{rotuloSituacao(r.situacao)}</Badge>,
    },
    { key: 'responsavel_nome', header: 'Responsável', render: (r) => r.responsavel_nome ?? '—' },
    {
      key: 'acoes',
      header: '',
      align: 'right',
      render: (r) => (
        <span className="fb-actions" onClick={(ev) => ev.stopPropagation()}>
          <Button size="sm" variant="ghost" loading={imprimindo === r.id} onClick={() => reimprimir(r)}>
            Reimprimir
          </Button>
          {(r.status === 'ativa' || r.status === 'vencida') && (
            <Button size="sm" onClick={() => setBaixa(r)}>
              Baixa
            </Button>
          )}
        </span>
      ),
    },
  ];

  return (
    <div className="fb-page">
      <PageHeader
        title="Etiquetas"
        subtitle={`${total} etiqueta${total === 1 ? '' : 's'} · ordenadas por ${ordenarPor === 'data_validade' ? 'vencimento (PVPS)' : 'emissão'}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/etiquetas/baixa')}>
              Baixa rápida
            </Button>
            <Button variant="primary" onClick={() => navigate('/etiquetas/nova')}>
              Emitir etiqueta
            </Button>
          </>
        }
      />

      <div className="fb-filters">
        <div className="fb-grow">
          <Input
            label="Buscar"
            placeholder="Produto, código ou lote"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <Select
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusEtiqueta | 'todas')}
          options={[{ value: 'todas', label: 'Todos' }, ...opcoes(STATUS_ROTULO)]}
        />
        <Select
          label="Situação"
          value={situacao}
          onChange={(e) => setSituacao(e.target.value as SituacaoEtiqueta | '')}
          placeholder="Todas"
          options={SITUACOES.map((s) => ({ value: s, label: rotuloSituacao(s) }))}
        />
        <Select
          label="Tipo"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoEtiqueta | '')}
          placeholder="Todos"
          options={opcoes(TIPO_ETIQUETA_ROTULO)}
        />
        <Select
          label="Método"
          value={metodo}
          onChange={(e) => setMetodo(e.target.value as MetodoConservacao | '')}
          placeholder="Todos"
          options={opcoes(METODO_ROTULO)}
        />
        <Input label="Emitidas de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        <Input label="até" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        <Select
          label="Ordenar"
          value={ordenarPor}
          onChange={(e) => setOrdenarPor(e.target.value as 'data_validade' | 'created_at')}
          options={[
            { value: 'data_validade', label: 'Vencimento' },
            { value: 'created_at', label: 'Emissão' },
          ]}
        />
        <Button variant="ghost" size="sm" onClick={limpar}>
          Limpar
        </Button>
      </div>

      <Table
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        loading={carregando}
        compact
        onRowClick={(r) => navigate(`/etiquetas/${r.id}`)}
        empty="Nenhuma etiqueta encontrada com esses filtros."
      />
      {total > LIMIT && <Pagination total={total} limit={LIMIT} offset={offset} onChange={setOffset} />}

      <BaixaEtiquetaModal
        etiqueta={baixa}
        onClose={() => setBaixa(null)}
        onDone={() => {
          setBaixa(null);
          void carregar();
        }}
      />
    </div>
  );
}
