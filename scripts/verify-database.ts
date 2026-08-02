import "dotenv/config";
import { closePool, getPool } from "../src/lib/database";

type DatabaseFacts = {
  companies: string;
  api_source_records: string;
  review_source_records: string;
  completed_batches: string;
  rejections: string;
};

async function main(): Promise<void> {
  const result = await getPool().query<DatabaseFacts>(`
    SELECT
      (SELECT COUNT(*) FROM companies)::text AS companies,
      (SELECT COUNT(*) FROM company_source_records WHERE source_kind = 'api_pages')::text AS api_source_records,
      (SELECT COUNT(*) FROM company_source_records WHERE source_kind = 'review_csv')::text AS review_source_records,
      (SELECT COUNT(*) FROM import_batches WHERE status = 'completed')::text AS completed_batches,
      (SELECT COUNT(*) FROM import_rejections)::text AS rejections
  `);
  const facts = result.rows[0];
  const failures: string[] = [];

  if (Number(facts.companies) !== 1169) failures.push(`companies=${facts.companies}, expected 1169`);
  if (Number(facts.api_source_records) !== 994) failures.push(`api_source_records=${facts.api_source_records}, expected 994`);
  if (Number(facts.review_source_records) !== 187) failures.push(`review_source_records=${facts.review_source_records}, expected 187`);
  if (Number(facts.completed_batches) < 2) failures.push(`completed_batches=${facts.completed_batches}, expected at least 2`);
  if (Number(facts.rejections) < 17) failures.push(`rejections=${facts.rejections}, expected at least 17`);
  if (failures.length) throw new Error(failures.join("; "));

  process.stdout.write(`${JSON.stringify(facts)}\n`);
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(closePool);
