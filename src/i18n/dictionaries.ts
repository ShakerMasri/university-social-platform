import type { Locale } from "./locales";

type Dictionary = {
  title: string;
  description: string;
  languageNavigation: string;
  skipToContent: string;
  heading: string;
  introduction: string;
  status: string;
  footer: string;
};

export const dictionaries = {
  en: {
    title: "University Social Learning Platform",
    description: "A university space for academic conversations and shared learning.",
    languageNavigation: "Language",
    skipToContent: "Skip to main content",
    heading: "Learning together, across academic years",
    introduction: "A space for university students and teachers to exchange ideas, share knowledge, and keep academic conversations within reach.",
    status: "This graduation project is in early development.",
    footer: "A Computer Engineering graduation project.",
  },
  ar: {
    title: "منصة التعلم الاجتماعي الجامعية",
    description: "مساحة جامعية للنقاشات الأكاديمية والتعلم المشترك.",
    languageNavigation: "اللغة",
    skipToContent: "انتقل إلى المحتوى الرئيسي",
    heading: "نتعلم معًا عبر السنوات الدراسية",
    introduction: "مساحة لطلاب الجامعة ومعلميها لتبادل الأفكار ومشاركة المعرفة وإبقاء النقاشات الأكاديمية في متناول الجميع.",
    status: "هذا المشروع للتخرج في مراحله الأولى من التطوير.",
    footer: "مشروع تخرج في هندسة الحاسوب.",
  },
} satisfies Record<Locale, Dictionary>;
