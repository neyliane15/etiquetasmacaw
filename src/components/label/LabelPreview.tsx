import type { CSSProperties } from 'react';
import { FAIXA_METODO, METODO_ROTULO, TIPO_ETIQUETA_ROTULO } from '@/types/database';
import type { CampoEtiqueta, LabelData, ModeloEtiqueta } from '@/types/database';
import { formatarDataCurta, urlConsultaQr } from '@/lib/format';
import { Logo } from '@/components/layout/Logo';
import { QrCode } from '@/components/label/QrCode';
import { linhasEtiqueta, tamanhoQrMm } from '@/components/label/labelFields';
import '@/components/label/label.css';

export interface LabelPreviewProps {
  data: LabelData;
  modelo: Pick<ModeloEtiqueta, 'largura_mm' | 'altura_mm' | 'campos' | 'fonte_base_pt' | 'mostrar_logo'>;
  /** Só na tela; default 1. */
  escala?: number;
  qrOrigin?: string;
}

export function LabelPreview(p: LabelPreviewProps): JSX.Element {
  const { data, modelo } = p;
  const largura = Number(modelo.largura_mm);
  const altura = Number(modelo.altura_mm);
  const campos: CampoEtiqueta[] = modelo.campos ?? [];
  const tem = (c: CampoEtiqueta) => campos.includes(c);

  const mostrarQr = tem('qr');
  const mostrarLogo = modelo.mostrar_logo || tem('logo');
  const banda = tem('metodo');
  const tipoNaBanda = banda && tem('tipo');
  const qrMm = tamanhoQrMm({ largura_mm: largura, altura_mm: altura });
  const compacta = largura < 50 || altura < 35;

  const ocultas = new Set<CampoEtiqueta>(['produto', 'validade']);
  if (banda) ocultas.add('metodo');
  if (tipoNaBanda) ocultas.add('tipo');
  if (mostrarQr) ocultas.add('codigo');
  const linhas = linhasEtiqueta(data, campos).filter((l) => !ocultas.has(l.campo));

  let qrValue = data.codigo;
  try {
    qrValue = urlConsultaQr(data.codigo, p.qrOrigin);
  } catch {
    qrValue = data.codigo;
  }

  const classes = ['label'];
  if (compacta) classes.push('label--compacta');
  if (largura >= 90) classes.push('label--larga');

  const estilo: CSSProperties = {
    width: `${largura}mm`,
    height: `${altura}mm`,
    fontSize: `${Number(modelo.fonte_base_pt) || 7}pt`,
  };

  const escala = p.escala ?? 1;
  if (escala !== 1) {
    estilo.transform = `scale(${escala})`;
    estilo.transformOrigin = 'top left';
  }

  const etiqueta = (
    <div className={classes.join(' ')} data-testid="label-preview" style={estilo}>
      {banda && (
        <div className="label-band">
          <span className="label-band-m">{METODO_ROTULO[data.metodo]}</span>
          <span className="label-band-f">{FAIXA_METODO[data.metodo]}</span>
          {tipoNaBanda && <span className="label-band-t">{TIPO_ETIQUETA_ROTULO[data.tipo]}</span>}
        </div>
      )}
      <div className="label-body">
        <div className="label-main">
          {(tem('produto') || mostrarLogo) && (
            <div className="label-head">
              {mostrarLogo && <Logo size={16} className="label-logo" title="Macaw" />}
              {tem('produto') && <div className="label-produto">{data.produto_nome}</div>}
            </div>
          )}
          {tem('validade') && (
            <div className="label-val">
              <span className="label-val-k">VAL:</span>
              <span className="label-val-v">{formatarDataCurta(data.data_validade)}</span>
            </div>
          )}
          {linhas.map((l) =>
            l.campo === 'alergenicos' ? (
              <div key={l.campo} className="label-line label-line--wrap label-alerg">
                {l.valor}
              </div>
            ) : (
              <div
                key={l.campo}
                className={`label-line${l.campo === 'observacoes' ? ' label-line--wrap' : ''}`}
              >
                <span className="label-k">{l.rotulo}:</span> <span className="label-v">{l.valor}</span>
              </div>
            ),
          )}
        </div>
        {mostrarQr && (
          <div className="label-side" style={{ width: `${qrMm}mm` }}>
            <QrCode value={qrValue} sizeMm={qrMm} />
            <div className="label-code">{data.codigo}</div>
          </div>
        )}
      </div>
    </div>
  );

  if (escala === 1) return etiqueta;
  return (
    <div className="label-scale" style={{ width: `${largura * escala}mm`, height: `${altura * escala}mm` }}>
      {etiqueta}
    </div>
  );
}
