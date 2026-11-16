// M5-04A2: original authored challenge material; no university policy/data.
// Freeze this file (including source order, timestamps, anchors and labels)
// before implementing/evaluating the revised scorer. Not a blinded human set.
export const rankingHoldoutVersion = "m5-04a2-v1";
export type RankingHoldoutPost = { key: string; caseId: string; title: string; body: string; createdAt: string };
export type RankingHoldoutCase = { id: string; category: string; query: string; intent: string;
  gold: string[]; anchors: Record<string, string>; expectedEligible: number };
const old = "2023-02-01T12:00:00Z", recent = "2026-11-15T12:00:00Z";
const sources: RankingHoldoutPost[] = [];
function explanation(caseId: string, key: string, title: string, body: string, createdAt = old) {
  sources.push({ caseId, key, title, body, createdAt });
}
function questions(caseId: string, query: string, count: number) {
  for (let i = 0; i < count; i++) explanation(caseId, `${caseId}-question-${i + 1}`, query, `${query}?`, recent);
}

explanation("english-long", "tlb-answer", "Address lookup lab", "TLB7 miss requires a page-table lookup before the translation can be cached for later accesses. " + "The exercise tracks address translation and replacement separately. ".repeat(25));
questions("english-long", "TLB7 miss", 6);
explanation("arabic-long", "fragment-answer", "مختبر الذاكرة", "تجزئة الذاكرة تترك فراغات صغيرة بين المناطق المحجوزة وقد تمنع تخصيص كتلة متصلة رغم توفر مساحة إجمالية كافية. " + "يعرض المثال خطوات الحجز والتحرير مع المحافظة على عناوين المناطق وترتيبها. ".repeat(20));
questions("arabic-long", "تجزئة الذاكرة", 6);
explanation("identifier", "errno-answer", "Socket exercise", "EWOULDBLOCK indicates that a nonblocking socket cannot complete the requested operation immediately; wait for readiness before retrying. " + "Readiness and successful transfer remain distinct events in this exercise. ".repeat(18));
questions("identifier", "EWOULDBLOCK", 6);
explanation("cpp-token", "atomic-answer", "Concurrent counter", "C++ atomic operations coordinate shared counter updates without a data race when every concurrent access uses the same atomic object. " + "The example distinguishes visibility and arithmetic from a compound transaction. ".repeat(18));
questions("cpp-token", "C++ atomic", 6);
// Plain C must not become a candidate for the C++ query.
explanation("cpp-token", "plain-c-foil", "C atomic", "C atomic examples use a different language interface.", recent);
explanation("mixed-identifier", "timeout-answer", "تمرين الشبكة", "NET204 مهلة الانتظار تحدد مدة انتظار الرد قبل الإبلاغ عن فشل المحاولة وتتيح إعادة المحاولة وفق سياسة التطبيق. " + "يميز المختبر بين فقد الحزمة وتأخر الرد ويعرض سلسلة الرسائل وأرقامها. ".repeat(18));
questions("mixed-identifier", "NET204 مهلة", 6);

explanation("concise-vs-verbose", "crc-answer", "CRC8 checksum", "CRC8 checksum detects accidental bit corruption.");
for (let i = 0; i < 6; i++) explanation("concise-vs-verbose", `crc-social-${i + 1}`, "CRC8 checksum", "CRC8 checksum appears on the club calendar beside photography music refreshments travel registration seating invitations posters schedules volunteers and weekend announcements. No technical explanation is provided.", recent);

explanation("conflict-english", "ecc-record-a", "Synthetic record A", "ECC42 parity in synthetic record A uses eight check bits for the illustrated block. The record describes its own assumptions and cannot establish a universal hardware rule.");
explanation("conflict-english", "ecc-record-b", "Synthetic record B", "ECC42 parity in synthetic record B uses sixteen check bits for the illustrated block. The record describes different assumptions and cannot establish a universal hardware rule.", "2024-02-01T12:00:00Z");
questions("conflict-english", "ECC42 parity", 5);
explanation("conflict-arabic", "bus-record-a", "سجل تجريبي أ", "وحدة BUS17 في السجل التجريبي أ تنقل ثمانية بتات في كل خطوة بحسب افتراضات هذا المثال ولا يثبت السجل قاعدة عامة للأجهزة.");
explanation("conflict-arabic", "bus-record-b", "سجل تجريبي ب", "وحدة BUS17 في السجل التجريبي ب تنقل ستة عشر بتا في كل خطوة بحسب افتراضات مختلفة ولا يثبت السجل قاعدة عامة للأجهزة.", "2024-02-01T12:00:00Z");
questions("conflict-arabic", "وحدة BUS17", 5);

