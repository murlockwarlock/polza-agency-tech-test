import { Pool, type PoolClient } from "pg";
import type { PreparedImport } from "@/lib/company";

const globalForPool = globalThis as unknown as { postgresPool?: Pool };

function databaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is required");
  return value;
}

export function getPool(): Pool {
  if (!globalForPool.postgresPool) {
    globalForPool.postgresPool = new Pool({
      connectionString: databaseUrl(),
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return globalForPool.postgresPool;
}

type ImportOptions = {
  sourceKind: "api_pages" | "review_csv";
  sourceFile: string;
  receivedRows: number;
};

type DatabaseCompany = {
  sourceId: string;
  identityKey: string;
  name: string;
  category: string;
  city: string;
  address: string;
  rating: number | null;
  reviewsCount: number;
  site: string | null;
  phone: string | null;
  raw: Record<string, unknown>;
};

async function insertCompanies(client: PoolClient, rows: DatabaseCompany[]): Promise<void> {
  if (!rows.length) return;
  await client.query(
    `
      INSERT INTO companies (
        identity_key, name, category, city, address, rating, reviews_count, site, phone
      )
      SELECT
        row.identity_key,
        row.name,
        row.category,
        row.city,
        row.address,
        row.rating,
        row.reviews_count,
        row.site,
        row.phone
      FROM jsonb_to_recordset($1::jsonb) AS row(
        identity_key text,
        name text,
        category text,
        city text,
        address text,
        rating numeric,
        reviews_count integer,
        site text,
        phone text
      )
      ON CONFLICT (identity_key) DO UPDATE SET
        name = EXCLUDED.name,
        category = EXCLUDED.category,
        city = EXCLUDED.city,
        address = EXCLUDED.address,
        rating = EXCLUDED.rating,
        reviews_count = EXCLUDED.reviews_count,
        site = EXCLUDED.site,
        phone = EXCLUDED.phone,
        updated_at = now()
    `,
    [JSON.stringify(rows.map((row) => ({
      identity_key: row.identityKey,
      name: row.name,
      category: row.category,
      city: row.city,
      address: row.address,
      rating: row.rating,
      reviews_count: row.reviewsCount,
      site: row.site,
      phone: row.phone,
    })))],
  );
}

async function insertSourceRecords(
  client: PoolClient,
  sourceKind: ImportOptions["sourceKind"],
  rows: DatabaseCompany[],
): Promise<void> {
  if (!rows.length) return;
  await client.query(
    `
      INSERT INTO company_source_records (source_kind, source_id, company_id, raw_payload)
      SELECT $1, row.source_id, company.id, row.raw_payload
      FROM jsonb_to_recordset($2::jsonb) AS row(
        source_id text,
        identity_key text,
        raw_payload jsonb
      )
      JOIN companies AS company ON company.identity_key = row.identity_key
      ON CONFLICT (source_kind, source_id) DO UPDATE SET
        company_id = EXCLUDED.company_id,
        raw_payload = EXCLUDED.raw_payload,
        imported_at = now()
    `,
    [sourceKind, JSON.stringify(rows.map((row) => ({
      source_id: row.sourceId,
      identity_key: row.identityKey,
      raw_payload: row.raw,
    })))],
  );
}

export async function saveImport(options: ImportOptions, prepared: PreparedImport): Promise<number> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const batchResult = await client.query<{ id: string }>(
      `
        INSERT INTO import_batches (source_kind, source_file, received_rows)
        VALUES ($1, $2, $3)
        RETURNING id
      `,
      [options.sourceKind, options.sourceFile, options.receivedRows],
    );
    const batchId = Number(batchResult.rows[0].id);

    await insertCompanies(client, prepared.companies);
    await insertSourceRecords(client, options.sourceKind, prepared.sourceRecords);

    if (prepared.rejections.length) {
      await client.query(
        `
          INSERT INTO import_rejections (batch_id, source_ref, payload, errors)
          SELECT
            $1,
            row.source_ref,
            row.payload,
            ARRAY(SELECT jsonb_array_elements_text(row.errors))
          FROM jsonb_to_recordset($2::jsonb) AS row(
            source_ref text,
            payload jsonb,
            errors jsonb
          )
        `,
        [batchId, JSON.stringify(prepared.rejections.map((row) => ({
          source_ref: row.sourceRef,
          payload: row.payload,
          errors: row.errors,
        })))],
      );
    }

    await client.query(
      `
        UPDATE import_batches
        SET status = 'completed',
            accepted_rows = $2,
            rejected_rows = $3,
            duplicate_rows = $4,
            finished_at = now()
        WHERE id = $1
      `,
      [batchId, prepared.sourceRecords.length, prepared.rejections.length, prepared.duplicateRows],
    );
    await client.query("COMMIT");
    return batchId;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (globalForPool.postgresPool) {
    await globalForPool.postgresPool.end();
    globalForPool.postgresPool = undefined;
  }
}
