import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const h = vi.hoisted(() => ({ auth: { userId: null as string | null, perfil: null, carregando: false }, atualizar: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => h.auth }));
vi.mock('@/lib/api/auth', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/auth')>()),
  atualizarSenha: h.atualizar,
}));
vi.mock('@/components/ui', async (orig) => ({
  ...(await orig<typeof import('@/components/ui')>()),
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

import RedefinirSenhaPage from '@/pages/RedefinirSenhaPage';

function renderizar() {
  return render(
    <MemoryRouter initialEntries={['/redefinir-senha']}>
      <Routes>
        <Route path="/redefinir-senha" element={<RedefinirSenhaPage />} />
        <Route path="/" element={<div>PAINEL</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RedefinirSenhaPage (bug #7)', () => {
  beforeEach(() => h.atualizar.mockReset());
  it('sem sessão do link → link inválido', () => {
    h.auth = { userId: null, perfil: null, carregando: false };
    renderizar();
    expect(screen.getByRole('alert').textContent).toMatch(/inválido ou expirado/);
  });
  it('com sessão → define a senha e vai ao painel', async () => {
    h.auth = { userId: 'u1', perfil: null, carregando: false };
    h.atualizar.mockResolvedValue(undefined);
    renderizar();
    fireEvent.change(screen.getByLabelText(/^Nova senha/), { target: { value: 'segura123' } });
    fireEvent.change(screen.getByLabelText(/^Confirmar nova senha/), { target: { value: 'segura123' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar senha/ }));
    await waitFor(() => expect(screen.getByText('PAINEL')).toBeTruthy());
    expect(h.atualizar).toHaveBeenCalledWith('segura123');
  });
  it('senhas diferentes não chamam a API', () => {
    h.auth = { userId: 'u1', perfil: null, carregando: false };
    renderizar();
    fireEvent.change(screen.getByLabelText(/^Nova senha/), { target: { value: 'segura123' } });
    fireEvent.change(screen.getByLabelText(/^Confirmar nova senha/), { target: { value: 'outra1234' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar senha/ }));
    expect(screen.getByRole('alert').textContent).toMatch(/não conferem/);
    expect(h.atualizar).not.toHaveBeenCalled();
  });
});
