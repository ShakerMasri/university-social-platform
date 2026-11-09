import type { Message } from "./data";

// A sliding window bounds DOM/text memory while still allowing arbitrarily old
// pages. Refresh returns to the latest batch after newer rows leave the window.
const historyWindowSize = 200;
export function prependOlderMessages(older: Message[], current: Message[]) {
  const seen = new Set<string>();
  const combined = [...older, ...current].filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id); return true;
  });
  return { items: combined.slice(0, historyWindowSize), omittedNewer: combined.length > historyWindowSize };
}
