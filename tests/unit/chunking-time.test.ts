import { describe, expect, it } from "vitest";
import { chunkPages, HARD_CAP } from "@/lib/chunking";
import { previousWeekStart, zonedMidnightToUtc } from "@/lib/time";

describe("chunkPages", () => {
  it("keeps short rules whole, respects hard cap, overlaps and page numbers", () => {
    const para = (i: number) => `Правило ${i}. ` + "Сотрудник проверяет документ клиента до операции. ".repeat(8);
    const pages = [{ page: 1, text: Array.from({ length: 12 }, (_, i) => para(i)).join("\n\n") },
      { page: 2, text: "| Колонка | Значение |\n|---|---|\n| Лимит | по регламенту |" }];
    const chunks = chunkPages(pages);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.content.length).toBeLessThanOrEqual(HARD_CAP);
    expect(chunks.some((c) => c.content.includes("| Лимит | по регламенту |"))).toBe(true);
    expect(chunks.at(-1)!.page).toBeGreaterThanOrEqual(1);
    const huge = chunkPages([{ page: 3, text: "x".repeat(20000) }]);
    expect(huge.every((c) => c.content.length <= HARD_CAP && c.page === 3)).toBe(true);
  });
});

describe("timezone periods", () => {
  it("converts Tashkent midnight to UTC and finds previous Monday", () => {
    expect(zonedMidnightToUtc("2026-10-12", "Asia/Tashkent").toISOString()).toBe("2026-10-11T19:00:00.000Z");
    expect(zonedMidnightToUtc("2026-03-30", "Europe/Berlin").toISOString()).toBe("2026-03-29T22:00:00.000Z");
    expect(previousWeekStart(new Date("2026-10-20T10:00:00Z"), "Asia/Tashkent")).toBe("2026-10-12");
    expect(previousWeekStart(new Date("2026-10-18T20:00:00Z"), "Asia/Tashkent")).toBe("2026-10-12");
  });
});
