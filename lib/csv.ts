/** Minimal RFC 4180 CSV parser (quotes, escaped quotes, CRLF). No formula evaluation. */
export function parseCsv(text: string, maxRows = 501): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/u, "");
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"' && field === "") { quoted = true; continue; }
    if (c === "," || c === ";") { row.push(field); field = ""; continue; }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i += 1;
      row.push(field);
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
      field = "";
      if (rows.length > maxRows) throw new Error("TOO_MANY_ROWS");
      continue;
    }
    field += c;
  }
  row.push(field);
  if (row.some((v) => v.trim() !== "")) rows.push(row);
  if (rows.length > maxRows) throw new Error("TOO_MANY_ROWS");
  return rows.map((r) => r.map((v) => v.trim()));
}
