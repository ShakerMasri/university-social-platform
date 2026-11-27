import { feedText } from "@/i18n/feed";
export default function LoadingFeed() {
  return <p role="status" aria-busy="true"><span lang="en">{feedText.en.loading}</span> / <span lang="ar" dir="rtl">{feedText.ar.loading}</span></p>;
}
