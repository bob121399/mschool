// Spec 2.4 chunking: target 400–700 tokens, overlap 60–100, never split a short rule/table,
// hard cap 6000 chars. Token estimate ≈ chars / 4 (documented approximation for ru/uz/en text).
export type Page = { page: number; text: string };
export type Chunk = { page: number; content: string };

const TARGET_CHARS = 2400; // ≈ 600 tokens
const MIN_CHARS = 1600; // ≈ 400 tokens
const OVERLAP_CHARS = 320; // ≈ 80 tokens
export const HARD_CAP = 6000;

export function normalizeText(text: string): string {
  return text.replace(/\r\n?/gu, "\n").replace(/[\t\f\v]+/gu, " ").replace(/[  ]{2,}/gu, " ")
    .replace(/\n{3,}/gu, "\n\n").trim();
}

function splitHard(block: string): string[] {
  const parts: string[] = [];
  let rest = block;
  while (rest.length > HARD_CAP) {
    let cut = rest.lastIndexOf("\n", HARD_CAP);
    if (cut < HARD_CAP / 2) cut = rest.lastIndexOf(". ", HARD_CAP);
    if (cut < HARD_CAP / 2) cut = HARD_CAP;
    parts.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1);
  }
  if (rest.trim()) parts.push(rest.trim());
  return parts;
}

export function chunkPages(pages: Page[]): Chunk[] {
  const blocks: { page: number; text: string }[] = [];
  for (const p of pages) {
    // Paragraphs (blank-line separated) keep tables/short rules intact.
    for (const para of normalizeText(p.text).split(/\n\s*\n/u)) {
      const t = para.trim();
      if (!t) continue;
      for (const piece of splitHard(t)) blocks.push({ page: p.page, text: piece });
    }
  }
  const chunks: Chunk[] = [];
  let current: { page: number; parts: string[]; size: number } | null = null;
  const flush = () => {
    if (!current) return;
    chunks.push({ page: current.page, content: current.parts.join("\n\n").slice(0, HARD_CAP) });
    current = null;
  };
  for (const b of blocks) {
    if (current && current.size + b.text.length + 2 > TARGET_CHARS && current.size >= MIN_CHARS) {
      const tail: string = current.parts.join("\n\n").slice(-OVERLAP_CHARS);
      flush();
      const overlap: string = tail.slice(tail.indexOf(" ") + 1);
      current = { page: b.page, parts: overlap ? [overlap] : [], size: overlap.length };
    }
    if (current && current.size + b.text.length + 2 > HARD_CAP) flush();
    if (!current) current = { page: b.page, parts: [], size: 0 };
    current.parts.push(b.text);
    current.size += b.text.length + 2;
  }
  flush();
  return chunks.filter((c) => c.content.length > 0);
}
