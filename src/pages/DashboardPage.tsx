import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { DashboardResumo, EtiquetaDetalhe, TemperaturaUltima, UUID } from '@/types/database';
import { METODO_ROTULO, TIPO_EQUIPAMENTO_ROTULO } from '@/types/database';
import { getDashboardResumo } from '@/lib/api/relatorios';
import { listAVencer, marcarVencidas } from '@/lib/api/etiquetas';
import { listUltimasTemperaturas } from '@/lib/api/temperaturas';
import { corSituacao, formatarDataHora, formatarMoeda, formatarRelativo, formatarTemperatura, rotuloSituacao } from '@/lib/format';
import { useAuth } from '@/contexts/AuthContext';
import { useUnidade } from '@/contexts/UnidadeContext';
import { Badge, Button, Card, EmptyState, PageHeader, Spinner, StatCard, Table, useToast } from '@/components/ui';
import type { Column } from '@/components/ui';
import { icons } from '@/components/layout/Sidebar';

const RESUMO_ZERO: DashboardResumo = {
  ativas: 0, vencidas: 0, vence_hoje: 0, vence_24h: 0, vence_72h: 0, emitidas_hoje: 0,
  descartes_7d_kg: 0, descartes_7d_custo: 0, temperaturas_nao_conformes_24h: 0,
  equipamentos_sem_registro_12h: 0, recebimentos_hoje: 0,
};

function somarResumos(lista: DashboardResumo[]): DashboardResumo {
  return lista.reduce<DashboardResumo>((acc, r) => {
    const out = { ...acc };
    (Object.keys(RESUMO_ZERO) as (keyof DashboardResumo)[]).forEach((k) => {
      out[k] = Number(acc[k] ?? 0) + Number(r[k] ?? 0);
    });
    return out;
  }, { ...RESUMO_ZERO });
}

