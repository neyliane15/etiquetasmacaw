import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import type { Location } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabaseConfigurado } from '@/lib/supabase';
import { enviarResetSenha } from '@/lib/api/auth';
import { Button, Input, useToast } from '@/components/ui';
import { Logo } from '@/components/layout/Logo';

export default function LoginPage(): JSX.Element {
  const { userId, perfil, carregando, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const from = (location.state as { from?: Location } | null)?.from;
  const destino = from && from.pathname !== '/login' ? `${from.pathname}${from.search ?? ''}` : '/';

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [modoReset, setModoReset] = useState(false);

  useEffect(() => {
    document.title = 'Entrar · Etiquetas Macaw';
  }, []);

  if (!carregando && userId && perfil) return <Navigate to={destino} replace />;

  const entrar = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await signIn(email.trim(), senha);
      navigate(destino, { replace: true });
    } catch (err) {
      setErro(err instanceof Error && err.message ? err.message : 'Não foi possível entrar. Verifique e-mail e senha.');
    } finally {
      setEnviando(false);
    }
  };

  const resetar = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await enviarResetSenha(email.trim());
      toast.success('Enviamos um link de redefinição para o seu e-mail.');
      setModoReset(false);
    } catch (err) {
      setErro(err instanceof Error && err.message ? err.message : 'Não foi possível enviar o e-mail.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="login-page">
      <div style={{ width: '100%', maxWidth: 340 }}>
        <div className="login-card">
          <div className="login-brand">
            <Logo size={64} title="Macaw" />
            <span className="login-brand-name">Macaw</span>
            <span className="login-brand-sub">Etiquetas · Segurança de alimentos</span>
          </div>
          <div className="login-body">
            {!supabaseConfigurado && (
              <div className="ui-toast ui-toast-error" style={{ marginBottom: 'var(--sp-4)', boxShadow: 'none', animation: 'none' }} role="alert">
                <span className="ui-toast-msg">
                  Supabase não configurado. Defina <span className="mono">VITE_SUPABASE_URL</span> e{' '}
                  <span className="mono">VITE_SUPABASE_ANON_KEY</span> no arquivo <span className="mono">.env</span>.
                </span>
              </div>
            )}
            <form className="stack" style={{ gap: 'var(--sp-4)' }} onSubmit={modoReset ? resetar : entrar} noValidate>
              <Input
                label="E-mail"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
              {!modoReset && (
                <Input
                  label="Senha"
                  type="password"
                  autoComplete="current-password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  required
                />
              )}
              {erro && <div className="ui-error" role="alert">{erro}</div>}
              <Button
                type="submit"
                variant="primary"
                block
                loading={enviando}
                disabled={!supabaseConfigurado || !email || (!modoReset && !senha)}
              >
                {modoReset ? 'Enviar link de redefinição' : 'Entrar'}
              </Button>
              <div style={{ textAlign: 'center' }}>
                <button type="button" className="login-link" onClick={() => { setModoReset((v) => !v); setErro(null); }}>
                  {modoReset ? 'Voltar para o login' : 'Esqueci minha senha'}
                </button>
              </div>
            </form>
          </div>
        </div>
        <p className="login-foot">Macaw Camboinhas · Macaw Búzios</p>
      </div>
    </div>
  );
}
