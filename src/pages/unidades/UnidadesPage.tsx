import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Checkbox, FormRow, Input, Modal, PageHeader, Table, useToast } from '@/components/ui';
import type { Column } from '@/components/ui';
import { listUnidades, updateUnidade } from '@/lib/api';
import type { Unidade } from '@/types/database';
import '@/pages/etiquetas/etiquetas.css';

type Campos = Pick<Unidade, 'nome' | 'endereco' | 'cidade' | 'uf' | 'cnpj' | 'telefone' | 'responsavel_tecnico' | 'registro_rt'>;

function UnidadeForm(p: { unidade: Unidade; onSaved(): void; onCancel(): void }) {
  const toast = useToast();
  const u = p.unidade;
  const [v, setV] = useState<Record<keyof Campos, string>>({
    nome: u.nome,
    endereco: u.endereco ?? '',
    cidade: u.cidade ?? '',
    uf: u.uf ?? '',
    cnpj: u.cnpj ?? '',
    telefone: u.telefone ?? '',
    responsavel_tecnico: u.responsavel_tecnico ?? '',
    registro_rt: u.registro_rt ?? '',
  });
  const [ativo, setAtivo] = useState(u.ativo);
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof Campos) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));
  const nn = (s: string) => (s.trim() ? s.trim() : null);

  async function salvar(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!v.nome.trim()) return toast.error('Informe o nome.');
    setSalvando(true);
    try {
      await updateUnidade(u.id, {
        nome: v.nome.trim(),
        endereco: nn(v.endereco),
        cidade: nn(v.cidade),
        uf: nn(v.uf)?.toUpperCase().slice(0, 2) ?? null,
        cnpj: nn(v.cnpj),
        telefone: nn(v.telefone),
        responsavel_tecnico: nn(v.responsavel_tecnico),
        registro_rt: nn(v.registro_rt),
        ativo,
      });
      toast.success('Unidade atualizada.');
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
        <Input label="Nome" value={v.nome} onChange={set('nome')} required />
        <Input label="Slug" value={u.slug} disabled hint="Identificador fixo." />
      </FormRow>
      <Input label="Endereço" value={v.endereco} onChange={set('endereco')} />
      <FormRow cols={3}>
        <Input label="Cidade" value={v.cidade} onChange={set('cidade')} />
        <Input label="UF" value={v.uf} maxLength={2} onChange={set('uf')} />
        <Input label="Telefone" value={v.telefone} onChange={set('telefone')} />
      </FormRow>
      <Input label="CNPJ" value={v.cnpj} onChange={set('cnpj')} />
      <h4 className="fb-section-title" style={{ marginTop: 'var(--sp-3)' }}>Responsável técnico</h4>
      <FormRow cols={2}>
        <Input label="Nome do RT" value={v.responsavel_tecnico} onChange={set('responsavel_tecnico')} />
        <Input label="Registro (CRN / CRMV…)" value={v.registro_rt} onChange={set('registro_rt')} />
      </FormRow>
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

export default function UnidadesPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Unidade[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [editando, setEditando] = useState<Unidade | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setRows(await listUnidades());
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

  const columns: Column<Unidade>[] = [
    {
      key: 'nome',
      header: 'Unidade',
      render: (u) => (
        <div>
          <span style={{ fontWeight: 500 }}>{u.nome}</span>
          {!u.ativo && (
            <>
              {' '}
              <Badge variant="neutral">Inativa</Badge>
            </>
          )}
          <span className="fb-sub">{[u.endereco, u.cidade && `${u.cidade}${u.uf ? `/${u.uf}` : ''}`].filter(Boolean).join(' · ') || '—'}</span>
        </div>
      ),
    },
    { key: 'cnpj', header: 'CNPJ', render: (u) => <span className="mono">{u.cnpj ?? '—'}</span> },
    { key: 'telefone', header: 'Telefone', render: (u) => u.telefone ?? '—' },
    {
      key: 'rt',
      header: 'Responsável técnico',
      render: (u) =>
        u.responsavel_tecnico ? (
          <div>
            {u.responsavel_tecnico}
            {u.registro_rt && <span className="fb-sub">{u.registro_rt}</span>}
          </div>
        ) : (
          <span className="text-warning">Não informado</span>
        ),
    },
    {
      key: 'acoes',
      header: '',
      align: 'right',
      render: (u) => (
        <Button size="sm" onClick={(e) => { e.stopPropagation(); setEditando(u); }}>
          Editar
        </Button>
      ),
    },
  ];

  return (
    <div className="fb-page">
      <PageHeader title="Unidades" subtitle="Restaurantes do grupo Macaw e seus responsáveis técnicos." />
      <Table columns={columns} rows={rows} rowKey={(u) => u.id} loading={carregando} compact onRowClick={(u) => setEditando(u)} />
      <Modal open={!!editando} onClose={() => setEditando(null)} title={editando ? `Editar · ${editando.nome}` : ''}>
        {editando && (
          <UnidadeForm
            key={editando.id}
            unidade={editando}
            onCancel={() => setEditando(null)}
            onSaved={() => {
              setEditando(null);
              void carregar();
            }}
          />
        )}
      </Modal>
    </div>
  );
}
