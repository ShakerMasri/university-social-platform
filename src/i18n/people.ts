import type { Locale } from "./locales";

export const peopleText = {
  en: {
    title: "People", intro: "Find confirmed profiles across the university community.",
    query: "Search display names", hint: "Enter 2–60 characters. Search English or Arabic name parts in any order. Small typos in words of 3 or more letters are supported. Names may be shared by several people.",
    submit: "Search people", initial: "Search for a display name to begin.", results: "People results",
    empty: "No matching profiles. Try fewer name parts or another spelling. Accounts need a saved display name and verified email to appear here.", next: "Next profiles", retry: "Retry search", loading: "Searching…",
    settings: "Edit my profile",
    failed: "Could not load profiles. Try again.", invalid: "Check the query or start a new search.",
    unavailable: "This profile is unavailable or you do not have access.", rate: "Too many profile requests. Try again later.",
    back: "Back to People", profile: "Profile", notice: "This display name is chosen by the account holder. It does not establish identity or teacher status.",
    directoryHint: "Your saved display name is visible to verified signed-in users in People. Your email stays private.",
    suggestion: "Member", suggestionHint: "An editable suggested name. It contains no part of your email. Save it or choose another name.",
  },
  ar: {
    title: "الأشخاص", intro: "ابحث عن الملفات المؤكدة عبر مجتمع الجامعة.",
    query: "البحث بأسماء العرض", hint: "أدخل من حرفين إلى 60 حرفًا. ابحث بأجزاء الاسم العربي أو الإنجليزي بأي ترتيب. يدعم البحث الأخطاء البسيطة في الكلمات من 3 أحرف فأكثر. قد يشترك عدة أشخاص في الاسم نفسه.",
    submit: "البحث عن أشخاص", initial: "ابدأ بالبحث عن اسم عرض.", results: "نتائج الأشخاص",
    empty: "لا توجد ملفات مطابقة. جرّب أجزاء أقل من الاسم أو تهجئة أخرى. يحتاج الحساب إلى اسم عرض محفوظ وبريد مؤكد ليظهر هنا.", next: "الملفات التالية", retry: "إعادة البحث", loading: "جارٍ البحث…",
    settings: "تعديل ملفي الشخصي",
    failed: "تعذر تحميل الملفات. حاول مجددًا.", invalid: "تحقق من نص البحث أو ابدأ بحثًا جديدًا.",
    unavailable: "هذا الملف غير متاح أو ليس لديك صلاحية الوصول.", rate: "طلبات ملفات كثيرة. حاول لاحقًا.",
    back: "العودة إلى الأشخاص", profile: "الملف الشخصي", notice: "يختار صاحب الحساب اسم العرض. لا يثبت الاسم الهوية أو صفة المدرّس.",
    directoryHint: "اسم عرضك المحفوظ ظاهر للمستخدمين المؤكدين المسجلين في دليل الأشخاص. يظل بريدك خاصًا.",
    suggestion: "عضو", suggestionHint: "اسم مقترح قابل للتعديل، لا يتضمن أي جزء من بريدك. احفظه أو اختر اسمًا آخر.",
  },
} satisfies Record<Locale, Record<string, string>>;
