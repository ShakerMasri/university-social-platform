import type { Locale } from "./locales";
const english = {
  title: "Study archive", intro: "Find earlier discussions across the communities you can read. Results are ordered by post date, newest first.",
  query: "Study keywords", hint: "Use 2–200 characters and up to eight words. All words must occur in a post or in one comment. Arabic vowel marks and tatweel are ignored. No translation or spelling correction.",
  community: "Community", allCommunities: "All readable communities", moreCommunities: "For another community, open it from the community directory and choose Search this community.",
  allTypes: "All post types", submit: "Search archive", initial: "Enter study keywords to search earlier posts and comments.", loading: "Searching…", results: "Search results",
  empty: "No matching discussions you can read. Try different keywords or filters.", invalid: "Check your keywords and filters, or start a new search if the page link has expired.",
  unavailable: "This content is unavailable or your access has changed. Start a new search.", failed: "Search could not finish. Try again.", rate: "Too many searches. Try again later.",
  next: "Next results", retry: "Retry search", postMatch: "Matched post", commentMatch: "Matched comment or reply", open: "Open discussion", scoped: "Search this community",
  interrupted: "Access changed during this search. Start a new search to see the current results.",
};
export const archiveText: Record<Locale, typeof english> = {
  en: english,
  ar: {
    title: "الأرشيف الدراسي", intro: "ابحث في النقاشات السابقة ضمن المجتمعات المتاحة لك. تُرتّب النتائج حسب تاريخ المنشور، الأحدث أولًا.",
    query: "كلمات دراسية", hint: "استخدم من حرفين إلى 200 حرف وبحد أقصى ثماني كلمات. يجب أن ترد جميع الكلمات في منشور أو تعليق واحد. يُتجاهل التشكيل الشائع والتطويل، دون ترجمة أو تصحيح إملائي.",
    community: "المجتمع", allCommunities: "جميع المجتمعات المتاحة", moreCommunities: "للبحث في مجتمع آخر، افتحه من دليل المجتمعات واختر البحث في هذا المجتمع.",
    allTypes: "جميع أنواع المنشورات", submit: "البحث في الأرشيف", initial: "أدخل كلمات دراسية للبحث في المنشورات والتعليقات السابقة.", loading: "جارٍ البحث…", results: "نتائج البحث",
    empty: "لا توجد نقاشات مطابقة متاحة لك. جرّب كلمات أو مرشحات أخرى.", invalid: "تحقق من الكلمات والمرشحات، أو ابدأ بحثًا جديدًا إذا انتهت صلاحية رابط الصفحة.",
    unavailable: "هذا المحتوى غير متاح أو تغيّرت صلاحياتك. ابدأ بحثًا جديدًا.", failed: "تعذر إكمال البحث. حاول مجددًا.", rate: "عمليات بحث كثيرة. حاول لاحقًا.",
    next: "النتائج التالية", retry: "إعادة محاولة البحث", postMatch: "تطابق في المنشور", commentMatch: "تطابق في تعليق أو رد", open: "فتح النقاش", scoped: "البحث في هذا المجتمع",
    interrupted: "تغيّرت الصلاحيات أثناء البحث. ابدأ بحثًا جديدًا لعرض النتائج الحالية.",
  },
};
