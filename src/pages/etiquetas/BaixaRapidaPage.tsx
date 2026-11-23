import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, Checkbox, EmptyState, Input, PageHeader, Select, useToast } from '@/components/ui';
import { darBaixa, getEtiquetaPorCodigo } from '@/lib/api';
import {
  corSituacao,
  formatarDataCurta,
  formatarDataHora,
  formatarQuantidade,
  formatarRelativo,
  normalizarCodigo,
  rotuloSituacao,
} from '@/lib/format';
import { METODO_ROTULO, MOTIVO_DESCARTE_ROTULO, STATUS_ROTULO, TIPO_ETIQUETA_ROTULO } from '@/types/database';
import type { EtiquetaDetalhe, MotivoDescarte } from '@/types/database';
import { textoAlergenicos } from '@/components/label/labelFields';
import '@/pages/etiquetas/etiquetas.css';

interface Registro {
  codigo: string;
  produto: string;
  acao: 'consumida' | 'descartada';
  em: Date;
}

const MOTIVOS = Object.entries(MOTIVO_DESCARTE_ROTULO).map(([value, label]) => ({ value, label }));

export default function BaixaRapidaPage() {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [codigo, setCodigo] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [etiqueta, setEtiqueta] = useState<EtiquetaDetalhe | null>(null);
  const [naoEncontrado, setNaoEncontrado] = useState<string | null>(null);
  const [motivo, setMotivo] = useState<MotivoDescarte>('outro');
  const [salvando, setSalvando] = useState<'consumida' | 'descartada' | null>(null);
  const [automatico, setAutomatico] = useState(false);
  const [historico, setHistorico] = useState<Registro[]>([]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function focar() {
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function buscar(valor: string) {
    const c = normalizarCodigo(valor);
    if (!c) return;
    setBuscando(true);
    setNaoEncontrado(null);
    try {
      const e = await getEtiquetaPorCodigo(c);
      if (!e) {
        setEtiqueta(null);
        setNaoEncontrado(c);
      } else {
        setEtiqueta(e);
        const vencida = e.situacao === 'vencida' || e.status === 'vencida';
        setMotivo(vencida ? 'vencido' : 'outro');
        if (automatico && (e.status === 'ativa' || e.status === 'vencida')) {
          await baixar('consumida', e);
        }
      }
    } catch (err) {
      toast.error(err);
    } finally {
      setBuscando(false);
      setCodigo('');
      focar();
    }
  }

  async function baixar(status: 'consumida' | 'descartada', alvo: EtiquetaDetalhe | null = etiqueta) {
    if (!alvo) return;
    setSalvando(status);
    try {
      await darBaixa(alvo.id, status === 'descartada' ? { status, motivo } : { status });
      setHistorico((h) => [
        { codigo: alvo.codigo, produto: alvo.produto_nome, acao: status, em: new Date() },
        ...h.slice(0, 19),
      ]);
      toast.success(`${alvo.codigo} · ${status === 'consumida' ? 'consumida' : 'descartada'}.`);
      setEtiqueta(null);
    } catch (err) {
      toast.error(err);
    } finally {
      setSalvando(null);
      focar();
    }
  }

  const e = etiqueta;
  const podeBaixar = e && (e.status === 'ativa' || e.status === 'vencida');

  return (
    <div className="fb-page">
      <PageHeader
        title="Baixa rápida"
        subtitle="Digite o código ou leia o QR com o leitor (funciona como teclado)."
        back="/etiquetas"
      />

      <Card>
        <form
          className="stack"
          onSubmit={(ev) => {
            ev.preventDefault();
            void buscar(codigo);
          }}
        >
          <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 260px' }}>
              <Input
                ref={inputRef}
                label="Código da etiqueta"
                className="fb-scan"
                value={codigo}
                onChange={(ev) => setCodigo(ev.target.value)}
                placeholder="Ex.: 7KQ2M9XA"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
              />
            </div>
            <Button type="submit" variant="primary" loading={buscando}>
              Buscar
            </Button>
          </div>
          <Checkbox
            label="Modo contínuo: marcar como consumida automaticamente ao ler"
            checked={automatico}
            onChange={(ev) => setAutomatico(ev.target.checked)}
          />
        </form>
      </Card>

      {naoEncontrado && (
        <EmptyState
          title="Código não encontrado"
          description={
            <>
              Nenhuma etiqueta com o código <span className="fb-code">{naoEncontrado}</span> nas unidades a que você
              tem acesso.
            </>
          }
        />
      )}

      {e && (
        <Card
          title={
            <span className="row" style={{ gap: 'var(--sp-3)' }}>
              <span>{e.produto_nome}</span>
              <Badge variant={corSituacao(e.situacao)}>{rotuloSituacao(e.situacao)}</Badge>
            </span>
          }
          actions={<Link to={`/etiquetas/${e.id}`}>Detalhes</Link>}
        >
          <div className="stack" style={{ gap: 'var(--sp-4)' }}>
            <dl className="fb-kv">
              <div>
                <dt>Código</dt>
                <dd className="fb-code">{e.codigo}</dd>
              </div>
              <div>
                <dt>Tipo / método</dt>
                <dd>
                  {TIPO_ETIQUETA_ROTULO[e.tipo]} · {METODO_ROTULO[e.metodo]}
                </dd>
              </div>
              <div>
                <dt>Validade</dt>
                <dd>
                  <strong>{formatarDataCurta(e.data_validade)}</strong>
                  <span className="fb-sub">{formatarRelativo(e.data_validade)}</span>
                </dd>
              </div>
              <div>
                <dt>Manipulação</dt>
                <dd>{formatarDataHora(e.data_manipulacao)}</dd>
              </div>
              <div>
                <dt>Quantidade</dt>
                <dd>{e.quantidade != null ? formatarQuantidade(e.quantidade, e.unidade_medida) : '—'}</dd>
              </div>
              <div>
                <dt>Unidade</dt>
                <dd>{e.unidade_nome}</dd>
              </div>
              <div>
                <dt>Lote</dt>
                <dd>{e.lote ?? '—'}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{STATUS_ROTULO[e.status]}</dd>
              </div>
            </dl>
            {e.alergenicos.length > 0 && <div className="muted">{textoAlergenicos(e.alergenicos)}</div>}

            {podeBaixar ? (
              <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <Button
                  variant="success"
                  loading={salvando === 'consumida'}
                  disabled={!!salvando}
                  onClick={() => baixar('consumida')}
                >
                  Consumida
                </Button>
                <div style={{ minWidth: 200 }}>
                  <Select
                    label="Motivo do descarte"
                    value={motivo}
                    onChange={(ev) => setMotivo(ev.target.value as MotivoDescarte)}
                    options={MOTIVOS}
                  />
                </div>
                <Button
                  variant="danger"
                  loading={salvando === 'descartada'}
                  disabled={!!salvando}
                  onClick={() => baixar('descartada')}
                >
                  Descartar
                </Button>
                <Button variant="ghost" onClick={() => setEtiqueta(null)}>
                  Cancelar
                </Button>
              </div>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                Esta etiqueta já foi baixada ({STATUS_ROTULO[e.status].toLowerCase()}
                {e.status_em ? ` em ${formatarDataHora(e.status_em)}` : ''}).
              </p>
            )}
          </div>
        </Card>
      )}

      {historico.length > 0 && (
        <Card title="Baixas desta sessão" padding="sm">
          <ul className="fb-timeline">
            {historico.map((h, i) => (
              <li key={`${h.codigo}-${i}`}>
                <span className="fb-code">{h.codigo}</span> · {h.produto} ·{' '}
                <Badge variant={h.acao === 'consumida' ? 'success' : 'danger'}>
                  {h.acao === 'consumida' ? 'Consumida' : 'Descartada'}
                </Badge>{' '}
                <span className="muted">{formatarDataHora(h.em)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
