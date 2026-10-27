import type { Locale } from "./locales";
import type { PostType } from "../server/posts/policy";
type PostText = { title: string; create: string; type: string; postTitle: string; body: string; link: string;
  publish: string; busy: string; failed: string; invalid: string; conflict: string; rate: string; empty: string;
  next: string; more: string; open: string; back: string; deleted: string; attribution: string; unavailable: string;
  joinHint: string; linkHint: string; limits: string; types: Record<PostType, string> };
export const postText: Record<Locale, PostText> = {
  en: {
    title: "Posts", create: "Create a post", type: "Post type", postTitle: "Post title", body: "Post text",
    link: "Resource link (optional)", publish: "Publish post", busy: "Publishing…", failed: "Could not publish. Try again. Your access may have changed.",
    invalid: "Check the post type, text lengths and resource link.", conflict: "This submission changed. Submit again to publish the updated text.",
    rate: "Too many posting attempts. Try again later.", empty: "No posts yet.", next: "Older posts", more: "Load more posts", open: "Open post", back: "Back to community",
    deleted: "Deleted user", attribution: "Posted by", unavailable: "This post is unavailable or you do not have access.",
    joinHint: "Join this community and save your display name to publish. Announcements are reserved for its creator.",
    linkHint: "Optional HTTP or HTTPS link. Links open in a new tab; the platform does not fetch or preview their content.",
    limits: "Title: 1–160 characters. Text: 1–10,000 characters. Resource link: up to 2,048 characters.",
    types: { QUESTION: "Question", DISCUSSION: "Discussion", RESOURCE: "Resource", ANNOUNCEMENT: "Announcement" },
  },
  ar: {
    title: "المنشورات", create: "إنشاء منشور", type: "نوع المنشور", postTitle: "عنوان المنشور", body: "نص المنشور",
    link: "رابط المورد (اختياري)", publish: "نشر المنشور", busy: "جارٍ النشر…", failed: "تعذر النشر. حاول مجددًا، فقد تكون صلاحياتك قد تغيرت.",
    invalid: "تحقق من نوع المنشور وأطوال النصوص ورابط المورد.", conflict: "تغيّر محتوى هذه المحاولة. أرسل مجددًا لنشر النص المعدّل.",
    rate: "محاولات نشر كثيرة. حاول لاحقًا.", empty: "لا توجد منشورات بعد.", next: "منشورات أقدم", more: "تحميل المزيد من المنشورات", open: "فتح المنشور", back: "العودة إلى المجتمع",
    deleted: "مستخدم محذوف", attribution: "نشره", unavailable: "هذا المنشور غير متاح أو ليس لديك صلاحية الوصول.",
    joinHint: "انضم إلى المجتمع واحفظ اسم العرض لتتمكن من النشر. الإعلانات مخصصة لمنشئ المجتمع.",
    linkHint: "رابط اختياري ببروتوكول HTTP أو HTTPS، يفتح في علامة تبويب جديدة. لا تجلب المنصة محتواه ولا تعرض معاينة له.",
    limits: "العنوان: من حرف واحد إلى 160 حرفًا. النص: من حرف واحد إلى 10000 حرف. الرابط: حتى 2048 حرفًا.",
    types: { QUESTION: "سؤال", DISCUSSION: "نقاش", RESOURCE: "مورد", ANNOUNCEMENT: "إعلان" },
  },
};
