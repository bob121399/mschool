// Generates synthetic source fixtures (spec 6 step 6.3): two text PDFs (A, B with canary), one
// image-only "scan" without a text layer, and a corrupted PDF. Content is explicitly marked as
// demonstration regulations; no real Paynet rules, client names, transactions or secrets.
import { readFileSync, writeFileSync } from "node:fs";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

const FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";

export const SOURCE_A = [
  ["Демонстрационный регламент «Обслуживание клиента у кассы» (Demo Retail A)",
    "Раздел 1. Проверка документа. Перед любой операцией кассир сверяет документ клиента с данными заявки. Операция без проверки документа запрещена.",
    "Раздел 2. Объяснение клиенту. Кассир называет клиенту сумму, комиссию по тарифу точки и следующий шаг. Клиент подтверждает понимание."],
  ["Раздел 3. Фиксация результата. Каждая операция записывается в журнал смены с временем и номером чека.",
    "Раздел 4. Исключения. При несовпадении данных кассир не проводит операцию и вызывает старшего смены.",
    "Таблица. Роль | Действие: Кассир | проверка и проведение; Старший смены | решение по исключениям."],
];
export const SOURCE_B = [
  ["Демонстрационный регламент «Сервисный центр» (Demo Service B)",
    "Раздел 1. Приём обращения. Специалист регистрирует обращение и выдаёт клиенту номер заявки. CANARY_TENANT_B_9F24",
    "Раздел 2. Диагностика. Специалист проверяет комплектность и фиксирует состояние устройства."],
  ["Раздел 3. Выдача. Устройство выдаётся только по номеру заявки и документу клиента.",
    "Раздел 4. Эскалация. Спорные случаи передаются руководителю смены."],
];

async function textPdf(pages: string[][], title: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(readFileSync(FONT), { subset: true });
  doc.setTitle(title);
  for (const paragraphs of pages) {
    const page = doc.addPage([595, 842]);
    let y = 790;
    for (const para of paragraphs) {
      const words = para.split(" ");
      let line = "";
      for (const w of words) {
        const next = line ? `${line} ${w}` : w;
        if (font.widthOfTextAtSize(next, 11) > 500) { page.drawText(line, { x: 48, y, size: 11, font }); y -= 16; line = w; }
        else line = next;
      }
      if (line) { page.drawText(line, { x: 48, y, size: 11, font }); y -= 16; }
      y -= 12;
    }
  }
  return doc.save();
}

async function scanPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  // Only vector shapes, no text layer: imitates a scanned page for the needs_review path.
  for (let i = 0; i < 30; i += 1) page.drawRectangle({ x: 48, y: 780 - i * 22, width: 300 + (i % 5) * 30, height: 9, color: rgb(0.2, 0.2, 0.2) });
  return doc.save();
}

async function main() {
  writeFileSync("tests/fixtures/demo-retail-a.pdf", await textPdf(SOURCE_A, "Demo Retail A — демонстрационный регламент"));
  writeFileSync("tests/fixtures/demo-service-b.pdf", await textPdf(SOURCE_B, "Demo Service B — демонстрационный регламент"));
  writeFileSync("tests/fixtures/scan-no-text.pdf", await scanPdf());
  const good = await textPdf([["Демонстрационный файл"]], "corrupted");
  writeFileSync("tests/fixtures/corrupted.pdf", good.slice(0, Math.floor(good.length / 3)));
  console.log("fixtures written");
}

if (process.argv[1]?.endsWith("make-fixtures.ts")) void main();
