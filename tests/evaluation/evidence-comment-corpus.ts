// Original synthetic M5-04B cases, frozen before implementing the selection
// experiment. Labels judge useful source identity, not mere keyword matching.
export const commentCorpusVersion = "m5-04b-v1";
export type CommentCase = { id: string; query: string; type: "QUESTION" | "DISCUSSION"; title: string; body: string;
  comments: { key: string; body: string; replyTo?: string }[]; gold: string[]; anchors: Record<string, string>;
  baseline: string[]; actor?: "member" | "outsider"; private?: boolean };
export const commentCases: readonly CommentCase[] = [
  { id: "en-answer", query: "LOCK71 inversion", type: "QUESTION", title: "LOCK71 inversion", body: "How can LOCK71 inversion be avoided?",
    comments: [{ key: "en-answer-comment", body: "LOCK71 inversion is avoided by acquiring multiple locks in one consistent global order." }],
    gold: ["en-answer-comment"], anchors: { "en-answer-comment": "one consistent global order" }, baseline: ["en-answer-post"] },
  { id: "ar-reply", query: "تعارض CAP72", type: "QUESTION", title: "تعارض CAP72", body: "كيف نفسر تعارض CAP72 في هذا المثال؟",
    comments: [{ key: "ar-root", body: "تفاصيل التمرين التجريبي." }, { key: "ar-answer-reply", replyTo: "ar-root", body: "تعارض CAP72 يحدث عندما تتنافس عمليتان على المورد نفسه دون تنسيق الوصول بينهما." }],
    gold: ["ar-answer-reply"], anchors: { "ar-answer-reply": "دون تنسيق الوصول" }, baseline: ["ar-reply-post"] },
  { id: "discussion-preserved", query: "DNS73 alias", type: "DISCUSSION", title: "DNS73 alias", body: "DNS73 alias points a name to another canonical name in this synthetic lookup exercise.",
    comments: [{ key: "discussion-social", body: "DNS73 alias is also the name printed on our picnic invitation." }], gold: ["discussion-preserved-post"],
    anchors: { "discussion-preserved-post": "another canonical name" }, baseline: ["discussion-preserved-post"] },
  { id: "answered-question", query: "SUM74 overflow", type: "QUESTION", title: "SUM74 overflow solution", body: "SUM74 overflow is prevented here by checking bounds before adding the two signed operands.",
    comments: [{ key: "answered-social", body: "SUM74 overflow appears on the social calendar beside refreshments and weekend photographs." }], gold: ["answered-question-post"],
    anchors: { "answered-question-post": "checking bounds before adding" }, baseline: ["answered-question-post"] },
  { id: "unanswered", query: "FIFO75 fairness", type: "QUESTION", title: "FIFO75 fairness", body: "Can someone explain FIFO75 fairness?",
    comments: [{ key: "unrelated-comment", body: "The cafe opens early on Saturday." }], gold: [], anchors: {}, baseline: ["unanswered-post"] },
  { id: "discussion-request", query: "MMIO76 barrier", type: "DISCUSSION", title: "MMIO76 barrier help", body: "Please explain MMIO76 barrier behavior.",
    comments: [{ key: "discussion-answer", body: "MMIO76 barrier orders device memory operations before the following dependent access in this exercise." }],
    gold: ["discussion-answer"], anchors: { "discussion-answer": "orders device memory operations" }, baseline: ["discussion-request-post"] },
  { id: "private-member", query: "ذاكرة VM77", type: "QUESTION", title: "ذاكرة VM77", body: "كيف تعمل ذاكرة VM77؟", private: true, actor: "member",
    comments: [{ key: "private-root", body: "سياق تجريبي خاص." }, { key: "private-reply", replyTo: "private-root", body: "ذاكرة VM77 تستخدم جدول الصفحات لتحويل العنوان الافتراضي إلى عنوان فعلي في المثال الخاص." }],
    gold: ["private-reply"], anchors: { "private-reply": "جدول الصفحات لتحويل" }, baseline: ["private-member-post"] },
  { id: "private-outsider", query: "PRIVATE78 subnet", type: "QUESTION", title: "PRIVATE78 subnet", body: "What explains PRIVATE78 subnet addressing?", private: true, actor: "outsider",
    comments: [{ key: "private-hidden-answer", body: "PRIVATE78 subnet uses a prefix to distinguish the network portion from the host portion." }], gold: [], anchors: {}, baseline: [] },
  { id: "title-only", query: "C++ OWN79", type: "QUESTION", title: "C++ OWN79", body: "Could someone explain this ownership exercise?",
    comments: [{ key: "ownership-answer", body: "C++ OWN79 keeps the referenced object alive until every outstanding reference is finished." }], gold: ["ownership-answer"],
    anchors: { "ownership-answer": "until every outstanding reference is finished" }, baseline: ["title-only-post"] },
  { id: "earliest-nonanswer", query: "DMA80 pinning", type: "QUESTION", title: "DMA80 pinning", body: "How does DMA80 pinning work?",
    comments: [{ key: "early-social", body: "DMA80 pinning is written on the club poster beside music and refreshments." },
      { key: "later-answer", body: "DMA80 pinning keeps the physical pages resident and stable until the device transfer completes." }], gold: ["later-answer"],
    anchors: { "later-answer": "physical pages resident and stable" }, baseline: ["earliest-nonanswer-post"] },
];
