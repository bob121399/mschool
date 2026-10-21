// Upload limits and MIME detection by magic bytes, not extension (spec 2.4).
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_PAGES = 300;
export const MAX_CHARS = 1_000_000;

export type DetectedType = "application/pdf" | "text/plain" | null;

export function detectMime(bytes: Uint8Array): DetectedType {
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) {
    return "application/pdf"; // %PDF-
  }
  if (bytes.length === 0) return null;
  const sample = bytes.subarray(0, Math.min(bytes.length, 65536));
  for (const b of sample) if (b === 0) return null;
  try {
    // Plain text must be valid UTF-8. A multi-byte char may be cut at the sample boundary.
    new TextDecoder("utf-8", { fatal: true }).decode(bytes.length > 65536 ? bytes.subarray(0, 65532) : sample);
    return "text/plain";
  } catch {
    return null;
  }
}
