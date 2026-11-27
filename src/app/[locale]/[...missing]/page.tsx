import { notFound } from "next/navigation";

// Any path under a supported locale that matches no page gets the localized
// 404 (HTTP 404) inside that locale's layout.
export default function MissingPage(): never {
  notFound();
}