function saudacao(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

const kg = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

export default function DashboardPage(): JSX.Element {
  const { perfil } = useAuth();
  const { unidadeId, unidades, unidadeAtual, carregando: carregandoUnidades } = useUnidade();
  const toast = useToast();
  const navigate = useNavigate();

  const [resumo, setResumo] = useState<DashboardResumo | null>(null);
  const [aVencer, setAVencer] = useState<EtiquetaDetalhe[]>([]);
  const [temps, setTemps] = useState<TemperaturaUltima[]>([]);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      await marcarVencidas(unidadeId).catch(() => 0);
      const ids: UUID[] = unidadeId ? [unidadeId] : unidades.map((u) => u.id);
      const [resumos, lista, ultimas] = await Promise.all([
        Promise.all(ids.map((id) => getDashboardResumo(id))),
        listAVencer(unidadeId, 12),
        listUltimasTemperaturas(unidadeId),
      ]);
      setResumo(somarResumos(resumos));
      setAVencer(lista);
      setTemps(ultimas);
    } catch (e) {
      toast.error(e);
    } finally {
      setCarregando(false);
    }
  }, [unidadeId, unidades, toast]);

  useEffect(() => {
    if (carregandoUnidades) return;
    void carregar();
  }, [carregar, carregandoUnidades]);

  const r = resumo ?? RESUMO_ZERO;
  const nomeCurto = perfil?.nome.split(/\s+/)[0] ?? '';
  const alertasTemp = temps.filter((t) => t.conforme === false || t.horas_desde_registro === null || (t.horas_desde_registro ?? 0) > 12);

  const colunas: Column<EtiquetaDetalhe>[] = [
    {
      key: 'produto_nome',
      header: 'Produto',
      render: (e) => (
        <div>
          <div style={{ fontWeight: 500 }}>{e.produto_nome}</div>
          <div className="muted mono" style={{ fontSize: 'var(--fs-xs)' }}>{e.codigo}{!unidadeId && ` · ${e.unidade_nome}`}</div>
          <div className="muted show-mobile" style={{ fontSize: 'var(--fs-xs)' }}>{METODO_ROTULO[e.metodo]}</div>
        </div>
      ),
    },
    {
      key: 'metodo',
      header: 'Método',
      className: 'hide-mobile',
      render: (e) => (
        <span className="nowrap" style={{ fontSize: 'var(--fs-sm)' }}>
          <span className={`metodo-dot ${e.metodo}`} aria-hidden="true" />
          {METODO_ROTULO[e.metodo]}
        </span>
      ),
    },
    {
      key: 'data_validade',
      header: 'Validade',
      render: (e) => (
        <div className="nowrap">
          <div>{formatarDataHora(e.data_validade)}</div>
          <div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{formatarRelativo(e.data_validade)}</div>
        </div>
      ),
    },
    {
      key: 'situacao',
      header: 'Situação',
      align: 'right',
      className: 'nowrap',
      render: (e) => <Badge variant={corSituacao(e.situacao)} dot>{rotuloSituacao(e.situacao)}</Badge>,
    },
  ];

  return (
    <div className="stack-lg">
      <PageHeader
        title="Painel"
        subtitle={
          <>
            {saudacao()}{nomeCurto && `, ${nomeCurto}`} · {unidadeAtual?.nome ?? 'Todas as unidades'}
          </>
        }
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => void carregar()} disabled={carregando}>Atualizar</Button>
            <Link to="/etiquetas/baixa" className="ui-btn ui-btn-secondary">Baixa rápida</Link>
            <Link to="/etiquetas/nova" className="ui-btn ui-btn-primary">
              <span className="ui-btn-icon" aria-hidden="true">{icons.emitir}</span>
              Emitir etiqueta
            </Link>
          </>
        }
      />

      {carregando && !resumo ? (
        <div className="ui-spinner-page"><Spinner label="Carregando painel…" /></div>
      ) : (
        <>
          <section className="dash-stats" aria-label="Resumo">
            <StatCard label="Etiquetas ativas" value={r.ativas} hint={`${r.emitidas_hoje} emitidas hoje`} to="/etiquetas" />
            <StatCard label="Vencidas" value={r.vencidas} tone={r.vencidas > 0 ? 'danger' : 'neutral'} hint="Retirar e dar baixa" to="/etiquetas?situacao=vencida" />
            <StatCard label="Vencem hoje" value={r.vence_hoje} tone={r.vence_hoje > 0 ? 'danger' : 'neutral'} hint="Usar primeiro (PVPS)" to="/etiquetas?situacao=vence_hoje" />
            <StatCard label="Próximas 24 h" value={r.vence_24h} tone={r.vence_24h > 0 ? 'warning' : 'neutral'} hint={`${r.vence_72h} em até 72 h`} to="/etiquetas?situacao=vence_24h" />
            <StatCard label="Desperdício 7 dias" value={`${kg.format(Number(r.descartes_7d_kg) || 0)} kg`} tone="neutral" hint={formatarMoeda(r.descartes_7d_custo)} to="/descartes" />
            <StatCard
              label="Temperaturas"
              value={r.temperaturas_nao_conformes_24h}
              tone={r.temperaturas_nao_conformes_24h > 0 ? 'danger' : 'success'}
              hint={r.equipamentos_sem_registro_12h > 0 ? `${r.equipamentos_sem_registro_12h} sem registro há 12 h` : 'não conformes em 24 h'}
              to="/temperaturas"
            />
          </section>

          <div className="dash-grid">
            <Card
              title="A vencer · PVPS"
              padding="none"
              actions={<Link to="/etiquetas" className="ui-btn ui-btn-ghost ui-btn-sm">Ver todas</Link>}
            >
              <Table
                columns={colunas}
                rows={aVencer}
                rowKey={(e) => e.id}
                loading={carregando}
                onRowClick={(e) => navigate(`/etiquetas/${e.id}`)}
                compact
                empty={<EmptyState title="Tudo em dia" description="Nenhuma etiqueta vence nas próximas 72 horas." />}
              />
            </Card>

            <div className="stack-lg">
              <Card title="Atalhos" padding="sm">
                <div className="dash-quick">
                  <Link to="/etiquetas/nova">{icons.emitir}Emitir etiqueta</Link>
                  <Link to="/etiquetas/baixa">{icons.baixa}Baixa rápida</Link>
                  <Link to="/recebimentos/novo">{icons.recebimento}Recebimento</Link>
                  <Link to="/temperaturas">{icons.temperaturas}Temperatura</Link>
                  <Link to="/descartes">{icons.descartes}Descarte</Link>
                  <Link to="/checklists">{icons.checklists}Checklists</Link>
                </div>
              </Card>

              <Card
                title="Equipamentos"
                padding="sm"
                actions={<span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{r.recebimentos_hoje} recebimento(s) hoje</span>}
              >
                {temps.length === 0 ? (
                  <p className="muted" style={{ padding: 'var(--sp-3) 0', fontSize: 'var(--fs-sm)' }}>Nenhum equipamento cadastrado.</p>
                ) : (
                  <ul className="dash-temp-list">
                    {(alertasTemp.length > 0 ? alertasTemp : temps).slice(0, 8).map((t) => (
                      <li key={t.equipamento_id}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="truncate" style={{ fontWeight: 500 }}>{t.equipamento_nome}</div>
                          <div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
                            {TIPO_EQUIPAMENTO_ROTULO[t.tipo]} · {t.registrado_em ? formatarRelativo(t.registrado_em) : 'sem registro'}
                          </div>
                        </div>
                        <span className="temp">{formatarTemperatura(t.temperatura_c)}</span>
                        {t.conforme === null ? (
                          <Badge variant="neutral">—</Badge>
                        ) : t.conforme ? (
                          <Badge variant="success">OK</Badge>
                        ) : (
                          <Badge variant="danger">Fora</Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {alertasTemp.length === 0 && temps.length > 0 && (
                  <p className="muted" style={{ fontSize: 'var(--fs-xs)', paddingTop: 'var(--sp-2)' }}>Todos os equipamentos conformes.</p>
                )}
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
