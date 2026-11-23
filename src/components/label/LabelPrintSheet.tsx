import type { LabelData } from '@/types/database';
import { LabelPreview } from '@/components/label/LabelPreview';
import type { LabelPreviewProps } from '@/components/label/LabelPreview';

/** Folha de impressão: cada etiqueta numa página (page-break-after: always). */
export function LabelPrintSheet(p: {
  itens: LabelData[];
  modelo: LabelPreviewProps['modelo'];
  qrOrigin?: string;
}): JSX.Element {
  return (
    <div className="label-sheet">
      {p.itens.map((d, i) => (
        <LabelPreview key={`${d.codigo}-${i}`} data={d} modelo={p.modelo} qrOrigin={p.qrOrigin} />
      ))}
    </div>
  );
}
