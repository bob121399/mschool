import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/csv";
import { detectMime } from "@/lib/files";

describe("parseCsv", () => {
  it("handles quotes, separators and CRLF", () => {
    expect(parseCsv('email,grade\r\n"a@b.c",junior\n"x, y@z.c";"mid""dle"\n\n')).toEqual([
      ["email", "grade"], ["a@b.c", "junior"], ["x, y@z.c", 'mid"dle'],
    ]);
  });
  it("rejects more than the row limit", () => {
    expect(() => parseCsv(Array.from({ length: 600 }, (_, i) => `u${i}@x.y,junior`).join("\n"))).toThrow("TOO_MANY_ROWS");
  });
});

describe("detectMime by magic bytes", () => {
  it("detects pdf, text and rejects binary disguised as text", () => {
    expect(detectMime(new TextEncoder().encode("%PDF-1.7\n..."))).toBe("application/pdf");
    expect(detectMime(new TextEncoder().encode("Регламент кассы"))).toBe("text/plain");
    expect(detectMime(new Uint8Array([0x4d, 0x5a, 0x90, 0x00]))).toBeNull();
    expect(detectMime(new Uint8Array([0xff, 0xfe, 0xfd]))).toBeNull();
  });
});
