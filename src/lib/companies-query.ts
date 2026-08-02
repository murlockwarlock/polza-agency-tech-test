import { getPool } from "./database";

export type CompanyListItem = {
  id: string;
  name: string;
  category: string;
  city: string;
  address: string;
  rating: number | null;
  reviewsCount: number;
  site: string | null;
  phone: string | null;
  totalCount: number;
};

export type CompanyFilters = {
  search: string;
  city: string;
  page: number;
  pageSize: number;
};

export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

export async function getCompanies(filters: CompanyFilters): Promise<CompanyListItem[]> {
  const offset = (filters.page - 1) * filters.pageSize;
  const search = escapeLikePattern(filters.search);
  const result = await getPool().query<{
    id: string;
    name: string;
    category: string;
    city: string;
    address: string;
    rating: number | null;
    reviews_count: number;
    site: string | null;
    phone: string | null;
    total_count: string;
  }>(
    `
      SELECT
        id,
        name,
        category,
        city,
        address,
        rating::float8 AS rating,
        reviews_count,
        site,
        phone,
        COUNT(*) OVER() AS total_count
      FROM companies
      WHERE ($1 = '' OR name ILIKE ('%' || $1 || '%') ESCAPE E'\\\\')
        AND ($2 = '' OR city = $2)
      ORDER BY name, id
      LIMIT $3 OFFSET $4
    `,
    [search, filters.city, filters.pageSize, offset],
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    city: row.city,
    address: row.address,
    rating: row.rating,
    reviewsCount: row.reviews_count,
    site: row.site,
    phone: row.phone,
    totalCount: Number(row.total_count),
  }));
}

export async function getCities(): Promise<string[]> {
  const result = await getPool().query<{ city: string }>("SELECT DISTINCT city FROM companies ORDER BY city");
  return result.rows.map((row) => row.city);
}
