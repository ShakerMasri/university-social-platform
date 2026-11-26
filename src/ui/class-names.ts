/** Joins truthy class names with single spaces. */
export function classNames(...names: Array<string | false | null | undefined>) {
  return names.filter(Boolean).join(" ");
}
