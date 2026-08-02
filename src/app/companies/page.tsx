import Link from "next/link";
import { getCities, getCompanies } from "@/lib/companies-query";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function pageLink(page: number, search: string, city: string): string {
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (city) params.set("city", city);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/companies?${query}` : "/companies";
}

export default async function CompaniesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const search = first(params.q).trim().slice(0, 100);
  const city = first(params.city).trim().slice(0, 100);
  const requestedPage = Number(first(params.page));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const pageSize = 25;
  const [companies, cities] = await Promise.all([
    getCompanies({ search, city, page, pageSize }),
    getCities(),
  ]);
  const total = companies[0]?.totalCount ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(page * pageSize, total);

  return (
    <main>
      <header className="hero">
        <div className="shell hero-inner">
          <div className="eyebrow"><span /> Polza Agency · Data Explorer</div>
          <div className="hero-copy">
            <div>
              <h1>Компании</h1>
              <p>Чистый каталог организаций из внутренней выгрузки</p>
            </div>
            <div className="database-status"><i /> PostgreSQL подключён</div>
          </div>
        </div>
      </header>

      <section className="shell content">
        <form className="filters" method="get">
          <label className="search-field">
            <span>Название компании</span>
            <div className="input-wrap">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m21 21-4.35-4.35m2.35-5.15a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z" /></svg>
              <input name="q" defaultValue={search} placeholder="Например, Восток" autoComplete="off" />
            </div>
          </label>
          <label>
            <span>Город</span>
            <select name="city" defaultValue={city}>
              <option value="">Все города</option>
              {cities.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <button type="submit">Найти</button>
          {(search || city) && <Link className="reset" href="/companies">Сбросить</Link>}
        </form>

        <div className="result-head">
          <div>
            <h2>Результаты</h2>
            <p>{total ? `Показаны ${from}–${to} из ${total}` : "Ничего не найдено"}</p>
          </div>
          <div className="page-count">Страница {page} из {pages}</div>
        </div>

        <div className="table-card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Компания</th>
                  <th>Категория</th>
                  <th>Город и адрес</th>
                  <th>Рейтинг</th>
                  <th>Контакты</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((company) => (
                  <tr key={company.id}>
                    <td data-label="Компания"><strong>{company.name}</strong></td>
                    <td data-label="Категория"><span className="category">{company.category}</span></td>
                    <td data-label="Город и адрес"><strong>{company.city}</strong><small>{company.address}</small></td>
                    <td data-label="Рейтинг">
                      {company.rating === null
                        ? <span className="muted">Нет оценки</span>
                        : <div className="rating"><b>★ {company.rating.toFixed(1)}</b><small>{company.reviewsCount} отзывов</small></div>}
                    </td>
                    <td className="contacts" data-label="Контакты">
                      {company.site && <a href={company.site} target="_blank" rel="noreferrer">Открыть сайт ↗</a>}
                      {company.phone && <a href={`tel:${company.phone.replace(/\D/g, "")}`}>{company.phone}</a>}
                      {!company.site && !company.phone && <span className="muted">Не указаны</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!companies.length && <div className="empty"><span>⌕</span><h3>Компаний не найдено</h3><p>Попробуйте изменить название или город.</p></div>}
        </div>

        {total > pageSize && (
          <nav className="pagination" aria-label="Пагинация">
            {page > 1
              ? <Link href={pageLink(page - 1, search, city)}>← Назад</Link>
              : <span>← Назад</span>}
            <b>{page}</b>
            {page < pages
              ? <Link href={pageLink(page + 1, search, city)}>Вперёд →</Link>
              : <span>Вперёд →</span>}
          </nav>
        )}
      </section>
    </main>
  );
}
