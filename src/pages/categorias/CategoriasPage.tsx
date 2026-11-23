import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Checkbox, ConfirmDialog, FormRow, Input, Modal, PageHeader, Table, useToast } from '@/components/ui';
import type { Column } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { createCategoria, deleteCategoria, listCategorias, updateCategoria } from '@/lib/api';
import { formatarTemperatura } from '@/lib/format';
import type { Categoria, Insert } from '@/types/database';
import '@/pages/etiquetas/etiquetas.css';

const CORES = ['#79731B', '#A9502F', '#B8862B', '#5E6B6E', '#9A7B4F', '#8A6A7E', '#5E7C86', '#3E5560'];

function CategoriaForm(p: { categoria: Categoria | null; proximaOrdem: number; onSaved(): void; onCancel(): void }) {
  const toast = useToast();
  const c = p.categoria;
  const [nome, setNome] = useState(c?.nome ?? '');
  const [cor, setCor] = useState(c?.cor ?? '#79731B');
  const [ordem, setOrdem] = useState(String(c?.ordem ?? p.proximaOrdem));
  const [temp, setTemp] = useState(c?.temp_recebimento_max_c != null ? String(c.temp_recebimento_max_c) : '');
  const [ativo, setAtivo] = useState(c?.ativo ?? true);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!nome.trim()) {
      toast.error('Informe o nome.');
      return;
    }
    const t = temp.trim() ? Number(temp.replace(',', '.')) : null;
    if (t != null && !Number.isFinite(t)) {
      toast.error('Temperatura inválida.');
      return;
    }
    const dados: Insert<Categoria> = {
      nome: nome.trim(),
      cor,
      ordem: Number(ordem) || 0,
      temp_recebimento_max_c: t,
      ativo,
    };
    setSalvando(true);
    try {
      if (c) await updateCategoria(c.id, dados);
      else await createCategoria(dados);
      toast.success('Categoria salva.');
      p.onSaved();
    } catch (err) {
      toast.error(err);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form className="stack" onSubmit={salvar}>
      <Input label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
      <FormRow cols={2}>
        <Input label="Ordem" type="number" value={ordem} onChange={(e) => setOrdem(e.target.value)} />
        <Input
          label="Temp. máx. no recebimento"
          inputMode="decimal"
          value={temp}
          onChange={(e) => setTemp(e.target.value)}
          suffix="°C"
          hint="Itens acima deste valor são sinalizados."
        />
      </FormRow>
      <div>
        <div className="caps muted" style={{ marginBottom: 4 }}>Cor</div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {CORES.map((k) => (
            <button
              key={k}
              type="button"
              className="fb-chip"
              aria-pressed={cor.toLowerCase() === k.toLowerCase()}
              aria-label={`Cor ${k}`}
              onClick={() => setCor(k)}
              style={{ padding: 3 }}
            >
              <span className="fb-dot" style={{ background: k, margin: 0, width: 14, height: 14 }} />
            </button>
          ))}
          <input type="color" value={cor} onChange={(e) => setCor(e.target.value)} aria-label="Cor personalizada" />
        </div>
      </div>
      <Checkbox label="Ativa" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
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

export default function CategoriasPage() {
  const toast = useToast();
  const { temPapel } = useAuth();
  const isAdmin = temPapel('admin');
  const [rows, setRows] = useState<Categoria[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [editando, setEditando] = useState<Categoria | 'nova' | null>(null);
  const [excluir, setExcluir] = useState<Categoria | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setRows(await listCategorias({ incluirInativas: true }));
    } catch (err) {
      toast.error(err);
    } finally {
      setCarregando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function confirmarExclusao() {
    if (!excluir) return;
    setExcluindo(true);
    try {
      await deleteCategoria(excluir.id);
      toast.success('Categoria excluída.');
      setExcluir(null);
      void carregar();
    } catch (err) {
      toast.error(err);
    } finally {
      setExcluindo(false);
    }
  }

  const columns: Column<Categoria>[] = [
    { key: 'ordem', header: '#', width: 40, align: 'right' },
    {
      key: 'nome',
      header: 'Categoria',
      render: (c) => (
        <span>
          <span className="fb-dot" style={{ background: c.cor }} />
          {c.nome}
          {!c.ativo && (
            <>
              {' '}
              <Badge variant="neutral">Inativa</Badge>
            </>
          )}
        </span>
      ),
    },
    {
      key: 'temp_recebimento_max_c',
      header: 'Temp. máx. recebimento',
      render: (c) => (c.temp_recebimento_max_c != null ? `≤ ${formatarTemperatura(c.temp_recebimento_max_c)}` : '—'),
    },
    {
      key: 'acoes',
      header: '',
      align: 'right',
      render: (c) => (
        <span className="fb-actions" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" onClick={() => setEditando(c)}>
            Editar
          </Button>
          {isAdmin && (
            <Button size="sm" variant="ghost" onClick={() => setExcluir(c)}>
              Excluir
            </Button>
          )}
        </span>
      ),
    },
  ];

  return (
    <div className="fb-page">
      <PageHeader
        title="Categorias"
        subtitle="Agrupam os produtos e definem a temperatura máxima aceita no recebimento."
        actions={
          <Button variant="primary" onClick={() => setEditando('nova')}>
            Nova categoria
          </Button>
        }
      />
      <Table
        columns={columns}
        rows={rows}
        rowKey={(c) => c.id}
        loading={carregando}
        compact
        onRowClick={(c) => setEditando(c)}
        empty="Nenhuma categoria cadastrada."
      />
      <Modal
        open={editando !== null}
        onClose={() => setEditando(null)}
        title={editando === 'nova' ? 'Nova categoria' : 'Editar categoria'}
        size="sm"
      >
        {editando !== null && (
          <CategoriaForm
            key={editando === 'nova' ? 'nova' : editando.id}
            categoria={editando === 'nova' ? null : editando}
            proximaOrdem={rows.reduce((m, c) => Math.max(m, c.ordem), 0) + 1}
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
        title="Excluir categoria"
        message={
          <>
            Excluir <strong>{excluir?.nome}</strong>? Os produtos ficarão sem categoria. Para apenas ocultá-la, edite e
            desmarque “Ativa”.
          </>
        }
        confirmLabel="Excluir"
        variant="danger"
        loading={excluindo}
        onConfirm={confirmarExclusao}
        onCancel={() => setExcluir(null)}
      />
    </div>
  );
}
