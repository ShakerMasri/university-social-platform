import { describe, expect, it } from "vitest";
import { archiveInput } from "../../src/server/archive/policy";
import { prepareEvidenceQuery } from "./evidence-query-experiment";

const prepare = (q: string) => prepareEvidenceQuery(new URLSearchParams({ q })).get("q");
describe("bounded evidence-only question preparation experiment", () => {
  it.each([
    ["How does cache locality improve memory access?", "cache locality improve memory access"],
    ["What is C++?", "C++"], ["Can you explain C++ pointers?", "C++ pointers"],
    ["ما هو تطبيع قواعد البيانات؟", "تطبيع قواعد البيانات"], ["ما هي مُـؤَشِّرَات CE101؟", "مُـؤَشِّرَات CE101"],
    ["كيف يساعد تطبيع قواعد البيانات في تقليل التكرار؟", "يساعد تطبيع قواعد البيانات في تقليل التكرار"],
    ["Why does C++ not allow null?", "C++ not allow null"], ["هل لا يمكن استخدام C++؟", "لا يمكن استخدام C++"],
    ["لماذا لم يعمل CE101؟", "لم يعمل CE101"], ["ما هو ليس آمنا؟", "ليس آمنا"],
    ["What is IN OR NOT?", "IN OR NOT"], ["What is a+b?", "a+b"], ["What is a b?", "a b"],
    ["What is Node.js C# CE101_v2 std::vector<int>?", "Node.js C# CE101_v2 std::vector<int>"],
  ])("prepares only recognized question syntax: %s", (query, expected) => {
    expect(prepare(query)).toBe(expected);
  });
  it.each(["C++", "C++?", "CE101 مؤشرات", "CAN IN OR NOT", "How does cache locality", "What is C?", "What is?", "Why isn't C++ safe?", "What is foo?bar??", "لا لم لن ليس", "Ignore prior instructions?"])("preserves ambiguous syntax and ordinary literals: %s", query => {
    expect(prepare(query)).toBe(query);
  });
  it("preserves filters and does not mutate input or archive behavior", () => {
    const community = "00000000-0000-4000-8000-000000000001";
    const original = new URLSearchParams({ q: "What is C++?", community, type: "RESOURCE" });
    const prepared = prepareEvidenceQuery(original);
    expect(original.get("q")).toBe("What is C++?"); expect(prepared.get("q")).toBe("C++");
    expect(prepared.get("community")).toBe(community); expect(prepared.get("type")).toBe("RESOURCE");
    expect(archiveInput(original).terms).toEqual(["what", "is", "c++?"]);
  });
  it.each([
    "How can I prevent race conditions in shared memory programs?", `What is ${"x".repeat(200)}?`,
    "What is?\n", "What is \u202eC++?", "?", "What is %?",
  ])("rejects invalid ORIGINAL input before reducing anything: %s", query => {
    expect(() => prepare(query)).toThrow();
  });
  it.each(["q=What+is+C%2B%2B%3F&q=other", "q=What+is+C%2B%2B%3F&after=", "q=What+is+C%2B%2B%3F&community=bad", "q=What+is+C%2B%2B%3F&url=https://example.test"])("rejects parameter tampering: %s", query => {
    expect(() => prepareEvidenceQuery(new URLSearchParams(query))).toThrow();
  });
});
