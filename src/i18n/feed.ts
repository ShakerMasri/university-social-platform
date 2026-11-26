import type { Locale } from "./locales";

export const feedText = {
  en: {
    forYou: "For you", forYouIntro: "Recent public posts and posts from communities you joined, with a fixed 72-hour boost for joined communities.",
    navigation: "Feeds", joinedReason: "From a community you joined", publicReason: "Recent public post",
    coldStart: "These are general public discoveries. Join communities to include their posts with a 72-hour boost.",
    archive: "Search the archive", forYouEmpty: "No eligible posts yet. Explore communities or search the archive.",
    title: "Your communities", intro: "The latest posts from communities you have joined.",
    results: "Community posts", loading: "Loading your feed…", empty: "No posts yet. Join a community or return when someone has posted.",
    discover: "Explore communities", next: "Next posts", refresh: "Refresh feed", retry: "Retry", end: "You have reached the end of this feed.",
    failed: "Your feed could not be loaded. Please retry.", rate: "Too many feed requests. Please try again later.",
    restart: "Your access or feed has changed. Refresh the feed to continue.",
    unavailable: "This feed is unavailable. Reopen the page to check your access.", reopen: "Reopen feed",
    paused: "Refresh the feed to check your current access and load posts.", community: "Community",
  },
  ar: {
    forYou: "لك", forYouIntro: "منشورات عامة حديثة ومنشورات من مجتمعات انضممت إليها، مع إضافة ثابتة قدرها 72 ساعة إلى وقت ترتيب منشورات المجتمعات المنضم إليها.",
    navigation: "قوائم المنشورات", joinedReason: "من مجتمع انضممت إليه", publicReason: "منشور عام حديث",
    coldStart: "هذه منشورات عامة للاستكشاف. انضم إلى مجتمعات لإدراج منشوراتها مع إضافة 72 ساعة إلى وقت ترتيبها.",
    archive: "ابحث في الأرشيف", forYouEmpty: "لا توجد منشورات متاحة بعد. استكشف المجتمعات أو ابحث في الأرشيف.",
    title: "مجتمعاتك", intro: "أحدث المنشورات من المجتمعات التي انضممت إليها.",
    results: "منشورات المجتمعات", loading: "جارٍ تحميل المنشورات…", empty: "لا توجد منشورات بعد. انضم إلى مجتمع أو عد بعد نشر محتوى جديد.",
    discover: "استكشف المجتمعات", next: "المنشورات التالية", refresh: "تحديث المنشورات", retry: "إعادة المحاولة", end: "وصلت إلى نهاية المنشورات.",
    failed: "تعذر تحميل المنشورات. أعد المحاولة.", rate: "طلبات كثيرة للمنشورات. حاول لاحقًا.",
    restart: "تغيرت صلاحياتك أو المنشورات. حدّث المنشورات للمتابعة.",
    unavailable: "المنشورات غير متاحة. أعد فتح الصفحة للتحقق من صلاحياتك.", reopen: "أعد فتح المنشورات",
    paused: "حدّث المنشورات للتحقق من صلاحياتك الحالية وتحميل المحتوى.", community: "المجتمع",
  },
} satisfies Record<Locale, Record<string, string>>;
