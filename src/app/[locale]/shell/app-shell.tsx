import type { ReactNode } from "react";
import type { Locale } from "@/i18n/locales";
import { readThemePreference } from "@/ui/server-theme";
import { loadViewer } from "./viewer";
import { ShellFrame } from "./shell-frame";

/**
 * The signed-in pages' frame, rendered by the (app) group layout: search,
 * navigation and account controls. Sign-in and verify use the slim
 * EntryFrame instead. A layout persists across client navigations;
 * router.refresh() (used after session changes) renders it again with a
 * fresh viewer.
 */
export async function AppShell({ locale, children }: { locale: Locale; children: ReactNode }) {
  const viewer = await loadViewer();
  const theme = await readThemePreference();
  return <ShellFrame locale={locale} viewer={viewer} theme={theme}>{children}</ShellFrame>;
}
