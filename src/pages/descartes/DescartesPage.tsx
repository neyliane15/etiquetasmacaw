import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, subDays } from 'date-fns';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  FormRow,
  Input,
  PageHeader,
  Pagination,
  Select,
  Table,
  Textarea,
  useToast,
} from '@/components/ui';
import type { Column } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useUnidade } from '@/contexts/UnidadeContext';
import { deleteDescarte, listDescartes, listProdutos, registrarDescarte } from '@/lib/api';
import { formatarDataHora, formatarMoeda, formatarQuantidade } from '@/lib/format';
import { MOTIVO_DESCARTE_ROTULO, UNIDADE_MEDIDA_ROTULO } from '@/types/database';
import type { Descarte, MotivoDescarte, NovoDescarteInput, ProdutoComCategoria, UnidadeMedida } from '@/types/database';
import '@/pages/etiquetas/etiquetas.css';

const LIMIT = 30;
const MOTIVOS = Object.entries(MOTIVO_DESCARTE_ROTULO).map(([value, label]) => ({ value, label }));
const UMS = Object.entries(UNIDADE_MEDIDA_ROTULO).map(([value, label]) => ({ value, label }));

function num(s: string): number | null {
  if (!s.trim()) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function kg(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg`;
}

export default function DescartesPage() {
  const toast = useToast();
  const { temPapel } = useAuth();
  const isAdmin = temPapel('admin');
  const { unidadeId, unidades } = useUnidade();

  const [produtos, setProdutos] = useState<ProdutoComCategoria[]>([]);
  // formulário
  const [produtoId, setProdutoId] = useState('');
  const [produtoNome, setProdutoNome] = useState('');
  const [motivo, setMotivo] = useState<MotivoDescarte>('sobra_producao');
  const [quantidade, setQuantidade] = useState('');
  const [um, setUm] = useState<UnidadeMedida>('kg');
  const [peso, setPeso] = useState('');
  const [observacao, setObservacao] = useState('');
  const [quando, setQuando] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [salvando, setSalvando] = useState(false);

  // lista
  const [de, setDe] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [ate, setAte] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [filtroMotivo, setFiltroMotivo] = useState<MotivoDescarte | ''>('');
  const [rows, setRows] = useState<Descarte[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [excluir, setExcluir] = useState<Descarte | null>(null);

  useEffect(() => {
    listProdutos({ unidadeId }).then(setProdutos).catch(() => undefined);
  }, [unidadeId]);

  useEffect(() => setOffset(0), [unidadeId, de, ate, filtroMotivo]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await listDescartes({
        unidadeId,
        de: de || undefined,
        ate: ate || undefined,
        motivo: filtroMotivo || undefined,
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
  }, [unidadeId, de, ate, filtroMotivo, offset]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function escolherProduto(id: string) {
    setProdutoId(id);
    const p = produtos.find((x) => x.id === id);
    if (p) {
      setProdutoNome(p.nome);
      setUm(p.unidade_medida);
    }
  }

  const produtoSel = produtos.find((p) => p.id === produtoId);
  const qtd = num(quantidade);
  const custoPrevisto =
    produtoSel?.custo_unitario != null && qtd != null && produtoSel.unidade_medida === um
      ? qtd * produtoSel.custo_unitario
      : null;
  const pesoNecessario = !['kg', 'g', 'l', 'ml'].includes(um);

  async function salvar(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!unidadeId) return;
    const nome = produtoSel?.nome ?? produtoNome.trim();
    if (!nome) return toast.error('Informe o produto.');
    if (qtd == null || qtd <= 0) return toast.error('Informe a quantidade.');
    const input: NovoDescarteInput = {
      unidade_id: unidadeId,
      produto_id: produtoId || null,
      produto_nome: nome,
      motivo,
      quantidade: qtd,
      unidade_medida: um,
      peso_kg: num(peso),
      observacao: observacao.trim() || null,
      descartado_em: new Date(quando).toISOString(),
    };
    setSalvando(true);
    try {
      await registrarDescarte(input);
      toast.success('Descarte registrado.');
      setProdutoId('');
      setProdutoNome('');
      setQuantidade('');
      setPeso('');
      setObservacao('');
      setQuando(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
      void carregar();
    } catch (err) {
      toast.error(err);
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarExclusao() {
    if (!excluir) return;
    try {
      await deleteDescarte(excluir.id);
      toast.success('Registro excluído.');
      setExcluir(null);
      void carregar();
    } catch (err) {
      toast.error(err);
    }
  }

  const totais = useMemo(
    () => ({
      peso: rows.reduce((s, r) => s + (r.peso_kg ?? 0), 0),
      custo: rows.reduce((s, r) => s + (r.custo_estimado ?? 0), 0),
    }),
    [rows],
  );

  const columns: Column<Descarte>[] = [
    { key: 'descartado_em', header: 'Data', render: (r) => formatarDataHora(r.descartado_em) },
    {
      key: 'produto_nome',
      header: 'Produto',
      render: (r) => (
        <div>
          <span style={{ fontWeight: 500 }}>{r.produto_nome}</span>
          {(r.observacao || unidadeId === null) && (
            <span className="fb-sub">
              {unidadeId === null ? (unidades.find((u) => u.id === r.unidade_id)?.nome ?? '') : ''}
              {unidadeId === null && r.observacao ? ' · ' : ''}
              {r.observacao ?? ''}
            </span>
          )}
        </div>
      ),
    },
    { key: 'motivo', header: 'Motivo', render: (r) => MOTIVO_DESCARTE_ROTULO[r.motivo] },
    { key: 'quantidade', header: 'Qtd.', align: 'right', render: (r) => formatarQuantidade(r.quantidade, r.unidade_medida) },
    { key: 'peso_kg', header: 'Peso', align: 'right', render: (r) => kg(r.peso_kg) },
    { key: 'custo_estimado', header: 'Custo est.', align: 'right', render: (r) => (r.custo_estimado != null ? formatarMoeda(r.custo_estimado) : '—') },
    { key: 'responsavel', header: 'Responsável', render: (r) => r.responsavel?.nome ?? '—' },
    {
      key: 'acoes',
      header: '',
      align: 'right',
      render: (r) =>
        isAdmin ? (
          <Button size="sm" variant="ghost" onClick={() => setExcluir(r)}>
            Excluir
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="fb-page">
      <PageHeader title="Descartes" subtitle="Registro de desperdício — peso e custo estimado alimentam os relatórios." />

      {unidadeId ? (
        <Card title="Registrar descarte">
          <form className="stack" onSubmit={salvar}>
            <FormRow cols={4}>
              <Select
                label="Produto"
                value={produtoId}
                onChange={(e) => escolherProduto(e.target.value)}
                placeholder="Avulso (digitar nome)"
                options={produtos.map((p) => ({ value: p.id, label: p.nome }))}
              />
              {!produtoId && <Input label="Nome do produto" value={produtoNome} onChange={(e) => setProdutoNome(e.target.value)} />}
              <Select label="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoDescarte)} options={MOTIVOS} />
              <Input label="Data/hora" type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} />
            </FormRow>
            <FormRow cols={4}>
              <Input label="Quantidade" inputMode="decimal" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
              <Select label="Unidade" value={um} onChange={(e) => setUm(e.target.value as UnidadeMedida)} options={UMS} />
              <Input
                label="Peso (kg)"
                inputMode="decimal"
                value={peso}
                onChange={(e) => setPeso(e.target.value)}
                hint={pesoNecessario ? 'Informe para contabilizar no total em kg.' : 'Calculado automaticamente se vazio.'}
              />
              <div className="stack" style={{ gap: 2, justifyContent: 'flex-end' }}>
                <span className="caps muted">Custo estimado</span>
                <strong>{custoPrevisto != null ? formatarMoeda(custoPrevisto) : '—'}</strong>
              </div>
            </FormRow>
            <Textarea label="Observação" rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <Button type="submit" variant="danger" loading={salvando}>
                Registrar descarte
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <EmptyState title="Escolha uma unidade para registrar descartes" description="A listagem abaixo mostra todas as unidades." />
      )}

      <div className="stack">
        <div className="fb-filters">
          <Input label="De" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          <Input label="Até" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          <Select
            label="Motivo"
            value={filtroMotivo}
            onChange={(e) => setFiltroMotivo(e.target.value as MotivoDescarte | '')}
            placeholder="Todos"
            options={MOTIVOS}
          />
          <div className="stack fb-total" style={{ gap: 2 }}>
            <span className="caps muted">Nesta página</span>
            <span>
              <strong>{kg(totais.peso)}</strong> · <strong>{formatarMoeda(totais.custo)}</strong>
            </span>
          </div>
        </div>
        <Table columns={columns} rows={rows} rowKey={(r) => r.id} loading={carregando} compact empty="Nenhum descarte no período." />
        {total > LIMIT && <Pagination total={total} limit={LIMIT} offset={offset} onChange={setOffset} />}
      </div>

      <ConfirmDialog
        open={!!excluir}
        title="Excluir registro de descarte"
        message="O registro sai dos relatórios de desperdício. Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        variant="danger"
        onConfirm={confirmarExclusao}
        onCancel={() => setExcluir(null)}
      />
    </div>
  );
}
