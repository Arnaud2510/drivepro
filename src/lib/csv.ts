/** RFC 4180 CSV with a UTF-8 BOM so Excel opens accents correctly. Separator is configurable (';' for FR/DE/PT Excel). */
export function toCSV(rows: (string | number | null | undefined)[][], sep = ';'): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v);
    // Neutralise spreadsheet formula injection
    const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
    return /[";\n\r,]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return '﻿' + rows.map((r) => r.map(esc).join(sep)).join('\r\n');
}

export function download(filename: string, content: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
