import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { closePool, getPool } from "../src/lib/database";

async function main(): Promise<void> {
  const sql = await readFile(resolve(process.cwd(), "schema.sql"), "utf8");
  await getPool().query(sql);
  process.stdout.write("Schema applied\n");
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(closePool);
