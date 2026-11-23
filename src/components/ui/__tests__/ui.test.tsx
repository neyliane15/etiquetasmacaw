import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Badge, Button, Modal } from '@/components/ui';

describe('Button', () => {
  it('padrão type=button, variante e clique', () => {
    const onClick = vi.fn();
    render(<Button variant="primary" onClick={onClick}>Salvar</Button>);
    const b = screen.getByRole('button', { name: 'Salvar' });
    expect(b).toHaveAttribute('type', 'button');
    expect(b).toHaveClass('ui-btn', 'ui-btn-primary');
    fireEvent.click(b);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
  it('loading desabilita e marca aria-busy', () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Enviar</Button>);
    const b = screen.getByRole('button', { name: /Enviar/ });
    expect(b).toBeDisabled();
    expect(b).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('Badge', () => {
  it('aplica a variante', () => {
    render(<Badge variant="danger">Vencida</Badge>);
    expect(screen.getByText('Vencida')).toHaveClass('ui-badge-danger');
  });
});

describe('Modal', () => {
  it('fechado não renderiza; aberto tem role dialog com título; Esc e X fecham', () => {
    const onClose = vi.fn();
    const { rerender } = render(<Modal open={false} onClose={onClose} title="Baixa">conteúdo</Modal>);
    expect(screen.queryByRole('dialog')).toBeNull();
    rerender(<Modal open onClose={onClose} title="Baixa">conteúdo</Modal>);
    const dlg = screen.getByRole('dialog', { name: 'Baixa' });
    expect(dlg).toHaveAttribute('aria-modal', 'true');
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
