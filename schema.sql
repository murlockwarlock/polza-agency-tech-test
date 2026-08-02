CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS import_batches (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_kind text NOT NULL CHECK (source_kind IN ('api_pages', 'review_csv')),
    source_file text NOT NULL,
    status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
    received_rows integer NOT NULL DEFAULT 0 CHECK (received_rows >= 0),
    accepted_rows integer NOT NULL DEFAULT 0 CHECK (accepted_rows >= 0),
    rejected_rows integer NOT NULL DEFAULT 0 CHECK (rejected_rows >= 0),
    duplicate_rows integer NOT NULL DEFAULT 0 CHECK (duplicate_rows >= 0),
    started_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz
);

CREATE TABLE IF NOT EXISTS companies (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    identity_key text NOT NULL UNIQUE,
    name text NOT NULL CHECK (btrim(name) <> ''),
    category text NOT NULL CHECK (btrim(category) <> ''),
    city text NOT NULL CHECK (btrim(city) <> ''),
    address text NOT NULL CHECK (btrim(address) <> ''),
    rating numeric(2, 1) CHECK (rating BETWEEN 0 AND 5),
    reviews_count integer NOT NULL CHECK (reviews_count >= 0),
    site text,
    phone text,
    first_seen_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (site IS NULL OR site ~ '^https?://')
);

ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_phone_check;
ALTER TABLE companies ADD CONSTRAINT companies_phone_check
    CHECK (phone IS NULL OR phone ~ '^[+]7 [(][0-9]{3}[)] [0-9]{3}-[0-9]{2}-[0-9]{2}$');

CREATE TABLE IF NOT EXISTS company_source_records (
    source_kind text NOT NULL CHECK (source_kind IN ('api_pages', 'review_csv')),
    source_id text NOT NULL,
    company_id bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    raw_payload jsonb NOT NULL,
    imported_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (source_kind, source_id)
);

CREATE TABLE IF NOT EXISTS import_rejections (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    batch_id bigint NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
    source_ref text NOT NULL,
    payload jsonb NOT NULL,
    errors text[] NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS companies_city_idx ON companies (city);
CREATE INDEX IF NOT EXISTS companies_category_idx ON companies (category);
CREATE INDEX IF NOT EXISTS companies_name_trgm_idx ON companies USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS company_source_records_company_id_idx ON company_source_records (company_id);
CREATE INDEX IF NOT EXISTS import_rejections_batch_id_idx ON import_rejections (batch_id);
