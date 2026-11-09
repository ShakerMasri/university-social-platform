import { describe, expect, it } from "vitest";
import { prependOlderMessages } from "./history-window";
import type { Message } from "./data";

const message = (index: number): Message => ({ id: String(index), body: `Message ${index}`, mine: false, createdAt: new Date(index * 1000).toISOString() });
describe("older conversation history window", () => {
  it("prepends chronological older messages without duplicating an overlapping boundary or changing the input", () => {
    const older = [message(1), message(2)], current = [message(2), message(3)];
    const result = prependOlderMessages(older, current);
    expect(result.items.map(item => item.id)).toEqual(["1", "2", "3"]);
    expect(result.omittedNewer).toBe(false);
    expect(current.map(item => item.id)).toEqual(["2", "3"]);
  });
  it("keeps the older edge traversable while bounding a long reading session, then allows a fresh latest window", () => {
    let current = Array.from({ length: 20 }, (_, index) => message(index + 220));
    let omitted = false;
    for (let start = 200; start >= 0; start -= 20) {
      const result = prependOlderMessages(Array.from({ length: 20 }, (_, index) => message(start + index)), current);
      current = result.items; omitted ||= result.omittedNewer;
    }
    expect(current).toHaveLength(200); expect(omitted).toBe(true);
    expect(current[0].id).toBe("0"); expect(current.at(-1)!.id).toBe("199");
    expect(new Set(current.map(item => item.id)).size).toBe(200);
  });
});
