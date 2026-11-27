import type { Page } from "@playwright/test";
import { shellText } from "../../src/i18n/shell";
import { notificationText } from "../../src/i18n/notifications";

// Client-side navigation through the app shell (UI rebuild Stage 1), for
// suites that test what survives a navigation. Each uses a real shell control.
type Locale = "en" | "ar";

/** Profile and settings, through the header account menu. */
export async function openProfileFromShell(page: Page, locale: Locale) {
  await page.getByRole("banner").getByRole("button", { name: shellText[locale].account, exact: true }).click();
  await page.getByRole("menuitem", { name: shellText[locale].profileSettings, exact: true }).click();
}

/** The notifications page, through the header preview's "See all" link. */
export async function openNotificationsFromShell(page: Page, locale: Locale) {
  // The button's name carries the unread count when there is one.
  await page.getByRole("banner").getByRole("button", { name: new RegExp(`^${notificationText[locale].title}`) }).click();
  await page.getByRole("link", { name: shellText[locale].notificationsSeeAll, exact: true }).click();
}

/** A link in the desktop main navigation (Home, Communities, Messages). */
export function primaryNavLink(page: Page, locale: Locale, name: string) {
  return page.getByRole("navigation", { name: shellText[locale].navigation, exact: true }).getByRole("link", { name, exact: true });
}

/** A header element that stays in place across navigation: the home link. */
export function headerHomeLink(page: Page, locale: Locale) {
  return page.locator(`header a[href='/${locale}']`).first();
}
