import type { Locale } from "./locales";

export const peopleText = {
  en: {
    title: "People", intro: "Find confirmed profiles across the university community.",
    query: "Search display names", hint: "Enter 2–60 characters. English and Arabic names are searched together. Names may be shared by several people.",
    submit: "Search people", initial: "Search for a display name to begin.", results: "People results",
    empty: "No matching profiles.", next: "Next profiles", retry: "Retry search", loading: "Searching…",
    failed: "Could not load profiles. Try again.", invalid: "Check the query or start a new search.",
    unavailable: "This profile is unavailable or you do not have access.", rate: "Too many profile requests. Try again later.",
    back: "Back to People", profile: "Profile", notice: "This display name is chosen by the account holder. It does not establish identity or teacher status.",
    visible: "Let verified signed-in users find and open my profile",
    visibilityHint: "Saving with this option selected confirms your display name for People search. Turning it off hides your directory profile. Names on permitted posts and comments remain visible there; your email stays private.",
    suggestion: "Member", suggestionHint: "An editable suggested name. It contains no part of your email. Save it or choose another name.",
  },
  ar: {
    title: "الأشخاص", intro: "ابحث عن الملفات المؤكدة عبر مجتمع الجامعة.",
    query: "البحث بأسماء العرض", hint: "أدخل من حرفين إلى 60 حرفًا. يشمل البحث الأسماء العربية والإنجليزية معًا. قد يشترك عدة أشخاص في الاسم نفسه.",
    submit: "البحث عن أشخاص", initial: "ابدأ بالبحث عن اسم عرض.", results: "نتائج الأشخاص",
    empty: "لا توجد ملفات مطابقة.", next: "الملفات التالية", retry: "إعادة البحث", loading: "جارٍ البحث…",
    failed: "تعذر تحميل الملفات. حاول مجددًا.", invalid: "تحقق من نص البحث أو ابدأ بحثًا جديدًا.",
    unavailable: "هذا الملف غير متاح أو ليس لديك صلاحية الوصول.", rate: "طلبات ملفات كثيرة. حاول لاحقًا.",
    back: "العودة إلى الأشخاص", profile: "الملف الشخصي", notice: "يختار صاحب الحساب اسم العرض. لا يثبت الاسم الهوية أو صفة المدرّس.",
    visible: "السماح للمستخدمين المؤكدين المسجلين بالعثور على ملفي وفتحه",
    visibilityHint: "يؤكد الحفظ مع تحديد هذا الخيار اسم عرضك للبحث عن الأشخاص. إلغاء الخيار يخفي ملفك من الدليل. تبقى الأسماء على المنشورات والتعليقات المسموح بقراءتها ظاهرة فيها؛ ويظل بريدك خاصًا.",
    suggestion: "عضو", suggestionHint: "اسم مقترح قابل للتعديل، لا يتضمن أي جزء من بريدك. احفظه أو اختر اسمًا آخر.",
  },
} satisfies Record<Locale, Record<string, string>>;
