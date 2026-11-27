import type { Locale } from "./locales";

// Strings for /search. Result and failure messages that the archive and
// People searches already define are reused from their dictionaries.
export const searchText = {
  en: {
    title: "Search",
    tabsLabel: "Search categories",
    all: "All",
    posts: "Posts",
    people: "People",
    query: "Search terms",
    submit: "Search",
    filters: "Filter posts",
    prompt: "Search posts, comments and people. Posts from earlier academic years are included.",
    postsPrompt: "Enter study keywords, and narrow by community or post type if you like.",
    peoplePrompt: "Enter part of a display name, in English or Arabic.",
    results: "Results",
    seeAllPosts: "See all matching posts",
    seeAllPeople: "See all matching people",
    postsInvalid: "Post search needs 2–200 characters and at most eight words.",
    peopleInvalid: "People search needs 2–60 characters.",
    firstResults: "Back to the first results",
  },
  ar: {
    title: "بحث",
    tabsLabel: "فئات البحث",
    all: "الكل",
    posts: "المنشورات",
    people: "الأشخاص",
    query: "كلمات البحث",
    submit: "بحث",
    filters: "تصفية المنشورات",
    prompt: "ابحث في المنشورات والتعليقات والأشخاص. تشمل النتائج منشورات السنوات الدراسية السابقة.",
    postsPrompt: "أدخل كلمات دراسية، ويمكنك التصفية حسب المجتمع أو نوع المنشور.",
    peoplePrompt: "أدخل جزءًا من اسم العرض، بالعربية أو الإنجليزية.",
    results: "النتائج",
    seeAllPosts: "عرض كل المنشورات المطابقة",
    seeAllPeople: "عرض كل الأشخاص المطابقين",
    postsInvalid: "يحتاج البحث في المنشورات إلى 2–200 حرف وثماني كلمات على الأكثر.",
    peopleInvalid: "يحتاج البحث عن الأشخاص إلى 2–60 حرفًا.",
    firstResults: "العودة إلى النتائج الأولى",
  },
} as const satisfies Record<Locale, Record<string, string>>;
