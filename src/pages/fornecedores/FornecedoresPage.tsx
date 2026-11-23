import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Checkbox, ConfirmDialog, FormRow, Input, Modal, PageHeader, Table, Textarea, useToast } from '@/components/ui';
import type { Column } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { createFornecedor, deleteFornecedor, listFornecedores, updateFornecedor } from '@/lib/api';
import type { Fornecedor, Insert } from '@/types/database';
import '@/pages/etiquetas/etiquetas.css';

function FornecedorForm(p: { fornecedor: Fornecedor | null; onSaved(): void; onCancel(): void }) {
  const toast = useToast();
  const f = p.fornecedor;
  const [v, setV] = useState({
    nome: f?.nome ?? '',
    razao_social: f?.razao_social ?? '',
    cnpj: f?.cnpj ?? '',
    contato: f?.contato ?? '',
    telefone: f?.telefone ?? '',
    email: f?.email ?? '',
    observacoes: f?.observacoes ?? '',
  });
  const [ativo, setAtivo] = useState(f?.ativo ?? true);
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));
  const nn = (s: string) => (s.trim() ? s.trim() : null);

  async function salvar(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!v.nome.trim()) {
      toast.error('Informe o nome.');
      return;
    }
    const dados: Insert<Fornecedor> = {
      nome: v.nome.trim(),
      razao_social: nn(v.razao_social),
      cnpj: nn(v.cnpj),
      contato: nn(v.contato),
      telefone: nn(v.telefone),
      email: nn(v.email),
      observacoes: nn(v.observacoes),
      ativo,
    };
    setSalvando(true);
    try {
      if (f) await updateFornecedor(f.id, dados);
      else await createFornecedor(dados);
      toast.success('Fornecedor salvo.');
      p.onSaved();
    } catch (err) {
      toast.error(err);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form className="stack" onSubmit={salvar}>
      <FormRow cols={2}>
        <Input label="Nome fantasia" value={v.nome} onChange={set('nome')} required />
        <Input label="Razão social" value={v.razao_social} onChange={set('razao_social')} />
      </FormRow>
      <FormRow cols={2}>
        <Input label="CNPJ" value={v.cnpj} onChange={set('cnpj')} placeholder="00.000.000/0000-00" />
        <Input label="Contato" value={v.contato} onChange={set('contato')} />
      </FormRow>
      <FormRow cols={2}>
        <Input label="Telefone" type="tel" value={v.telefone} onChange={set('telefone')} />
        <Input label="E-mail" type="email" value={v.email} onChange={set('email')} />
      </FormRow>
      <Textarea label="Observações" rows={2} value={v.observacoes} onChange={set('observacoes')} />
      <Checkbox label="Ativo" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
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

export default function FornecedoresPage() {
  const toast = useToast();
  const { temPapel } = useAuth();
  const isAdmin = temPapel('admin');
  const [rows, setRows] = useState<Fornecedor[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [incluirInativos, setIncluirInativos] = useState(false);
  const [editando, setEditando] = useState<Fornecedor | 'novo' | null>(null);
  const [excluir, setExcluir] = useState<Fornecedor | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setBuscaAplicada(busca.trim()), 300);
    return () => clearTimeout(t);
  }, [busca]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setRows(await listFornecedores({ busca: buscaAplicada || undefined, incluirInativos }));
    } catch (err) {
      toast.error(err);
    } finally {
      setCarregando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscaAplicada, incluirInativos]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function confirmarExclusao() {
    if (!excluir) return;
    setExcluindo(true);
    try {
      await deleteFornecedor(excluir.id);
      toast.success('Fornecedor excluído.');
      setExcluir(null);
      void carregar();
    } catch (err) {
      toast.error(err);
    } finally {
      setExcluindo(false);
    }
  }

  const columns: Column<Fornecedor>[] = [
    {
      key: 'nome',
      header: 'Fornecedor',
      render: (f) => (
        <div>
          <span style={{ fontWeight: 500 }}>{f.nome}</span>
          {!f.ativo && (
            <>
              {' '}
              <Badge variant="neutral">Inativo</Badge>
            </>
          )}
          {f.razao_social && <span className="fb-sub">{f.razao_social}</span>}
        </div>
      ),
    },
    { key: 'cnpj', header: 'CNPJ', render: (f) => <span className="mono">{f.cnpj ?? '—'}</span> },
    { key: 'contato', header: 'Contato', render: (f) => f.contato ?? '—' },
    { key: 'telefone', header: 'Telefone', render: (f) => f.telefone ?? '—' },
    { key: 'email', header: 'E-mail', render: (f) => f.email ?? '—' },
    {
      key: 'acoes',
      header: '',
      align: 'right',
      render: (f) => (
        <span className="fb-actions" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" onClick={() => setEditando(f)}>
            Editar
          </Button>
          {isAdmin && (
            <Button size="sm" variant="ghost" onClick={() => setExcluir(f)}>
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
        title="Fornecedores"
        actions={
          <Button variant="primary" onClick={() => setEditando('novo')}>
            Novo fornecedor
          </Button>
        }
      />
      <div className="fb-filters">
        <div className="fb-grow">
          <Input label="Buscar" placeholder="Nome, razão social ou CNPJ" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Checkbox label="Incluir inativos" checked={incluirInativos} onChange={(e) => setIncluirInativos(e.target.checked)} />
      </div>
      <Table
        columns={columns}
        rows={rows}
        rowKey={(f) => f.id}
        loading={carregando}
        compact
        onRowClick={(f) => setEditando(f)}
        empty="Nenhum fornecedor encontrado."
      />
      <Modal
        open={editando !== null}
        onClose={() => setEditando(null)}
        title={editando === 'novo' ? 'Novo fornecedor' : 'Editar fornecedor'}
      >
        {editando !== null && (
          <FornecedorForm
            key={editando === 'novo' ? 'novo' : editando.id}
            fornecedor={editando === 'novo' ? null : editando}
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
        title="Excluir fornecedor"
        message={
          <>
            Excluir <strong>{excluir?.nome}</strong>? Etiquetas e recebimentos mantêm o nome registrado.
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
