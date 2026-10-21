// Isolated document parser (spec 2.4): runs as a separate Node process started by the worker with
// a minimal environment (no Supabase/OpenAI secrets), a heap cap and a wall-clock timeout. Reads
// bytes from stdin, writes {pages} or {error} JSON to stdout. Never executes embedded JS.
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const MAX_PAGES = 300;
const MAX_CHARS = 1_000_000;

async function readStdin(): Promise<Uint8Array> {
  const parts: Buffer[] = [];
  for await (const chunk of process.stdin) parts.push(chunk as Buffer);
  return new Uint8Array(Buffer.concat(parts));
}

function out(value: unknown) {
  process.stdout.write(JSON.stringify(value));
}

async function parsePdf(data: Uint8Array) {
  let doc;
  // pdfjs 6 no longer evaluates embedded code paths (no isEvalSupported option); fonts are not loaded.
  const task = getDocument({ data, disableFontFace: true, useSystemFonts: false, stopAtErrors: false, verbosity: 0 });
  try {
    doc = await task.promise;
  } catch (e) {
    const name = (e as { name?: string }).name ?? "";
    if (name === "PasswordException") return { error: "PDF_ENCRYPTED" };
    return { error: "PDF_CORRUPTED" };
  }
  if (doc.numPages > MAX_PAGES) return { error: "LIMIT_PAGES", pages_count: doc.numPages };
  const pages: { page: number; text: string }[] = [];
  let chars = 0;
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let text = "";
    for (const item of content.items) {
      if ("str" in item) text += item.str + (item.hasEOL ? "\n" : " ");
    }
    chars += text.length;
    if (chars > MAX_CHARS) return { error: "LIMIT_CHARS" };
    pages.push({ page: i, text });
    page.cleanup();
  }
  await task.destroy();
  return { pages };
}

function parseText(data: Uint8Array) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(data);
  if (text.length > MAX_CHARS) return { error: "LIMIT_CHARS" };
  // Form feed separates pages; otherwise ~3000-char virtual pages for citations.
  const raw = text.includes("\f") ? text.split("\f") : text.match(/[\s\S]{1,3000}(?=\s|$)|[\s\S]{1,3000}/gu) ?? [];
  if (raw.length > MAX_PAGES) return { error: "LIMIT_PAGES" };
  return { pages: raw.map((t, i) => ({ page: i + 1, text: t })) };
}

const mime = process.argv[2];
readStdin()
  .then(async (bytes) => out(mime === "application/pdf" ? await parsePdf(bytes) : parseText(bytes)))
  .catch(() => out({ error: "PARSE_FAILED" }));
