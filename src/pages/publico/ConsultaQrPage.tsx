import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { Logo } from '@/components/layout/Logo';
import { useAuth } from '@/contexts/AuthContext';
import { consultarEtiquetaPublica, getEtiquetaPorCodigo } from '@/lib/api';
import { formatarDataHora, formatarRelativo, normalizarCodigo, rotuloSituacao } from '@/lib/format';
import { FAIXA_METODO, METODO_ROTULO, TIPO_ETIQUETA_ROTULO } from '@/types/database';
import type { EtiquetaPublica, SituacaoEtiqueta } from '@/types/database';
import { textoAlergenicos } from '@/components/label/labelFields';
import '@/pages/publico/publico.css';

function destaque(s: SituacaoEtiqueta): { texto: string; tom: 'danger' | 'warning' | 'success' | 'neutral' } {
  switch (s) {
    case 'vencida':
      return { texto: 'VENCIDA', tom: 'danger' };
    case 'vence_hoje':
    case 'vence_24h':
    case 'vence_72h':
      return { texto: 'A VENCER', tom: 'warning' };
    case 'ok':
      return { texto: 'DENTRO DO PRAZO', tom: 'success' };
    default:
      return { texto: 'BAIXADA', tom: 'neutral' };
  }
}

export default function ConsultaQrPage() {
  const { codigo: param = '' } = useParams();
  const navigate = useNavigate();
  const { userId } = useAuth();
  const codigo = normalizarCodigo(param);
  const [etq, setEtq] = useState<EtiquetaPublica | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [abrindo, setAbrindo] = useState(false);

  useEffect(() => {
    document.title = `Etiqueta ${codigo} · Macaw`;
    let vivo = true;
    setCarregando(true);
    consultarEtiquetaPublica(codigo)
      .then((r) => {
        if (vivo) {
          setEtq(r);
          setErro(false);
        }
      })
      .catch(() => {
        if (vivo) setErro(true);
      })
      .finally(() => {
        if (vivo) setCarregando(false);
      });
    return () => {
      vivo = false;
    };
  }, [codigo]);

  async function abrir() {
    setAbrindo(true);
    try {
      const e = await getEtiquetaPorCodigo(codigo);
      if (e) navigate(`/etiquetas/${e.id}`);
      else setAbrindo(false);
    } catch {
      setAbrindo(false);
    }
  }

  const d = etq ? destaque(etq.situacao) : null;

  return (
    <div className="qr-page">
      <main className="qr-card">
        <header className="qr-head">
          <Logo size={34} className="qr-logo" title="Macaw" />
          <div>
            <div className="qr-marca">Macaw</div>
            <div className="qr-sub">Consulta de etiqueta</div>
          </div>
        </header>

        {carregando ? (
          <div style={{ padding: 'var(--sp-7) 0' }}>
            <Spinner label="Consultando…" />
          </div>
        ) : erro || !etq || !d ? (
          <EmptyState
            title={erro ? 'Não foi possível consultar' : 'Etiqueta não encontrada'}
            description={
              <>
                Código <span className="qr-codigo">{codigo || '—'}</span>
                {erro ? ' — verifique a conexão e tente novamente.' : ' não corresponde a nenhuma etiqueta.'}
              </>
            }
          />
        ) : (
          <>
            <h1 className="qr-produto">{etq.produto_nome}</h1>
            <div className={`qr-status qr-status--${d.tom}`} role="status">
              <strong>{d.texto}</strong>
              <span>{rotuloSituacao(etq.situacao)}</span>
            </div>

            <dl className="qr-dados">
              <div className="qr-dados__val">
                <dt>Validade</dt>
                <dd>
                  {formatarDataHora(etq.data_validade)}
                  {etq.status === 'ativa' && <small>{formatarRelativo(etq.data_validade)}</small>}
                </dd>
              </div>
              <div>
                <dt>Manipulação</dt>
                <dd>{formatarDataHora(etq.data_manipulacao)}</dd>
              </div>
              <div>
                <dt>Conservação</dt>
                <dd>
                  {METODO_ROTULO[etq.metodo]}
                  <small>{FAIXA_METODO[etq.metodo]}</small>
                </dd>
              </div>
              <div>
                <dt>Tipo</dt>
                <dd>{TIPO_ETIQUETA_ROTULO[etq.tipo]}</dd>
              </div>
              <div>
                <dt>Unidade</dt>
                <dd>{etq.unidade_nome}</dd>
              </div>
              {etq.lote && (
                <div>
                  <dt>Lote</dt>
                  <dd>{etq.lote}</dd>
                </div>
              )}
              {etq.responsavel_primeiro_nome && (
                <div>
                  <dt>Responsável</dt>
                  <dd>{etq.responsavel_primeiro_nome}</dd>
                </div>
              )}
              <div>
                <dt>Código</dt>
                <dd className="qr-codigo">{etq.codigo}</dd>
              </div>
            </dl>

            {etq.alergenicos.length > 0 && (
              <div className="qr-alerg">
                <span>Alergênicos</span>
                {textoAlergenicos(etq.alergenicos)}
              </div>
            )}

            {userId && (
              <Button variant="primary" block loading={abrindo} onClick={abrir}>
                Abrir no sistema
              </Button>
            )}
          </>
        )}
      </main>
      <footer className="qr-foot">Etiquetas Macaw · segurança de alimentos (RDC 216/2004)</footer>
    </div>
  );
}
