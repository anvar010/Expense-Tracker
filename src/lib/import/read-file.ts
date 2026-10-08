import { parseCsv } from "./csv";
import { pdfLinesToRows } from "./pdf-lines";
import type { Cell } from "./statement";

export const MAX_STATEMENT_BYTES = 5 * 1024 * 1024;
export type StatementKind = "csv" | "xlsx" | "pdf";

/** Validates by extension, size and file signature (not just the name). */
export async function sniffStatement(file: File): Promise<StatementKind> {
  if (file.size === 0) throw new Error("The file is empty.");
  if (file.size > MAX_STATEMENT_BYTES) throw new Error("File is larger than 5 MB.");
  const ext = file.name.split(".").pop()?.toLowerCase();
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  const asText = String.fromCharCode(...head);
  if (ext === "pdf") { if (!asText.startsWith("%PDF")) throw new Error("This doesn't look like a PDF."); return "pdf"; }
  if (ext === "xlsx") { if (!asText.startsWith("PK")) throw new Error("This doesn't look like an .xlsx file."); return "xlsx"; }
  if (ext === "csv" || ext === "tsv" || ext === "txt") return "csv";
  throw new Error("Unsupported file type. Use CSV, XLSX or PDF.");
}

async function pdfLines(file: File): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  const lines: string[] = [];
  for (let p = 1; p <= Math.min(doc.numPages, 60); p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    const byY = new Map<number, { x: number; s: string }[]>();
    for (const it of content.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      const y = Math.round(it.transform[5] / 3); // group items on (roughly) the same baseline
      byY.set(y, [...(byY.get(y) ?? []), { x: it.transform[4], s: it.str }]);
    }
    [...byY.entries()].sort((a, b) => b[0] - a[0]).forEach(([, items]) => lines.push(items.sort((a, b) => a.x - b.x).map((i) => i.s).join(" ")));
  }
  await task.destroy();
  return lines;
}

/** Everything is read in the browser from memory; the file itself is never uploaded or written anywhere. */
export async function readStatement(file: File): Promise<{ kind: StatementKind; rows: Cell[][] }> {
  const kind = await sniffStatement(file);
  if (kind === "csv") return { kind, rows: parseCsv(await file.text()) };
  if (kind === "xlsx") {
    const { readSheet } = await import("read-excel-file/browser");
    return { kind, rows: (await readSheet(file)) as Cell[][] };
  }
  return { kind, rows: pdfLinesToRows(await pdfLines(file)) };
}
