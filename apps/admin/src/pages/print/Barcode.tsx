import { code128Bars } from "../../lib/barcode";
import { useT } from "../../i18n";

/** CODE128 barcode as inline SVG (quiet zone of 10 modules each side). Falls back to nothing for unencodable text. */
export function Code128({ value, height = 56, className }: { value: string; height?: number; className?: string }) {
  const { t } = useT();
  let enc: ReturnType<typeof code128Bars>;
  try { enc = code128Bars(value); } catch { return null; }
  const quiet = 10; const w = enc.modules + quiet * 2;
  return (
    <svg role="img" aria-label={t("print.barcodeAria", { value })} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" shapeRendering="crispEdges" className={className} style={{ width: "100%", height, printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>
      <rect width={w} height={height} fill="#fff" />
      {enc.bars.map(([x, bw], i) => <rect key={i} x={x + quiet} y={0} width={bw} height={height} fill="#000" />)}
    </svg>
  );
}
