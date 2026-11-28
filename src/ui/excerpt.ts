/** Longest excerpt shown on a post card, in user-perceived characters (graphemes). */
export const excerptLength = 280;

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/**
 * A one-paragraph preview of post text: line breaks and runs of spaces become
 * one space, and long text is cut at a word boundary where possible. Counts
 * graphemes, so an Arabic letter with its marks, or an emoji sequence, is
 * never split.
 */
export function excerpt(text: string, limit = excerptLength) {
  const flat = text.replace(/\s+/gu, " ").trim();
  const characters = Array.from(graphemes.segment(flat), (part) => part.segment);
  if (characters.length <= limit) return flat;
  const cut = characters.slice(0, limit).join("");
  const space = cut.lastIndexOf(" ");
  return `${(space > cut.length / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
