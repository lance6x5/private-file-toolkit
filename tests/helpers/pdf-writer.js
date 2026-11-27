/**
 * Minimal dependency-free PDF writer for test fixtures: one Helvetica text
 * block per page. Builds a correct cross-reference table.
 */

function pdfString(s) {
  return `(${String(s).replace(/([\\()])/g, '\\$1')})`;
}

/**
 * @param {string[][]} pages lines of text per page
 * @param {{title?: string, author?: string}} [info]
 * @returns {Buffer}
 */
export function buildTextPdf(pages, info = {}) {
  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };
  const catalog = add(null);
  const pagesObj = add(null);
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const kids = [];
  for (const lines of pages) {
    const ops = ['BT', '/F1 20 Tf', '72 720 Td', '26 TL'];
    lines.forEach((line, i) => ops.push(`${i ? 'T* ' : ''}${pdfString(line)} Tj`));
    ops.push('ET');
    const content = ops.join('\n');
    const stream = add(`<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`);
    kids.push(
      add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${stream} 0 R >>`)
    );
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objects[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  const infoObj = add(`<< /Title ${pdfString(info.title ?? 'Fileward sample')} /Author ${pdfString(info.author ?? 'Fixture Author')} /Producer (Fileward fixture writer) >>`);

  let out = '%PDF-1.7\n%\xe2\xe3\xcf\xd3\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${infoObj} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

/** Text of test-fixtures/sample.pdf. Page 2 holds the "secret" to redact. */
export const SAMPLE_PAGES = [
  ['Fileward sample page 1', 'Public line: PUBLIC-BRAVO'],
  ['Fileward sample page 2', 'CONFIDENTIAL: SECRET-ALPHA-7731', 'Account number 4417-0000-9921'],
  ['Fileward sample page 3', 'Closing remarks are public.']
];
export const SECRET = 'SECRET-ALPHA-7731';
export const ACCOUNT = '4417-0000-9921';
