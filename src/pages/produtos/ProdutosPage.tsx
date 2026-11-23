import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Checkbox, ConfirmDialog, Input, Modal, PageHeader, Select, Table, useToast } from '@/components/ui';
import type { Column } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useUnidade } from '@/contexts/UnidadeContext';
import { deleteProduto, listCategorias, listFornecedores, listProdutos } from '@/lib/api';
import { descreverPrazo, horasValidadeProduto } from '@/lib/validade';
import { formatarMoeda } from '@/lib/format';
import { METODO_ROTULO } from '@/types/database';
import type { Categoria, Fornecedor, MetodoConservacao, ProdutoComCategoria } from '@/types/database';
import { ProdutoForm } from '@/pages/produtos/ProdutoForm';
import '@/pages/etiquetas/etiquetas.css';

const METODOS: MetodoConservacao[] = ['resfriado', 'congelado', 'ambiente', 'descongelando'];
const ABREV: Record<MetodoConservacao, string> = { resfriado: 'Resfr.', congelado: 'Cong.', ambiente: 'Amb.', descongelando: 'Desc.' };

export default function ProdutosPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { temPapel } = useAuth();
  const { unidadeId, unidades } = useUnidade();
  const podeEditar = temPapel('admin', 'gerente');
  const isAdmin = temPapel('admin');

  const [produtos, setProdutos] = useState<ProdutoComCategoria[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [incluirInativos, setIncluirInativos] = useState(false);
  const [editando, setEditando] = useState<ProdutoComCategoria | 'novo' | null>(null);
  const [excluir, setExcluir] = useState<ProdutoComCategoria | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [ps, cs, fs] = await Promise.all([
        listProdutos({ unidadeId, incluirInativos }),
        listCategorias(),
        listFornecedores(),
      ]);
      setProdutos(ps);
      setCategorias(cs);
      setFornecedores(fs);
    } catch (err) {
      toast.error(err);
    } finally {
      setCarregando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidadeId, incluirInativos]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const filtrados = useMemo(() => {
    const q = busca
      .trim()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
    return produtos.filter((p) => {
      if (categoriaId && p.categoria_id !== categoriaId) return false;
      if (!q) return true;
      const n = p.nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      return n.includes(q) || (p.codigo_barras ?? '').includes(q);
    });
  }, [produtos, busca, categoriaId]);

  async function confirmarExclusao() {
    if (!excluir) return;
    setExcluindo(true);
    try {
      await deleteProduto(excluir.id);
      toast.success('Produto desativado.');
      setExcluir(null);
      void carregar();
    } catch (err) {
      toast.error(err);
    } finally {
      setExcluindo(false);
    }
  }

  const columns: Column<ProdutoComCategoria>[] = [
    {
      key: 'nome',
      header: 'Produto',
      render: (p) => (
        <div>
          <span style={{ fontWeight: 500 }}>{p.nome}</span>
          {!p.ativo && (
            <>
              {' '}
              <Badge variant="neutral">Inativo</Badge>
            </>
          )}
          <span className="fb-sub">
            {p.unidade_id ? (unidades.find((u) => u.id === p.unidade_id)?.nome ?? 'Unidade') : 'Todas as unidades'}
            {p.observacoes ? ` · ${p.observacoes}` : ''}
          </span>
        </div>
      ),
    },
    {
      key: 'categoria',
      header: 'Categoria',
      render: (p) =>
        p.categoria ? (
          <span>
            <span className="fb-dot" style={{ background: p.categoria.cor }} />
            {p.categoria.nome}
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'metodo_padrao',
      header: 'Padrão',
      render: (p) => <span className={`fb-metodo fb-metodo--${p.metodo_padrao}`}>{METODO_ROTULO[p.metodo_padrao]}</span>,
    },
    {
      key: 'validades',
      header: 'Validades',
      render: (p) => {
        const itens = METODOS.map((m) => ({ m, h: horasValidadeProduto(p, m) })).filter((x) => x.h != null);
        if (!itens.length) return <span className="text-warning">Sem validade</span>;
        return (
          <span style={{ fontSize: 'var(--fs-sm)' }}>
            {itens.map((x, i) => (
              <span key={x.m}>
                {i > 0 && <span className="muted"> · </span>}
                <span className="muted">{ABREV[x.m]}</span> {descreverPrazo(x.h as number)}
              </span>
            ))}
          </span>
        );
      },
    },
    {
      key: 'alergenicos',
      header: 'Alérg.',
      align: 'center',
      render: (p) => (p.alergenicos.length ? <Badge variant="warning" title={p.alergenicos.join(', ')}>{p.alergenicos.length}</Badge> : '—'),
    },
    {
      key: 'custo_unitario',
      header: 'Custo',
      align: 'right',
      render: (p) => (p.custo_unitario != null ? `${formatarMoeda(p.custo_unitario)}/${p.unidade_medida}` : '—'),
    },
    {
      key: 'acoes',
      header: '',
      align: 'right',
      render: (p) => (
        <span className="fb-actions" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="ghost" onClick={() => navigate(`/etiquetas/nova?produto=${p.id}`)}>
            Etiquetar
          </Button>
          {podeEditar && (
            <Button size="sm" onClick={() => setEditando(p)}>
              Editar
            </Button>
          )}
          {isAdmin && p.ativo && (
            <Button size="sm" variant="ghost" onClick={() => setExcluir(p)}>
              Desativar
            </Button>
          )}
        </span>
      ),
    },
  ];

  return (
    <div className="fb-page">
      <PageHeader
        title="Produtos"
        subtitle={`${filtrados.length} de ${produtos.length} produtos`}
        actions={
          podeEditar && (
            <Button variant="primary" onClick={() => setEditando('novo')}>
              Novo produto
            </Button>
          )
        }
      />

      <div className="fb-filters">
        <div className="fb-grow">
          <Input label="Buscar" placeholder="Nome ou código de barras" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Select
          label="Categoria"
          value={categoriaId}
          onChange={(e) => setCategoriaId(e.target.value)}
          placeholder="Todas"
          options={categorias.map((c) => ({ value: c.id, label: c.nome }))}
        />
        <Checkbox label="Incluir inativos" checked={incluirInativos} onChange={(e) => setIncluirInativos(e.target.checked)} />
      </div>

      <Table
        columns={columns}
        rows={filtrados}
        rowKey={(p) => p.id}
        loading={carregando}
        compact
        onRowClick={podeEditar ? (p) => setEditando(p) : undefined}
        empty="Nenhum produto encontrado."
      />

      <Modal
        open={editando !== null}
        onClose={() => setEditando(null)}
        title={editando === 'novo' ? 'Novo produto' : 'Editar produto'}
        size="lg"
      >
        {editando !== null && (
          <ProdutoForm
            key={editando === 'novo' ? 'novo' : editando.id}
            produto={editando === 'novo' ? null : editando}
            categorias={categorias.filter((c) => c.ativo)}
            fornecedores={fornecedores.filter((f) => f.ativo)}
            unidades={unidades}
            podeGlobal={isAdmin}
            unidadePadraoId={unidadeId}
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
        title="Desativar produto"
        message={
          <>
            Desativar <strong>{excluir?.nome}</strong>? Ele deixa de aparecer na emissão, mas o histórico das etiquetas é
            mantido.
          </>
        }
        confirmLabel="Desativar"
        variant="danger"
        loading={excluindo}
        onConfirm={confirmarExclusao}
        onCancel={() => setExcluir(null)}
      />
    </div>
  );
}
