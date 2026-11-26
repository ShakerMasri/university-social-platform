// Pure helpers for initials avatars (plan decision 9). Kept separate from the
// component so they can be unit tested.

export const avatarToneCount = 4;
const zeroWidthNonJoiner = "‌";
const arabicLetter = /\p{Script=Arabic}/u;

function firstGrapheme(word: string) {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  for (const { segment } of segmenter.segment(word)) return segment;
  return "";
}

/**
 * Up to two initials from a display name: the first character of the first
 * and last words. Arabic initials are separated by a zero-width non-joiner so
 * they render as separate letters instead of joining into a word.
 */
export function avatarInitials(name: string) {
  const words = name.trim().split(/\s+/u).filter((word) => /[\p{L}\p{N}]/u.test(word));
  if (words.length === 0) return "?";
  const letters = [firstGrapheme(words[0]), ...(words.length > 1 ? [firstGrapheme(words[words.length - 1])] : [])]
    .map((letter) => letter.toLocaleUpperCase());
  return letters.length === 2 && letters.every((letter) => arabicLetter.test(letter))
    ? letters.join(zeroWidthNonJoiner)
    : letters.join("");
}

/** Deterministic tone 1–4 from a stable user id (32-bit FNV-1a). */
export function avatarTone(seed: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return ((hash >>> 0) % avatarToneCount) + 1;
}
