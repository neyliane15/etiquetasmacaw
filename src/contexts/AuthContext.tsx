import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { PapelUsuario, Perfil, UUID } from '@/types/database';
import * as authApi from '@/lib/api/auth';

export interface AuthContextValue {
  userId: UUID | null;
  perfil: Perfil | null;
  carregando: boolean;
  signIn(email: string, senha: string): Promise<void>;
  signOut(): Promise<void>;
  recarregarPerfil(): Promise<void>;
  temPapel(...papeis: PapelUsuario[]): boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [userId, setUserId] = useState<UUID | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [carregando, setCarregando] = useState(true);
  const atualId = useRef<UUID | null>(null);

  const carregarPerfil = useCallback(async (uid: UUID | null) => {
    atualId.current = uid;
    if (!uid) {
      setUserId(null);
      setPerfil(null);
      return;
    }
    try {
      const p = await authApi.getPerfilAtual();
      if (atualId.current !== uid) return;
      setUserId(uid);
      setPerfil(p);
    } catch (e) {
      console.error('Falha ao carregar perfil', e);
      if (atualId.current !== uid) return;
      setUserId(uid);
      setPerfil(null);
    }
  }, []);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const uid = await authApi.getSessionUserId();
        if (ativo) await carregarPerfil(uid);
      } catch (e) {
        console.error('Falha ao obter sessão', e);
      } finally {
        if (ativo) setCarregando(false);
      }
    })();

    let unsub: (() => void) | undefined;
    try {
      unsub = authApi.onAuthChange((uid) => {
        if (uid === atualId.current) return;
        setCarregando(true);
        void carregarPerfil(uid).finally(() => setCarregando(false));
      });
    } catch (e) {
      console.error(e);
    }
    return () => {
      ativo = false;
      unsub?.();
    };
  }, [carregarPerfil]);

  const signIn = useCallback(
    async (email: string, senha: string) => {
      await authApi.signIn(email, senha);
      const uid = await authApi.getSessionUserId();
      await carregarPerfil(uid);
    },
    [carregarPerfil],
  );

  const signOut = useCallback(async () => {
    try {
      await authApi.signOut();
    } finally {
      await carregarPerfil(null);
    }
  }, [carregarPerfil]);

  const recarregarPerfil = useCallback(async () => {
    await carregarPerfil(atualId.current);
  }, [carregarPerfil]);

  const temPapel = useCallback((...papeis: PapelUsuario[]) => !!perfil && perfil.ativo && papeis.includes(perfil.papel), [perfil]);

  const value = useMemo<AuthContextValue>(
    () => ({ userId, perfil, carregando, signIn, signOut, recarregarPerfil, temPapel }),
    [userId, perfil, carregando, signIn, signOut, recarregarPerfil, temPapel],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>.');
  return ctx;
}
