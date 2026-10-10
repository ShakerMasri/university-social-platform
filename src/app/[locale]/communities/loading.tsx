import { communityText } from "@/i18n/communities";
export default function Loading() {
  return <div role="status"><p lang="en" dir="ltr">{communityText.en.loading}</p><p lang="ar" dir="rtl">{communityText.ar.loading}</p></div>;
}
