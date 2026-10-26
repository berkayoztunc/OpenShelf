/** Minimal valid one-page PDF used as the fake label / invoice document. */
export function placeholderPdf(title: string): Uint8Array {
  const safe = title.replace(/[^\x20-\x7e]/g, "?").replace(/[()\\]/g, "").slice(0, 80);
  const stream = `BT /F1 20 Tf 60 740 Td (MOCK DOCUMENT) Tj 0 -32 Td /F1 14 Tf (${safe}) Tj 0 -24 Td (Generated in mock mode - not a real document) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n"; const offs: number[] = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
  return new TextEncoder().encode(out);
}
