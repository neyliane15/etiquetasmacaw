import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { atualizarSenha, validarNovaSenha } from '@/lib/api/auth';
import { Button, Input, Spinner, useToast } from '@/components/ui';
import { Logo } from '@/components/layout/Logo';

/**
 * Destino dos links de "Esqueci minha senha" e de convite do Supabase
 * (redirectTo = /redefinir-senha). O supabase-js cria a sessão a partir do
 * link; aqui o usuário define a nova senha (auth.updateUser).
 */
export default function RedefinirSenhaPage(): JSX.Element {
  const { userId, perfil, carregando } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [nova, setNova] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    document.title = 'Definir senha · Etiquetas Macaw';
  }, []);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const problema = validarNovaSenha(nova, confirmacao);
    if (problema) {
      setErro(problema);
      return;
    }
    setErro(null);
    setSalvando(true);
    try {
      await atualizarSenha(nova);
      toast.success('Senha definida com sucesso.');
      navigate('/', { replace: true });
    } catch (err) {
      setErro(err instanceof Error && err.message ? err.message : 'Não foi possível definir a senha.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="login-page">
      <div style={{ width: '100%', maxWidth: 340 }}>
        <div className="login-card">
          <div className="login-brand">
            <Logo size={64} title="Macaw" />
            <span className="login-brand-name">Macaw</span>
            <span className="login-brand-sub">Definir nova senha</span>
          </div>
          <div className="login-body">
            {carregando ? (
              <Spinner label="Validando link…" />
            ) : !userId ? (
              <div className="stack" style={{ gap: 'var(--sp-4)' }}>
                <div className="ui-error" role="alert">
                  Link inválido ou expirado. Peça um novo link em “Esqueci minha senha”.
                </div>
                <Link to="/login" className="ui-btn ui-btn-secondary">Voltar para o login</Link>
              </div>
            ) : (
              <form className="stack" style={{ gap: 'var(--sp-4)' }} onSubmit={salvar} noValidate>
                {perfil?.email && <p className="muted" style={{ margin: 0 }}>Conta: {perfil.email}</p>}
                <Input
                  label="Nova senha"
                  type="password"
                  autoComplete="new-password"
                  value={nova}
                  onChange={(e) => setNova(e.target.value)}
                  hint="Mínimo de 8 caracteres."
                  required
                  autoFocus
                />
                <Input
                  label="Confirmar nova senha"
                  type="password"
                  autoComplete="new-password"
                  value={confirmacao}
                  onChange={(e) => setConfirmacao(e.target.value)}
                  required
                />
                {erro && <div className="ui-error" role="alert">{erro}</div>}
                <Button type="submit" variant="primary" block loading={salvando} disabled={!nova || !confirmacao}>
                  Salvar senha
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
