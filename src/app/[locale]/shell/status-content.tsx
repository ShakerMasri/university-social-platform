import type { Locale } from "@/i18n/locales";
import { shellText } from "@/i18n/shell";
import { ButtonLink } from "@/ui/components/button";
import { ErrorState } from "@/ui/components/state";

/** Body of the localized 404 page. The page's only h1. */
export function NotFoundContent({ locale }: { locale: Locale }) {
  const text = shellText[locale];
  return (
    <>
      <h1 className="ui-visually-hidden">404</h1>
      <ErrorState
        title={text.notFoundTitle}
        description={text.notFoundBody}
        action={<ButtonLink href={`/${locale}`} variant="primary">{text.backHome}</ButtonLink>}
      />
    </>
  );
}
