SELECT
    category,
    COUNT(*) AS companies_count
FROM companies
GROUP BY category
ORDER BY companies_count DESC, category
LIMIT 5;

SELECT
    city,
    ROUND(AVG(rating), 2) AS average_rating,
    COUNT(*) AS companies_count
FROM companies
WHERE reviews_count >= 10
  AND rating IS NOT NULL
GROUP BY city
ORDER BY average_rating DESC, city;

SELECT
    category,
    COUNT(*) AS companies_count,
    COUNT(*) FILTER (WHERE site IS NOT NULL) AS companies_with_site,
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE site IS NOT NULL) / NULLIF(COUNT(*), 0),
        2
    ) AS website_share_percent
FROM companies
GROUP BY category
ORDER BY website_share_percent DESC, category;
