import { locales } from "@/i18n/locales";
import { shellText } from "@/i18n/shell";
import { LogoMark } from "@/ui/icons";
import { BareFrame } from "./shell/frame-basics";
import { NotFoundContent } from "./shell/status-content";
import { ByLocale } from "./shell/by-locale";
import styles from "./shell/not-found.module.css";

/**
 * Localized 404 (HTTP 404). not-found files receive no params, so the three
 * variants render on the server and a tiny client switch picks one by the
 * URL. This boundary sits above every page, so it must stay light: anything
 * it imports as client code is sent to every route, so its frame has no
 * theme or language switch (the browser back button and Go to Home remain). An unsupported locale
 * (for example /fr) has no language to choose, so that page is bilingual.
 */
export default function NotFound() {
  return (
    <ByLocale
      en={<BareFrame locale="en"><NotFoundContent locale="en" /></BareFrame>}
      ar={<BareFrame locale="ar"><NotFoundContent locale="ar" /></BareFrame>}
      other={
        <main id="main-content" className={styles.bilingual}>
          <LogoMark size={40} />
          <h1 className={styles.code}>404</h1>
          {locales.map((locale) => (
            <section key={locale} lang={locale} dir={locale === "ar" ? "rtl" : "ltr"} className={styles.message}>
              <h2 className={styles.title}>{shellText[locale].notFoundTitle}</h2>
              <p>{shellText[locale].notFoundBody}</p>
              <p><a href={`/${locale}`}>{shellText[locale].backHome}</a></p>
            </section>
          ))}
        </main>
      }
    />
  );
}
