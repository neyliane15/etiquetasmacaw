import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, subDays } from 'date-fns';
import { Badge, Button, Card, Input, PageHeader, Spinner, StatCard, Table, Tabs, useToast } from '@/components/ui';
import type { Column } from '@/components/ui';
import { useUnidade } from '@/contexts/UnidadeContext';
import { baixarCsv, listRegistrosTemperatura, relatorioDesperdicio, relatorioEtiquetas, toCsv } from '@/lib/api';
import { formatarData, formatarDataHora, formatarMoeda, formatarTemperatura } from '@/lib/format';
import { MOTIVO_DESCARTE_ROTULO, TIPO_EQUIPAMENTO_ROTULO } from '@/types/database';
import type { DesperdicioLinha, MotivoDescarte, RegistroTemperatura, RelatorioEtiquetaLinha } from '@/types/database';
import '@/pages/etiquetas/etiquetas.css';
import '@/pages/relatorios/relatorios.css';

type Aba = 'desperdicio' | 'etiquetas' | 'temperaturas';

const kg = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg`;
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—');

function rotuloChave(l: DesperdicioLinha): string {
  if (l.agrupador === 'motivo') return MOTIVO_DESCARTE_ROTULO[l.chave as MotivoDescarte] ?? l.chave;
  if (l.agrupador === 'dia') return formatarData(l.chave);
  return l.chave || '—';
}

interface TempResumo {
  id: string;
  nome: string;
  tipo: string;
  registros: number;
  naoConformes: number;
  min: number;
  max: number;
  media: number;
}

export default function RelatoriosPage() {
  const toast = useToast();
  const { unidadeId, unidadeAtual } = useUnidade();
  const [aba, setAba] = useState<Aba>('desperdicio');
  const [de, setDe] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [ate, setAte] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [carregando, setCarregando] = useState(false);

  const [desp, setDesp] = useState<DesperdicioLinha[]>([]);
  const [etq, setEtq] = useState<RelatorioEtiquetaLinha[]>([]);
  const [temps, setTemps] = useState<RegistroTemperatura[]>([]);
  const [tempsTotal, setTempsTotal] = useState(0);

  const escopo = unidadeAtual?.nome ?? 'Todas as unidades';
  const sufixo = `${unidadeAtual?.slug ?? 'todas'}_${de}_${ate}`;

  const carregar = useCallback(async () => {
    if (!de || !ate || de > ate) return;
    setCarregando(true);
    try {
      if (aba === 'desperdicio') setDesp(await relatorioDesperdicio(unidadeId, de, ate));
      else if (aba === 'etiquetas') setEtq(await relatorioEtiquetas(unidadeId, de, ate));
      else {
        const r = await listRegistrosTemperatura({ unidadeId, de, ate, limit: 1000 });
        setTemps(r.data);
        setTempsTotal(r.total);
      }
    } catch (err) {
      toast.error(err);
    } finally {
      setCarregando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba, unidadeId, de, ate]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // ---------- Desperdício ----------
  const grupos = useMemo(() => {
    const g: Record<DesperdicioLinha['agrupador'], DesperdicioLinha[]> = { motivo: [], produto: [], categoria: [], dia: [] };
    for (const l of desp) g[l.agrupador]?.push(l);
    g.motivo.sort((a, b) => b.total_peso_kg - a.total_peso_kg || b.total_custo - a.total_custo);
    g.produto.sort((a, b) => b.total_custo - a.total_custo || b.total_peso_kg - a.total_peso_kg);
    g.categoria.sort((a, b) => b.total_peso_kg - a.total_peso_kg);
    g.dia.sort((a, b) => a.chave.localeCompare(b.chave));
    return g;
  }, [desp]);
  const totDesp = useMemo(
    () =>
      grupos.motivo.reduce(
        (s, l) => ({ peso: s.peso + Number(l.total_peso_kg || 0), custo: s.custo + Number(l.total_custo || 0), n: s.n + l.registros }),
        { peso: 0, custo: 0, n: 0 },
      ),
    [grupos],
  );

  function tabelaDesp(titulo: string, linhas: DesperdicioLinha[], max = 12) {
    const maxPeso = Math.max(...linhas.map((l) => Number(l.total_peso_kg || 0)), 0);
    const cols: Column<DesperdicioLinha>[] = [
      { key: 'chave', header: titulo, render: rotuloChave },
      {
        key: 'bar',
        header: '',
        width: 90,
        render: (l) => (
          <div className="fb-bar" aria-hidden="true">
            <span style={{ width: `${maxPeso ? (Number(l.total_peso_kg || 0) / maxPeso) * 100 : 0}%` }} />
          </div>
        ),
      },
      { key: 'total_peso_kg', header: 'Peso', align: 'right', render: (l) => kg(Number(l.total_peso_kg || 0)) },
      { key: 'total_custo', header: 'Custo', align: 'right', render: (l) => formatarMoeda(Number(l.total_custo || 0)) },
      { key: 'registros', header: 'Reg.', align: 'right' },
    ];
    return (
      <Card title={titulo} padding="none">
        <Table
          columns={cols}
          rows={linhas.slice(0, max)}
          rowKey={(l) => `${l.agrupador}-${l.chave}`}
          compact
          empty="Sem dados."
        />
      </Card>
    );
  }

  function exportarDesp() {
    const csv = toCsv(
      desp.map((l) => ({ ...l, chave: rotuloChave(l) })) as unknown as Record<string, unknown>[],
      [
        { chave: 'agrupador', titulo: 'Agrupador' },
        { chave: 'chave', titulo: 'Chave' },
        { chave: 'total_peso_kg', titulo: 'Peso (kg)' },
        { chave: 'total_custo', titulo: 'Custo (R$)' },
        { chave: 'registros', titulo: 'Registros' },
      ],
    );
    baixarCsv(`desperdicio_${sufixo}.csv`, csv);
  }

  // ---------- Etiquetas ----------
  const totEtq = useMemo(
    () =>
      etq.reduce(
        (s, l) => ({
          emitidas: s.emitidas + l.emitidas,
          consumidas: s.consumidas + l.consumidas,
          descartadas: s.descartadas + l.descartadas,
          vencidas: s.vencidas + l.vencidas,
          ativas: s.ativas + l.ativas,
        }),
        { emitidas: 0, consumidas: 0, descartadas: 0, vencidas: 0, ativas: 0 },
      ),
    [etq],
  );
  const colsEtq: Column<RelatorioEtiquetaLinha>[] = [
    { key: 'produto_nome', header: 'Produto' },
    { key: 'emitidas', header: 'Emitidas', align: 'right' },
    { key: 'consumidas', header: 'Consumidas', align: 'right' },
    { key: 'descartadas', header: 'Descartadas', align: 'right' },
    { key: 'vencidas', header: 'Vencidas', align: 'right' },
    { key: 'ativas', header: 'Ativas', align: 'right' },
    {
      key: 'perda',
      header: 'Perda',
      align: 'right',
      render: (l) => {
        const p = l.emitidas ? (l.descartadas + l.vencidas) / l.emitidas : 0;
        return <Badge variant={p > 0.2 ? 'danger' : p > 0.05 ? 'warning' : 'success'}>{pct(l.descartadas + l.vencidas, l.emitidas)}</Badge>;
      },
    },
  ];
  function exportarEtq() {
    baixarCsv(
      `etiquetas_${sufixo}.csv`,
      toCsv(etq as unknown as Record<string, unknown>[], [
        { chave: 'produto_nome', titulo: 'Produto' },
        { chave: 'emitidas', titulo: 'Emitidas' },
        { chave: 'consumidas', titulo: 'Consumidas' },
        { chave: 'descartadas', titulo: 'Descartadas' },
        { chave: 'vencidas', titulo: 'Vencidas' },
        { chave: 'ativas', titulo: 'Ativas' },
      ]),
    );
  }

  // ---------- Temperaturas ----------
  const resumoTemp = useMemo<TempResumo[]>(() => {
    const m = new Map<string, TempResumo & { soma: number }>();
    for (const r of temps) {
      const id = r.equipamento_id;
      const t = Number(r.temperatura_c);
      const cur = m.get(id) ?? {
        id,
        nome: r.equipamento?.nome ?? '—',
        tipo: r.equipamento ? TIPO_EQUIPAMENTO_ROTULO[r.equipamento.tipo] : '',
        registros: 0,
        naoConformes: 0,
        min: t,
        max: t,
        media: 0,
        soma: 0,
      };
      cur.registros += 1;
      if (!r.conforme) cur.naoConformes += 1;
      cur.min = Math.min(cur.min, t);
      cur.max = Math.max(cur.max, t);
      cur.soma += t;
      cur.media = cur.soma / cur.registros;
      m.set(id, cur);
    }
    return [...m.values()].sort((a, b) => b.naoConformes - a.naoConformes || a.nome.localeCompare(b.nome));
  }, [temps]);
  const ncTemps = temps.filter((t) => !t.conforme);
  const colsTemp: Column<TempResumo>[] = [
    {
      key: 'nome',
      header: 'Equipamento',
      render: (r) => (
        <div>
          {r.nome}
          <span className="fb-sub">{r.tipo}</span>
        </div>
      ),
    },
    { key: 'registros', header: 'Registros', align: 'right' },
    {
      key: 'naoConformes',
      header: 'Fora da faixa',
      align: 'right',
      render: (r) => (r.naoConformes ? <span className="text-danger">{r.naoConformes}</span> : '0'),
    },
    {
      key: 'conf',
      header: 'Conformidade',
      align: 'right',
      render: (r) => {
        const p = r.registros ? (r.registros - r.naoConformes) / r.registros : 1;
        return <Badge variant={p >= 0.98 ? 'success' : p >= 0.9 ? 'warning' : 'danger'}>{pct(r.registros - r.naoConformes, r.registros)}</Badge>;
      },
    },
    { key: 'min', header: 'Mín.', align: 'right', render: (r) => formatarTemperatura(r.min) },
    { key: 'media', header: 'Média', align: 'right', render: (r) => formatarTemperatura(r.media) },
    { key: 'max', header: 'Máx.', align: 'right', render: (r) => formatarTemperatura(r.max) },
  ];
  const colsNc: Column<RegistroTemperatura>[] = [
    { key: 'registrado_em', header: 'Data/hora', render: (r) => formatarDataHora(r.registrado_em) },
    { key: 'equipamento', header: 'Equipamento', render: (r) => r.equipamento?.nome ?? '—' },
    { key: 'temperatura_c', header: 'Temp.', align: 'right', render: (r) => <span className="text-danger">{formatarTemperatura(r.temperatura_c)}</span> },
    { key: 'acao_corretiva', header: 'Ação corretiva', render: (r) => r.acao_corretiva ?? '—' },
    { key: 'responsavel', header: 'Responsável', render: (r) => r.responsavel?.nome ?? '—' },
  ];
  function exportarTemp() {
    baixarCsv(
      `temperaturas_${sufixo}.csv`,
      toCsv(
        temps.map((r) => ({
          registrado_em: formatarDataHora(r.registrado_em),
          equipamento: r.equipamento?.nome ?? '',
          temperatura_c: r.temperatura_c,
          conforme: r.conforme ? 'sim' : 'não',
          acao_corretiva: r.acao_corretiva ?? '',
          responsavel: r.responsavel?.nome ?? '',
        })),
        [
          { chave: 'registrado_em', titulo: 'Data/hora' },
          { chave: 'equipamento', titulo: 'Equipamento' },
          { chave: 'temperatura_c', titulo: 'Temperatura (°C)' },
          { chave: 'conforme', titulo: 'Conforme' },
          { chave: 'acao_corretiva', titulo: 'Ação corretiva' },
          { chave: 'responsavel', titulo: 'Responsável' },
        ],
      ),
    );
  }

  const exportar = aba === 'desperdicio' ? exportarDesp : aba === 'etiquetas' ? exportarEtq : exportarTemp;
  const vazio = aba === 'desperdicio' ? !desp.length : aba === 'etiquetas' ? !etq.length : !temps.length;

  return (
    <div className="fb-page">
      <PageHeader
        title="Relatórios"
        subtitle={escopo}
        actions={
          <Button onClick={exportar} disabled={carregando || vazio}>
            Exportar CSV
          </Button>
        }
      />

      <div className="fb-filters">
        <Input label="De" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        <Input label="Até" type="date" value={ate} onChange={(e) => setAte(e.target.value)} error={de > ate ? 'Período inválido' : undefined} />
        <div className="fb-presets" style={{ alignSelf: 'flex-end', paddingBottom: 4 }}>
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              className="fb-chip"
              onClick={() => {
                setDe(format(subDays(new Date(), d), 'yyyy-MM-dd'));
                setAte(format(new Date(), 'yyyy-MM-dd'));
              }}
            >
              {d} dias
            </button>
          ))}
        </div>
      </div>

      <Tabs
        tabs={[
          { id: 'desperdicio', label: 'Desperdício' },
          { id: 'etiquetas', label: 'Etiquetas' },
          { id: 'temperaturas', label: 'Temperaturas' },
        ]}
        active={aba}
        onChange={(id) => setAba(id as Aba)}
      />

      {carregando ? (
        <Spinner label="Gerando relatório…" />
      ) : aba === 'desperdicio' ? (
        <>
          <div className="rel-stats">
            <StatCard label="Peso descartado" value={kg(totDesp.peso)} tone="danger" />
            <StatCard label="Custo estimado" value={formatarMoeda(totDesp.custo)} tone="warning" />
            <StatCard label="Registros" value={totDesp.n} tone="neutral" />
            <StatCard
              label="Média diária"
              value={kg(grupos.dia.length ? totDesp.peso / grupos.dia.length : 0)}
              hint={`${grupos.dia.length} dia(s) com descarte`}
              tone="olive"
            />
          </div>
          <div className="rel-grid">
            {tabelaDesp('Motivo', grupos.motivo)}
            {tabelaDesp('Categoria', grupos.categoria)}
            {tabelaDesp('Produto (maior custo)', grupos.produto, 15)}
            {tabelaDesp('Dia', grupos.dia, 62)}
          </div>
        </>
      ) : aba === 'etiquetas' ? (
        <>
          <div className="rel-stats">
            <StatCard label="Emitidas" value={totEtq.emitidas} tone="olive" />
            <StatCard label="Consumidas" value={totEtq.consumidas} hint={pct(totEtq.consumidas, totEtq.emitidas)} tone="success" />
            <StatCard
              label="Descartadas + vencidas"
              value={totEtq.descartadas + totEtq.vencidas}
              hint={pct(totEtq.descartadas + totEtq.vencidas, totEtq.emitidas)}
              tone="danger"
            />
            <StatCard label="Ainda ativas" value={totEtq.ativas} tone="neutral" />
          </div>
          <Card title="Por produto" padding="none">
            <Table columns={colsEtq} rows={etq} rowKey={(l) => l.produto_nome} compact empty="Nenhuma etiqueta no período." />
          </Card>
        </>
      ) : (
        <>
          <div className="rel-stats">
            <StatCard label="Registros" value={tempsTotal} tone="olive" />
            <StatCard label="Fora da faixa" value={ncTemps.length} tone={ncTemps.length ? 'danger' : 'success'} />
            <StatCard label="Conformidade" value={pct(temps.length - ncTemps.length, temps.length)} tone="success" />
            <StatCard label="Equipamentos" value={resumoTemp.length} tone="neutral" />
          </div>
          {tempsTotal > temps.length && (
            <p className="muted" style={{ margin: 0, fontSize: 'var(--fs-sm)' }}>
              Mostrando os {temps.length} registros mais recentes de {tempsTotal}. Reduza o período para ver todos.
            </p>
          )}
          <Card title="Por equipamento" padding="none">
            <Table columns={colsTemp} rows={resumoTemp} rowKey={(r) => r.id} compact empty="Sem registros no período." />
          </Card>
          <Card title="Registros fora da faixa" padding="none">
            <Table columns={colsNc} rows={ncTemps} rowKey={(r) => r.id} compact empty="Nenhum registro fora da faixa." />
          </Card>
        </>
      )}
    </div>
  );
}
