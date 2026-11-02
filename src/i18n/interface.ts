import type { Locale } from "./locales";

export const interfaceText = {
  en: {
    navigation: "Main navigation",
    discover: "Find a space to learn together",
    communitiesIntro: "Explore academic communities, join a conversation or start a space for shared learning.",
    directory: "Explore communities",
    createIntro: "Bring a study group or an academic conversation together.",
    emptyCommunities: "Start the first community to bring people and ideas together.",
  },
  ar: {
    navigation: "التنقل الرئيسي",
    discover: "مساحة نتعلم فيها معًا",
    communitiesIntro: "اكتشف المجتمعات الأكاديمية، وشارك في النقاش أو أنشئ مساحة للتعلم المشترك.",
    directory: "اكتشف المجتمعات",
    createIntro: "اجمع زملاء الدراسة والأفكار في مساحة مشتركة.",
    emptyCommunities: "أنشئ أول مجتمع ليجمع الأشخاص والأفكار.",
  },
} satisfies Record<Locale, Record<string, string>>;
