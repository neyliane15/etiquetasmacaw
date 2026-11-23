import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

const cache = new Map<string, string>();
const pendentes = new Map<string, Promise<string>>();

/** Gera (com cache) o SVG do QR — preto sobre branco, sem margem. */
export function gerarQrSvg(value: string): Promise<string> {
  const pronto = cache.get(value);
  if (pronto) return Promise.resolve(pronto);
  const emAndamento = pendentes.get(value);
  if (emAndamento) return emAndamento;
  const p = QRCode.toString(value, {
    type: 'svg',
    margin: 0,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#ffffff' },
  })
    .then((svg) => {
      cache.set(value, svg);
      return svg;
    })
    .finally(() => {
      pendentes.delete(value);
    });
  pendentes.set(value, p);
  return p;
}

export function QrCode(p: { value: string; sizeMm: number; className?: string }): JSX.Element {
  const [svg, setSvg] = useState<string | null>(() => cache.get(p.value) ?? null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let vivo = true;
    const c = cache.get(p.value);
    if (c) {
      setSvg(c);
      setErro(false);
      return;
    }
    setSvg(null);
    gerarQrSvg(p.value)
      .then((s) => {
        if (vivo) {
          setSvg(s);
          setErro(false);
        }
      })
      .catch(() => {
        if (vivo) setErro(true);
      });
    return () => {
      vivo = false;
    };
  }, [p.value]);

  const style = { width: `${p.sizeMm}mm`, height: `${p.sizeMm}mm` };
  const cls = ['label-qr', p.className].filter(Boolean).join(' ');

  if (erro) {
    const codigo = p.value.split('/').pop() ?? p.value;
    return (
      <span className={`${cls} label-qr-erro`} style={style} data-testid="label-qr">
        {codigo}
      </span>
    );
  }
  if (!svg) return <span className={cls} style={style} data-testid="label-qr" aria-hidden="true" />;
  return (
    <span
      className={cls}
      style={style}
      data-testid="label-qr"
      role="img"
      aria-label="QR Code da etiqueta"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
