import "dotenv/config";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { parse } from "csv-parse/sync";
import { prepareImport, type RawImportRow } from "../src/lib/company";
import { closePool, saveImport } from "../src/lib/database";

type PageEnvelope = {
  page: number;
  per_page: number;
  total: number;
  items: unknown[];
};

function isPageEnvelope(value: unknown): value is PageEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Number.isInteger(record.page)
    && Number.isInteger(record.per_page)
    && Number.isInteger(record.total)
    && Array.isArray(record.items);
}

function dataDirectory(): string {
  return resolve(process.cwd(), process.env.DATA_DIR ?? "data/raw");
}

async function importPages(): Promise<void> {
  const directory = dataDirectory();
  const files = (await readdir(directory)).filter((file) => /^page_\d{3}\.json$/.test(file)).sort();
  if (!files.length) throw new Error(`No page_*.json files in ${directory}`);

  const rows: RawImportRow[] = [];
  const pages: number[] = [];
  const totals = new Set<number>();

  for (const file of files) {
    const parsed: unknown = JSON.parse(await readFile(resolve(directory, file), "utf8"));
    if (!isPageEnvelope(parsed)) throw new Error(`${file}: invalid page envelope`);
    const filePage = Number(file.slice(5, 8));
    if (parsed.page !== filePage) throw new Error(`${file}: page field is ${parsed.page}`);
    if (parsed.items.length > parsed.per_page) throw new Error(`${file}: items exceed per_page`);
    pages.push(parsed.page);
    totals.add(parsed.total);
    parsed.items.forEach((payload, index) => rows.push({ sourceRef: `${file}:${index + 1}`, payload }));
  }

  const expectedPages = Array.from({ length: pages.length }, (_, index) => index + 1);
  if (pages.some((page, index) => page !== expectedPages[index])) throw new Error("Page sequence has gaps or duplicates");
  if (totals.size !== 1 || !totals.has(rows.length)) throw new Error("Page total does not match received rows");

  const prepared = prepareImport(rows);
  const batchId = await saveImport(
    { sourceKind: "api_pages", sourceFile: "page_*.json", receivedRows: rows.length },
    prepared,
  );
  process.stdout.write(
    `API pages: batch=${batchId} received=${rows.length} accepted=${prepared.sourceRecords.length} rejected=${prepared.rejections.length} duplicates=${prepared.duplicateRows}\n`,
  );
}

async function importReview(): Promise<void> {
  const file = resolve(dataDirectory(), "review.csv");
  const csv = await readFile(file, "utf8");
  const records = parse(csv, {
    bom: true,
    columns: true,
    relax_column_count: true,
    skip_empty_lines: false,
  }) as Record<string, unknown>[];
  const rows = records.map((payload, index) => ({ sourceRef: `review.csv:${index + 2}`, payload }));
  const prepared = prepareImport(rows);
  const batchId = await saveImport(
    { sourceKind: "review_csv", sourceFile: "review.csv", receivedRows: rows.length },
    prepared,
  );
  process.stdout.write(
    `Review CSV: batch=${batchId} received=${rows.length} accepted=${prepared.sourceRecords.length} rejected=${prepared.rejections.length} duplicates=${prepared.duplicateRows}\n`,
  );
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (!(["pages", "review", "all"] as string[]).includes(command)) {
    throw new Error("Usage: npm run import:pages | import:review | import:all");
  }
  if (command === "pages" || command === "all") await importPages();
  if (command === "review" || command === "all") await importReview();
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(closePool);
