import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  Pagination,
  Select,
  Table,
  Textarea,
  useToast,
} from '@/components/ui';
import type { Column } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useUnidade } from '@/contexts/UnidadeContext';
import { listEquipamentos, listRegistrosTemperatura, listUltimasTemperaturas, registrarTemperatura } from '@/lib/api';
import { formatarDataHora, formatarRelativo, formatarTemperatura } from '@/lib/format';
import { TIPO_EQUIPAMENTO_ROTULO } from '@/types/database';
import type { Equipamento, RegistroTemperatura, TemperaturaUltima } from '@/types/database';
import '@/pages/etiquetas/etiquetas.css';
import '@/pages/temperaturas/temperaturas.css';

const LIMIT = 30;

function faixa(min: number | null, max: number | null): string {
  if (min != null && max != null) return `${formatarTemperatura(min)} a ${formatarTemperatura(max)}`;
  if (max != null) return `≤ ${formatarTemperatura(max)}`;
  if (min != null) return `≥ ${formatarTemperatura(min)}`;
  return 'Sem limites';
}

function dentro(t: number, min: number | null, max: number | null): boolean {
  if (min != null && t < min) return false;
  if (max != null && t > max) return false;
  return true;
}

function num(s: string): number | null {
  if (!s.trim()) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export default function TemperaturasPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { temPapel } = useAuth();
  const { unidadeId } = useUnidade();

  const [ultimas, setUltimas] = useState<TemperaturaUltima[]>([]);
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [acao, setAcao] = useState<{ eq: TemperaturaUltima; temp: number } | null>(null);
  const [acaoTexto, setAcaoTexto] = useState('');

  const [rows, setRows] = useState<RegistroTemperatura[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [equipamentoId, setEquipamentoId] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [soNc, setSoNc] = useState(false);

  const carregarUltimas = useCallback(async () => {
    try {
      const [u, eqs] = await Promise.all([listUltimasTemperaturas(unidadeId), listEquipamentos(unidadeId)]);
      setUltimas(u);
      setEquipamentos(eqs);
    } catch (err) {
      toast.error(err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidadeId]);

  useEffect(() => setOffset(0), [unidadeId, equipamentoId, de, ate, soNc]);

  const carregarHistorico = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await listRegistrosTemperatura({
        unidadeId,
        equipamentoId: equipamentoId || undefined,
        de: de || undefined,
        ate: ate || undefined,
        somenteNaoConformes: soNc || undefined,
        limit: LIMIT,
        offset,
      });
      setRows(r.data);
      setTotal(r.total);
    } catch (err) {
      toast.error(err);
    } finally {
      setCarregando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidadeId, equipamentoId, de, ate, soNc, offset]);

  useEffect(() => {
    void carregarUltimas();
  }, [carregarUltimas]);
  useEffect(() => {
    void carregarHistorico();
  }, [carregarHistorico]);

  async function enviar(eq: TemperaturaUltima, temp: number, acaoCorretiva: string | null) {
    setSalvandoId(eq.equipamento_id);
    try {
      const r = await registrarTemperatura({
        equipamento_id: eq.equipamento_id,
        temperatura_c: temp,
        acao_corretiva: acaoCorretiva,
      });
      if (r.conforme) toast.success(`${eq.equipamento_nome}: ${formatarTemperatura(temp)} registrado.`);
      else toast.info(`${eq.equipamento_nome}: registro fora da faixa com ação corretiva.`);
      setValores((v) => ({ ...v, [eq.equipamento_id]: '' }));
      setAcao(null);
      setAcaoTexto('');
      void carregarUltimas();
      void carregarHistorico();
    } catch (err) {
      toast.error(err);
    } finally {
      setSalvandoId(null);
    }
  }

  function registrar(eq: TemperaturaUltima) {
    const t = num(valores[eq.equipamento_id] ?? '');
    if (t == null) {
      toast.error('Informe a temperatura.');
      return;
    }
    if (!dentro(t, eq.temp_min_c, eq.temp_max_c)) {
      setAcao({ eq, temp: t });
      setAcaoTexto('');
      return;
    }
    void enviar(eq, t, null);
  }

  const columns: Column<RegistroTemperatura>[] = [
    { key: 'registrado_em', header: 'Data/hora', render: (r) => formatarDataHora(r.registrado_em) },
    {
      key: 'equipamento',
      header: 'Equipamento',
      render: (r) => (
        <div>
          <span style={{ fontWeight: 500 }}>{r.equipamento?.nome ?? '—'}</span>
          {r.equipamento && <span className="fb-sub">{TIPO_EQUIPAMENTO_ROTULO[r.equipamento.tipo]}</span>}
        </div>
      ),
    },
    {
      key: 'temperatura_c',
      header: 'Temperatura',
      align: 'right',
      render: (r) => <strong className={r.conforme ? '' : 'text-danger'}>{formatarTemperatura(r.temperatura_c)}</strong>,
    },
    {
      key: 'conforme',
      header: 'Situação',
      render: (r) => <Badge variant={r.conforme ? 'success' : 'danger'}>{r.conforme ? 'Conforme' : 'Fora da faixa'}</Badge>,
    },
    { key: 'acao_corretiva', header: 'Ação corretiva', render: (r) => r.acao_corretiva ?? '—' },
    { key: 'responsavel', header: 'Responsável', render: (r) => r.responsavel?.nome ?? '—' },
  ];

  return (
    <div className="fb-page">
      <PageHeader
        title="Temperaturas"
        subtitle="Resfriados 0 a 5 °C · congelados ≤ -18 °C · quentes ≥ 60 °C (RDC 216 / CVS-5)."
        actions={
          temPapel('admin', 'gerente') && (
            <Button onClick={() => navigate('/equipamentos')}>Equipamentos</Button>
          )
        }
      />

      {ultimas.length === 0 ? (
        <EmptyState
          title="Nenhum equipamento"
          description="Cadastre geladeiras, freezers e balcões para registrar temperaturas."
          action={
            temPapel('admin', 'gerente') ? (
              <Button variant="primary" onClick={() => navigate('/equipamentos')}>
                Cadastrar equipamentos
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="tmp-grid">
          {ultimas.map((u) => {
            const atrasado = u.horas_desde_registro == null || u.horas_desde_registro > 12;
            const estado = u.conforme == null ? 'sem' : u.conforme ? 'ok' : 'nc';
            return (
              <div key={u.equipamento_id} className={`tmp-card tmp-card--${estado}`}>
                <div className="tmp-card__head">
                  <div style={{ minWidth: 0 }}>
                    <div className="tmp-card__nome">{u.equipamento_nome}</div>
                    <span className="fb-sub">
                      {TIPO_EQUIPAMENTO_ROTULO[u.tipo]} · {faixa(u.temp_min_c, u.temp_max_c)}
                    </span>
                  </div>
                  {estado === 'nc' && <Badge variant="danger">Fora</Badge>}
                  {estado === 'ok' && <Badge variant="success">OK</Badge>}
                </div>
                <div className="tmp-card__valor">
                  {u.temperatura_c != null ? formatarTemperatura(u.temperatura_c) : '—'}
                </div>
                <div className={`fb-sub${atrasado ? ' text-warning' : ''}`}>
                  {u.registrado_em ? `Último registro ${formatarRelativo(u.registrado_em)}` : 'Sem registros'}
                  {atrasado && u.registrado_em ? ' · registrar' : ''}
                </div>
                <form
                  className="tmp-card__form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    registrar(u);
                  }}
                >
                  <Input
                    aria-label={`Temperatura de ${u.equipamento_nome}`}
                    placeholder="°C"
                    inputMode="decimal"
                    value={valores[u.equipamento_id] ?? ''}
                    onChange={(e) => setValores((v) => ({ ...v, [u.equipamento_id]: e.target.value }))}
                  />
                  <Button type="submit" variant="primary" size="sm" loading={salvandoId === u.equipamento_id}>
                    Registrar
                  </Button>
                </form>
              </div>
            );
          })}
        </div>
      )}

      <div>
        <h3 className="fb-section-title">Histórico</h3>
        <div className="stack">
          <div className="fb-filters">
            <Select
              label="Equipamento"
              value={equipamentoId}
              onChange={(e) => setEquipamentoId(e.target.value)}
              placeholder="Todos"
              options={equipamentos.map((e) => ({ value: e.id, label: e.nome }))}
            />
            <Input label="De" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
            <Input label="Até" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
            <Checkbox label="Somente fora da faixa" checked={soNc} onChange={(e) => setSoNc(e.target.checked)} />
          </div>
          <Table columns={columns} rows={rows} rowKey={(r) => r.id} loading={carregando} compact empty="Sem registros no período." />
          {total > LIMIT && <Pagination total={total} limit={LIMIT} offset={offset} onChange={setOffset} />}
        </div>
      </div>

      <Modal
        open={!!acao}
        onClose={() => setAcao(null)}
        title="Temperatura fora da faixa"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAcao(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              disabled={!acaoTexto.trim()}
              loading={!!acao && salvandoId === acao.eq.equipamento_id}
              onClick={() => acao && enviar(acao.eq, acao.temp, acaoTexto.trim())}
            >
              Registrar com ação corretiva
            </Button>
          </>
        }
      >
        {acao && (
          <div className="stack">
              <p style={{ margin: 0 }}>
                <strong>{acao.eq.equipamento_nome}</strong>: {formatarTemperatura(acao.temp)} — faixa{' '}
                {faixa(acao.eq.temp_min_c, acao.eq.temp_max_c)}.
              </p>
              <Textarea
                label="Ação corretiva (obrigatória)"
                rows={3}
                value={acaoTexto}
                onChange={(e) => setAcaoTexto(e.target.value)}
                placeholder="Ex.: porta ajustada, produtos transferidos para a câmara, nova medição em 30 min."
              />
          </div>
        )}
      </Modal>
    </div>
  );
}
