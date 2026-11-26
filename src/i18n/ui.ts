import type { Locale } from "./locales";

// Strings used by the shared UI components in src/ui. Page-specific text stays
// in its feature dictionary.
export const uiText = {
  en: {
    close: "Close",
    dismiss: "Dismiss",
    retry: "Try again",
    darkTheme: "Dark theme",
    notifications: "Notifications",
    moreActions: "More actions",
  },
  ar: {
    close: "إغلاق",
    dismiss: "تجاهل",
    retry: "حاول مجددًا",
    darkTheme: "المظهر الداكن",
    notifications: "الإشعارات",
    moreActions: "إجراءات أخرى",
  },
} as const satisfies Record<Locale, Record<string, string>>;

export type UiText = (typeof uiText)[Locale];
