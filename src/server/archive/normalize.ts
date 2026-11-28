/**
 * Search text folding shared by the archive (server) and client-side
 * filters: NFC, Arabic tatweel (U+0640), harakat (U+064B–U+0652) and the
 * superscript alef (U+0670) removed, lower case. Pure, so client components
 * may import it.
 */
export function normalizeArchiveText(value: string) {
  return value.normalize("NFC").replace(/\u0640|[\u064b-\u0652]|\u0670/gu, "").toLowerCase();
}
