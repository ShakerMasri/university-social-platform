/**
 * Display text for a badge count, formatted for the locale like the rest of
 * the interface: "" for zero or invalid input, the number up to `cap`, then
 * "<cap>+".
 */
export function formatCount(count: number, locale: string, cap = 99) {
  if (!Number.isFinite(count)) return "";
  const whole = Math.floor(count);
  if (whole <= 0) return "";
  const safeCap = Math.max(1, Math.floor(cap));
  const format = new Intl.NumberFormat(locale);
  return whole > safeCap ? `${format.format(safeCap)}+` : format.format(whole);
}
