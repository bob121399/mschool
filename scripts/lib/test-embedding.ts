import { createHash } from "node:crypto";

/** Separate test namespace (decision D-09): deterministic, normalized, NOT a semantic index. */
export const TEST_EMBEDDING_MODEL = "test-hash-embedding-v1";

export function testEmbedding(text: string): string {
  const values: number[] = [];
  let block = 0;
  while (values.length < 1536) {
    const digest = createHash("sha256").update(`${block}:${text}`).digest();
    for (let i = 0; i + 1 < digest.length && values.length < 1536; i += 2) {
      values.push((digest.readUInt16BE(i) / 65535) * 2 - 1);
    }
    block += 1;
  }
  const norm = Math.sqrt(values.reduce((s, v) => s + v * v, 0));
  return JSON.stringify(values.map((v) => Number((v / norm).toFixed(6))));
}
