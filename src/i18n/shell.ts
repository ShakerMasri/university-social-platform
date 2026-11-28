import type { Locale } from "./locales";
import { unreadCountLimit } from "../server/notifications/policy";

// Strings for the app shell: header, navigation, mobile bar, account menu,
// notifications preview, and the localized not-found page.
// `{count}` is replaced with a localized number.
export const shellText = {
  en: {
    navigation: "Main navigation",
    mobileNavigation: "Quick navigation",
    home: "Home",
    communities: "Communities",
    messages: "Messages",
    search: "Search",
    searchLabel: "Search posts and people",
    searchSubmit: "Search",
    more: "More",
    moreTitle: "More",
    account: "Account menu",
    profileSettings: "Profile and settings",
    signIn: "Sign in",
    signOut: "Sign out",
    signOutFailed: "You could not be signed out. Please try again.",
    switchLanguage: "Switch language",
    notificationsUnread: "Notifications, {count} unread",
    notificationsPreview: "Latest notifications",
    notificationsLoading: "Loading notifications…",
    notificationsEmpty: "You have no notifications yet.",
    notificationsFailed: "Notifications could not be loaded.",
    notificationsSeeAll: "See all notifications",
    notificationsOpenFailed: "That notification could not be opened.",
    unreadMarker: "Unread",
    footer: "A Computer Engineering graduation project. Not affiliated with or endorsed by any university.",
    notFoundTitle: "Page not found",
    notFoundBody: "This page does not exist, or the link is incomplete.",
    backHome: "Go to Home",
    sessionUnavailable: "Your session could not be checked.",
    landingSignIn: "Sign in with your university email",
  },
  ar: {
    navigation: "التنقل الرئيسي",
    mobileNavigation: "تنقل سريع",
    home: "الرئيسية",
    communities: "المجتمعات",
    messages: "الرسائل",
    search: "بحث",
    searchLabel: "ابحث في المنشورات والأشخاص",
    searchSubmit: "بحث",
    more: "المزيد",
    moreTitle: "المزيد",
    account: "قائمة الحساب",
    profileSettings: "الملف الشخصي والإعدادات",
    signIn: "تسجيل الدخول",
    signOut: "تسجيل الخروج",
    signOutFailed: "تعذر تسجيل خروجك. يرجى المحاولة مجددًا.",
    switchLanguage: "تغيير اللغة",
    notificationsUnread: "الإشعارات، {count} غير مقروءة",
    notificationsPreview: "أحدث الإشعارات",
    notificationsLoading: "جارٍ تحميل الإشعارات…",
    notificationsEmpty: "لا توجد إشعارات بعد.",
    notificationsFailed: "تعذر تحميل الإشعارات.",
    notificationsSeeAll: "عرض كل الإشعارات",
    notificationsOpenFailed: "تعذر فتح هذا الإشعار.",
    unreadMarker: "غير مقروء",
    footer: "مشروع تخرج في هندسة الحاسوب. غير تابع لأي جامعة ولا معتمد منها.",
    notFoundTitle: "الصفحة غير موجودة",
    notFoundBody: "هذه الصفحة غير موجودة، أو أن الرابط غير مكتمل.",
    backHome: "الذهاب إلى الرئيسية",
    sessionUnavailable: "تعذر التحقق من جلستك.",
    landingSignIn: "سجّل الدخول ببريدك الجامعي",
  },
} as const satisfies Record<Locale, Record<string, string>>;

export type ShellText = (typeof shellText)[Locale];

/** Fills `{count}` with a localized number, or "99+" above the header's unread limit. */
export function withUnreadCount(template: string, count: number, locale: Locale) {
  const shown = count > unreadCountLimit ? `${unreadCountLimit.toLocaleString(locale)}+` : count.toLocaleString(locale);
  return template.replace("{count}", shown);
}