for (const [position, tag] of [[21, "MMU21 fault"], [22, "MMU22 fault"], [65, "IRQ64 mask"]] as const) {
  const caseId = `horizon-${position}`;
  explanation(caseId, `${caseId}-answer`, "Older device explanation", `${tag} handling preserves the current state before changing the device configuration so the interrupted operation can resume safely after the exceptional condition is resolved.`);
  questions(caseId, tag, position - 1);
}
explanation("distant-passage", "dma-answer", "Buffer discussion", "DMA55 buffer discussion. " + "background ".repeat(240) + "The device writes into a pinned buffer so physical addresses stay stable during the transfer.");
questions("distant-passage", "DMA55 buffer", 5);

export const rankingHoldoutPosts: readonly RankingHoldoutPost[] = sources;
export const rankingHoldoutCases: readonly RankingHoldoutCase[] = [
  { id: "english-long", category: "English/long/older/short nonanswers", query: "TLB7 miss", intent: "Explain translation lookup after a miss.", gold: ["tlb-answer"], anchors: { "tlb-answer": "requires a page-table lookup" }, expectedEligible: 7 },
  { id: "arabic-long", category: "Arabic/long/older/short nonanswers", query: "تجزئة الذاكرة", intent: "Explain fragmented free memory.", gold: ["fragment-answer"], anchors: { "fragment-answer": "تترك فراغات صغيرة" }, expectedEligible: 7 },
  { id: "identifier", category: "technical identifier", query: "EWOULDBLOCK", intent: "Explain the nonblocking error.", gold: ["errno-answer"], anchors: { "errno-answer": "wait for readiness before retrying" }, expectedEligible: 7 },
  { id: "cpp-token", category: "literal technical punctuation", query: "C++ atomic", intent: "Find the C++ concurrency explanation, excluding plain C.", gold: ["atomic-answer"], anchors: { "atomic-answer": "without a data race" }, expectedEligible: 7 },
  { id: "mixed-identifier", category: "Arabic/English identifier", query: "NET204 مهلة", intent: "Explain a response timeout.", gold: ["timeout-answer"], anchors: { "timeout-answer": "تحدد مدة انتظار الرد" }, expectedEligible: 7 },
  { id: "concise-vs-verbose", category: "concise answer/verbose social foils", query: "CRC8 checksum", intent: "Find what the checksum detects.", gold: ["crc-answer"], anchors: { "crc-answer": "detects accidental bit corruption" }, expectedEligible: 7 },
  { id: "conflict-english", category: "English/conflict", query: "ECC42 parity", intent: "Preserve both contradictory synthetic records without choosing truth.", gold: ["ecc-record-a", "ecc-record-b"], anchors: { "ecc-record-a": "uses eight check bits", "ecc-record-b": "uses sixteen check bits" }, expectedEligible: 7 },
  { id: "conflict-arabic", category: "Arabic/conflict", query: "وحدة BUS17", intent: "Retrieve both contradictory synthetic records.", gold: ["bus-record-a", "bus-record-b"], anchors: { "bus-record-a": "تنقل ثمانية بتات", "bus-record-b": "تنقل ستة عشر بتا" }, expectedEligible: 7 },
  ...([21, 22, 65] as const).map(position => ({ id: `horizon-${position}`, category: "candidate horizon", query: position === 21 ? "MMU21 fault" : position === 22 ? "MMU22 fault" : "IRQ64 mask",
    intent: `Retrieve older explanation at matching chronological position ${position}.`, gold: [`horizon-${position}-answer`], anchors: { [`horizon-${position}-answer`]: "preserves the current state" }, expectedEligible: position })),
  { id: "distant-passage", category: "passage window", query: "DMA55 buffer", intent: "Find the supporting pinned-buffer explanation.", gold: ["dma-answer"], anchors: { "dma-answer": "physical addresses stay stable" }, expectedEligible: 6 },
];
