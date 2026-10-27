import type { Locale } from "./locales";
type CommunityText = {
  title: string; name: string; description: string; visibility: string; public: string; private: string;
  create: string; created: string; hint: string; empty: string; open: string; join: string; request: string;
  pending: string; joined: string; leave: string; cancel: string; owner: string; members: string; approve: string;
  remove: string; reject: string; userId: string; failed: string; unavailable: string; profileRequired: string; profile: string;
  busy: string; changed: string; next: string; back: string; space: string; noMembers: string; loading: string; rate: string; limits: string;
};
export const communityText: Record<Locale, CommunityText> = {
  en: {
    title: "Communities", name: "Community name", description: "Description", visibility: "Visibility",
    public: "Public", private: "Private", create: "Create community", created: "Community created.",
    hint: "All verified platform users can discover the name and description, including for private communities. Public spaces are readable by verified users. Private spaces require approved membership.",
    empty: "No communities yet.", open: "Open community", join: "Join community", request: "Request to join",
    pending: "Request pending", joined: "Member", leave: "Leave community", cancel: "Cancel request", owner: "Owner",
    members: "Membership management", approve: "Approve", remove: "Remove member", reject: "Reject request",
    userId: "User ID",
    failed: "Could not complete this action. Try again. Your access may have changed.",
    unavailable: "This community is unavailable or you do not have access.",
    profileRequired: "Save your display name before creating a community.", profile: "My profile", busy: "Working…",
    changed: "Membership updated.", next: "Next page", back: "All communities",
    space: "Community space.", noMembers: "No members or requests on this page.", loading: "Loading communities…",
    rate: "Too many actions. Try again later.", limits: "Name: 1–80 characters. Description: up to 1,000 characters.",
  },
  ar: {
    title: "المجتمعات", name: "اسم المجتمع", description: "الوصف", visibility: "الظهور",
    public: "عام", private: "خاص", create: "إنشاء مجتمع", created: "تم إنشاء المجتمع.",
    hint: "يمكن لجميع مستخدمي المنصة المتحقق منهم اكتشاف الاسم والوصف، بما في ذلك المجتمعات الخاصة. المساحات العامة متاحة للقراءة للمستخدمين المتحقق منهم، والمساحات الخاصة تتطلب عضوية معتمدة.",
    empty: "لا توجد مجتمعات بعد.", open: "فتح المجتمع", join: "الانضمام للمجتمع", request: "طلب الانضمام",
    pending: "الطلب قيد الانتظار", joined: "عضو", leave: "مغادرة المجتمع", cancel: "إلغاء الطلب", owner: "المالك",
    members: "إدارة العضوية", approve: "قبول", remove: "إزالة العضو", reject: "رفض الطلب",
    userId: "معرّف المستخدم",
    failed: "تعذر إكمال العملية. حاول مجددًا، فقد تكون صلاحياتك قد تغيرت.",
    unavailable: "هذا المجتمع غير متاح أو ليس لديك صلاحية الوصول.",
    profileRequired: "احفظ اسم العرض قبل إنشاء مجتمع.", profile: "ملفي الشخصي", busy: "جارٍ التنفيذ…",
    changed: "تم تحديث العضوية.", next: "الصفحة التالية", back: "جميع المجتمعات",
    space: "مساحة المجتمع.", noMembers: "لا توجد عضويات أو طلبات في هذه الصفحة.", loading: "جارٍ تحميل المجتمعات…",
    rate: "عمليات كثيرة. حاول مجددًا لاحقًا.", limits: "الاسم: من حرف واحد إلى 80 حرفًا. الوصف: حتى 1000 حرف.",
  },
};
