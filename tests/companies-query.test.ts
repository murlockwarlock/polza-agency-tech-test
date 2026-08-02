import { describe, expect, it } from "vitest";
import { escapeLikePattern } from "../src/lib/companies-query";

describe("escapeLikePattern", () => {
  it("escapes SQL LIKE metacharacters", () => {
    expect(escapeLikePattern("100%_\\ready")).toBe("100\\%\\_\\\\ready");
  });
});
