import { describe, expect, it } from "vitest";
import { makeIdentityKey, prepareImport, validateCompany } from "../src/lib/company";

const validCompany = {
  id: "c_000001",
  name: "ООО «Прайм Медиа»",
  category: "Типография",
  city: "Челябинск",
  address: "ул. Южная, д. 96",
  rating: 4.1,
  reviews_count: 191,
  site: null,
  phone: "+7 (495) 248-44-40",
};

describe("validateCompany", () => {
  it("normalizes and accepts a valid company", () => {
    const result = validateCompany({ ...validCompany, name: "  ООО   «Прайм Медиа»  " });

    expect(result.errors).toEqual([]);
    expect(result.value).toMatchObject({ name: "ООО «Прайм Медиа»", rating: 4.1 });
  });

  it("accepts a missing rating", () => {
    const result = validateCompany({ ...validCompany, rating: null });

    expect(result.errors).toEqual([]);
    expect(result.value?.rating).toBeNull();
  });

  it.each([
    [{ rating: "N/A" }, "rating должен быть числом"],
    [{ rating: 7.2 }, "rating должен быть от 0 до 5"],
    [{ reviews_count: -10 }, "reviews_count должен быть целым"],
    [{ reviews_count: "45.5" }, "reviews_count должен быть целым"],
    [{ site: "htp://broken.test" }, "site должен быть корректным"],
    [{ phone: "+7" }, "phone имеет неверный формат"],
  ])("rejects invalid input %o", (patch, expected) => {
    const result = validateCompany({ ...validCompany, ...patch });

    expect(result.errors.join(" ")).toContain(expected);
  });

  it("detects mojibake", () => {
    const result = validateCompany({ ...validCompany, city: "РњРѕСЃРєРІР°" });

    expect(result.errors.join(" ")).toContain("битой кодировки");
  });
});

describe("deduplication", () => {
  it("treats quote-only name differences as the same identity", () => {
    const withQuotes = makeIdentityKey("АО «Сокол»", "Пермь", "ул. Советская, д. 81");
    const withoutQuotes = makeIdentityKey("АО Сокол", "Пермь", "ул. Советская, д. 81");

    expect(withQuotes).toBe(withoutQuotes);
  });

  it("drops exact repeated source rows", () => {
    const prepared = prepareImport([
      { sourceRef: "page_001.json:1", payload: validCompany },
      { sourceRef: "page_010.json:2", payload: validCompany },
    ]);

    expect(prepared.sourceRecords).toHaveLength(1);
    expect(prepared.companies).toHaveLength(1);
    expect(prepared.duplicateRows).toBe(1);
    expect(prepared.rejections).toHaveLength(0);
  });

  it("quarantines a conflicting repeated source id", () => {
    const prepared = prepareImport([
      { sourceRef: "page_001.json:1", payload: validCompany },
      { sourceRef: "page_002.json:1", payload: { ...validCompany, city: "Москва" } },
    ]);

    expect(prepared.sourceRecords).toHaveLength(1);
    expect(prepared.rejections[0].errors.join(" ")).toContain("повторяется с другими данными");
  });
});
