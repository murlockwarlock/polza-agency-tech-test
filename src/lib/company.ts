import { createHash } from "node:crypto";

export type Company = {
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

export type RawImportRow = {
  sourceRef: string;
  payload: unknown;
};

export type RejectedRow = {
  sourceRef: string;
  payload: Record<string, unknown>;
  errors: string[];
};

export type PreparedImport = {
  companies: Company[];
  sourceRecords: Company[];
  rejections: RejectedRow[];
  duplicateRows: number;
};

const companyFields = ["id", "name", "category", "city", "address", "rating", "reviews_count", "site", "phone"] as const;
const phonePattern = /^\+7 \(\d{3}\) \d{3}-\d{2}-\d{2}$/;
const mojibakePattern = /Р[ЂЃ‚ѓ„…†‡€‰Љ‹ЊЌЋЏђѓќћџ°±²µ¶·»—]|С[ЂЃ‚ѓ„…†‡€‰Љ‹ЊЌЋЏђѓќћџ]|В[«»]/u;
const cityAliases = new Map([
  ["moscow", "Москва"],
  ["москва", "Москва"],
  ["санкат-петербург", "Санкт-Петербург"],
]);

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.normalize("NFKC").trim().replace(/\s+/g, " ") : "";
}

export function normalizeCity(value: string): string {
  const normalized = normalizeText(value);
  return cityAliases.get(normalized.toLocaleLowerCase("ru-RU")) ?? normalized;
}

function identityPart(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

export function makeIdentityKey(name: string, city: string, address: string): string {
  const identity = [name, city, address].map(identityPart).join("|");
  return createHash("sha256").update(identity).digest("hex");
}

function parseRating(value: unknown, errors: string[]): number | null {
  if (value === null || value === undefined || value === "") return null;
  if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") {
    errors.push("rating должен быть числом или null");
    return null;
  }
  const rating = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(rating)) {
    errors.push("rating должен быть числом или null");
    return null;
  }
  if (rating < 0 || rating > 5) errors.push("rating должен быть от 0 до 5");
  return rating;
}

function parseReviewsCount(value: unknown, errors: string[]): number {
  const count = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(count) || count < 0) {
    errors.push("reviews_count должен быть целым неотрицательным числом");
    return 0;
  }
  return count;
}

function parseSite(value: unknown, errors: string[]): string | null {
  const site = normalizeText(value);
  if (!site) return null;
  try {
    const parsed = new URL(site);
    if (!(["http:", "https:"] as string[]).includes(parsed.protocol) || !parsed.hostname) throw new Error();
  } catch {
    errors.push("site должен быть корректным HTTP(S) URL или null");
  }
  return site;
}

function parsePhone(value: unknown, errors: string[]): string | null {
  const phone = normalizeText(value);
  if (!phone) return null;
  if (!phonePattern.test(phone)) errors.push("phone имеет неверный формат");
  return phone;
}

export function validateCompany(payload: unknown): { value?: Company; errors: string[] } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { errors: ["строка должна быть объектом"] };
  }

  const raw = payload as Record<string, unknown>;
  const errors: string[] = [];
  const unexpected = Object.keys(raw).filter((key) => !companyFields.includes(key as (typeof companyFields)[number]));
  if (unexpected.length) errors.push(`неожиданные поля: ${unexpected.join(", ")}`);

  const sourceId = normalizeText(raw.id);
  const name = normalizeText(raw.name);
  const category = normalizeText(raw.category);
  const city = normalizeCity(normalizeText(raw.city));
  const address = normalizeText(raw.address);

  if (!/^c_\d{6}$/.test(sourceId)) errors.push("id должен соответствовать c_000000");
  for (const [field, value] of Object.entries({ name, category, city, address })) {
    if (!value) errors.push(`${field} обязателен`);
    if (mojibakePattern.test(value)) errors.push(`${field} содержит признаки битой кодировки`);
  }

  const rating = parseRating(raw.rating, errors);
  const reviewsCount = parseReviewsCount(raw.reviews_count, errors);
  const site = parseSite(raw.site, errors);
  const phone = parsePhone(raw.phone, errors);

  if (errors.length) return { errors };

  return {
    errors,
    value: {
      sourceId,
      identityKey: makeIdentityKey(name, city, address),
      name,
      category,
      city,
      address,
      rating,
      reviewsCount,
      site,
      phone,
      raw,
    },
  };
}

function comparableRow(company: Company): string {
  return JSON.stringify({
    sourceId: company.sourceId,
    identityKey: company.identityKey,
    name: company.name,
    category: company.category,
    city: company.city,
    address: company.address,
    rating: company.rating,
    reviewsCount: company.reviewsCount,
    site: company.site,
    phone: company.phone,
  });
}

export function prepareImport(rows: RawImportRow[]): PreparedImport {
  const sourceRecords: Company[] = [];
  const companiesByIdentity = new Map<string, Company>();
  const companiesBySourceId = new Map<string, Company>();
  const rejections: RejectedRow[] = [];
  let duplicateRows = 0;

  for (const row of rows) {
    const parsed = validateCompany(row.payload);
    if (!parsed.value) {
      rejections.push({
        sourceRef: row.sourceRef,
        payload: row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? row.payload as Record<string, unknown> : { value: row.payload },
        errors: parsed.errors,
      });
      continue;
    }

    const previous = companiesBySourceId.get(parsed.value.sourceId);
    if (previous) {
      if (comparableRow(previous) === comparableRow(parsed.value)) {
        duplicateRows += 1;
      } else {
        rejections.push({
          sourceRef: row.sourceRef,
          payload: parsed.value.raw,
          errors: [`id ${parsed.value.sourceId} повторяется с другими данными`],
        });
      }
      continue;
    }

    companiesBySourceId.set(parsed.value.sourceId, parsed.value);
    companiesByIdentity.set(parsed.value.identityKey, parsed.value);
    sourceRecords.push(parsed.value);
  }

  return {
    companies: [...companiesByIdentity.values()],
    sourceRecords,
    rejections,
    duplicateRows,
  };
}
