import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Checkbox, FormRow, Input, Modal, PageHeader, Select, Table, useToast } from '@/components/ui';
import type { Column } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useUnidade } from '@/contexts/UnidadeContext';
import { criarUsuario, listPerfis, updatePerfil } from '@/lib/api';
import { formatarData } from '@/lib/format';
import { PAPEL_ROTULO } from '@/types/database';
import type { BadgeVariant, PapelUsuario, Perfil, Unidade } from '@/types/database';
import '@/pages/etiquetas/etiquetas.css';

const PAPEIS = Object.entries(PAPEL_ROTULO).map(([value, label]) => ({ value, label }));
const COR_PAPEL: Record<PapelUsuario, BadgeVariant> = { admin: 'olive', gerente: 'info', cozinheiro: 'neutral' };

function UsuarioForm(p: { perfil: Perfil | null; unidades: Unidade[]; euId: string | null; onSaved(): void; onCancel(): void }) {
  const toast = useToast();
  const u = p.perfil;
  const [nome, setNome] = useState(u?.nome ?? '');
  const [email, setEmail] = useState(u?.email ?? '');
  const [senha, setSenha] = useState('');
  const [papel, setPapel] = useState<PapelUsuario>(u?.papel ?? 'cozinheiro');
  const [unidadeId, setUnidadeId] = useState<string>(u ? (u.unidade_id ?? '') : (p.unidades[0]?.id ?? ''));
  const [ativo, setAtivo] = useState(u?.ativo ?? true);
  const [salvando, setSalvando] = useState(false);
  const souEu = !!u && u.id === p.euId;

  async function salvar(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!nome.trim()) return toast.error('Informe o nome.');
    if (papel !== 'admin' && !unidadeId) return toast.error('Gerentes e cozinheiros precisam de uma unidade.');
    setSalvando(true);
    try {
      if (u) {
        await updatePerfil(u.id, { nome: nome.trim(), papel, unidade_id: unidadeId || null, ativo });
        toast.success('Usuário atualizado.');
      } else {
        if (!email.trim() || senha.length < 6) {
          toast.error('Informe e-mail e senha com ao menos 6 caracteres.');
          setSalvando(false);
          return;
        }
        await criarUsuario({ email: email.trim(), senha, nome: nome.trim(), papel, unidade_id: unidadeId || null });
        toast.success('Usuário criado.');
      }
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
        <Input
          label="E-mail"
          type="email"
          value={email}
          disabled={!!u}
          onChange={(e) => setEmail(e.target.value)}
          required={!u}
          autoComplete="off"
        />
        {!u && (
          <Input
            label="Senha inicial"
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            hint="Mínimo de 6 caracteres. O usuário pode trocar depois."
            autoComplete="new-password"
          />
        )}
      </FormRow>
      <FormRow cols={2}>
        <Select
          label="Papel"
          value={papel}
          disabled={souEu}
          onChange={(e) => setPapel(e.target.value as PapelUsuario)}
          options={PAPEIS}
          hint={souEu ? 'Você não pode alterar o próprio papel.' : undefined}
        />
        <Select
          label="Unidade"
          value={unidadeId}
          onChange={(e) => setUnidadeId(e.target.value)}
          options={[
            { value: '', label: 'Todas (somente admin)', disabled: papel !== 'admin' },
            ...p.unidades.map((x) => ({ value: x.id, label: x.nome })),
          ]}
        />
      </FormRow>
      {u && <Checkbox label="Ativo (pode acessar o sistema)" checked={ativo} disabled={souEu} onChange={(e) => setAtivo(e.target.checked)} />}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={p.onCancel}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" loading={salvando}>
          {u ? 'Salvar' : 'Criar usuário'}
        </Button>
      </div>
    </form>
  );
}

export default function UsuariosPage() {
  const toast = useToast();
  const { userId } = useAuth();
  const { unidades } = useUnidade();
  const [rows, setRows] = useState<Perfil[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [editando, setEditando] = useState<Perfil | 'novo' | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setRows(await listPerfis(null));
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

  const columns: Column<Perfil>[] = [
    {
      key: 'nome',
      header: 'Nome',
      render: (u) => (
        <div>
          <span style={{ fontWeight: 500 }}>{u.nome}</span>
          {u.id === userId && <span className="muted"> (você)</span>}
          <span className="fb-sub">{u.email}</span>
        </div>
      ),
    },
    { key: 'papel', header: 'Papel', render: (u) => <Badge variant={COR_PAPEL[u.papel]}>{PAPEL_ROTULO[u.papel]}</Badge> },
    {
      key: 'unidade',
      header: 'Unidade',
      render: (u) => (u.unidade_id ? (unidades.find((x) => x.id === u.unidade_id)?.nome ?? '—') : 'Todas'),
    },
    {
      key: 'ativo',
      header: 'Acesso',
      render: (u) => <Badge variant={u.ativo ? 'success' : 'danger'}>{u.ativo ? 'Ativo' : 'Bloqueado'}</Badge>,
    },
    { key: 'created_at', header: 'Desde', render: (u) => formatarData(u.created_at) },
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
      <PageHeader
        title="Usuários"
        subtitle="Papéis: admin (tudo), gerente (cadastros e relatórios da unidade), cozinheiro (operação)."
        actions={
          <Button variant="primary" onClick={() => setEditando('novo')}>
            Novo usuário
          </Button>
        }
      />
      <Table
        columns={columns}
        rows={rows}
        rowKey={(u) => u.id}
        loading={carregando}
        compact
        onRowClick={(u) => setEditando(u)}
        empty="Nenhum usuário."
      />
      <Modal open={editando !== null} onClose={() => setEditando(null)} title={editando === 'novo' ? 'Novo usuário' : 'Editar usuário'}>
        {editando !== null && (
          <UsuarioForm
            key={editando === 'novo' ? 'novo' : editando.id}
            perfil={editando === 'novo' ? null : editando}
            unidades={unidades}
            euId={userId}
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
