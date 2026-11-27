import { describe, expect, it } from "vitest";
import { collectMercadoPagoIds, mergeIds, resolveIdArg } from "./mp-sandbox-ids";

describe("collectMercadoPagoIds", () => {
  it("collects full ids from id-like keys at any depth, as strings", () => {
    expect(collectMercadoPagoIds({
      id: "2c9380847e9b451c017ea1bd70ba0219",
      collector_id: 1234567890,
      currency_id: "ARS",
      results: [{ id: 6114264375, payment: { id: 1319718291 } }],
      query: { "data.id": "1319718291" },
    }).sort()).toEqual(["1234567890", "1319718291", "2c9380847e9b451c017ea1bd70ba0219", "6114264375"]);
  });
});

describe("mergeIds", () => {
  it("adds new ids without duplicates", () => {
    expect(mergeIds(["a1b2c3d4e5"], ["a1b2c3d4e5", "9999999999"])).toEqual(["a1b2c3d4e5", "9999999999"]);
  });
});

describe("resolveIdArg", () => {
  const known = ["2c9380847e9b451c017ea1bd70ba0219", "1319718291", "1319000000"];

  it("resolves a redacted short id (with or without the ellipsis) to the full id", () => {
    expect(resolveIdArg("2c9380…", known)).toBe("2c9380847e9b451c017ea1bd70ba0219");
    expect(resolveIdArg("2c9380", known)).toBe("2c9380847e9b451c017ea1bd70ba0219");
    expect(resolveIdArg("2c9380...", known)).toBe("2c9380847e9b451c017ea1bd70ba0219");
  });

  it("passes full or unknown ids through unchanged", () => {
    expect(resolveIdArg("1319718291", known)).toBe("1319718291");
    expect(resolveIdArg("777777", known)).toBe("777777");
  });

  it("refuses an ambiguous prefix", () => {
    expect(() => resolveIdArg("131971…", [...known, "1319719999"])).toThrow(/ambiguo/);
  });
});
