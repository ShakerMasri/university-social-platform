// Original synthetic study material; not university policy or real-user data.
// Gold labels judge usefulness for the stated intent, independently of literal
// matching. Permission-specific gold contains only currently permitted sources.
export const corpusVersion = "m5-02-v1";
export const privateMarker = "SYNTHETIC_PRIVATE_EVAL_MARKER";
export type CorpusPost = { key: string; title: string; body: string; private?: boolean; createdAt?: string };
export const corpusPosts: CorpusPost[] = [
  { key: "cache-en", title: "Cache locality", body: "The cache locality principle improves memory access by reusing nearby addresses." },
  { key: "normalization-ar", title: "تَـطْبِيع قَوَاعِد البَيَانَات", body: "يقلل تطبيع قواعد البيانات تكرار المعلومات بتنظيم الجداول والعلاقات." },
  { key: "pointers-mixed", title: "CE101 pointer notes", body: "في CE101 المُـؤَشِّرَات تخزن عنوان موقع في الذاكرة." },
  { key: "deadlock-thread", title: "Operating systems study thread", body: "Compare resource allocation strategies." },
  { key: "scheduler-thread", title: "درس نظم التشغيل", body: "أمثلة من المختبر." },
  { key: "conflict-a", title: "Lab safety deadline record A", body: "For the synthetic lab safety deadline, record A states 10 November 2026." },
  { key: "conflict-b", title: "Lab safety deadline record B", body: "For the synthetic lab safety deadline, record B states 12 November 2026." },
  { key: "cpp", title: "C++ pointer ownership", body: "C++ code must keep referenced objects alive until the last use." },
  { key: "c-near-miss", title: "C pointer overview", body: "C code examples for pointer arithmetic." },
  { key: "schedule", title: "Operating system schedule", body: "A scheduler chooses the next runnable process." },
  { key: "pipeline-old", title: "Pipeline hazards explained", body: "Pipeline hazards pause instruction execution when operands or resources are unavailable.", createdAt: "2024-03-01T12:00:00Z" },
  ...Array.from({ length: 5 }, (_, index) => ({ key: `pipeline-social-${index + 1}`, title: `Pipeline hazards social notice ${index + 1}`,
    body: "Social meetup agenda mentions pipeline hazards without explaining processor behavior.", createdAt: `2026-11-${10 + index}T12:00:00Z` })),
  { key: "race-thread", title: "Race condition resources", body: "Race condition: please contribute an explanation." },
  { key: "split-passage", title: "Address translation notes", body: `virtual ${"background ".repeat(230)}memory maps addresses through page tables.` },
  { key: "routing-public", title: "Routing sentinel guide", body: "The routing sentinel public example uses a default gateway." },
  { key: "routing-private", title: "Routing sentinel member guide", body: `The routing sentinel ${privateMarker} uses a protected synthetic subnet.`, private: true },
];
export const corpusComments = [
  { key: "deadlock-answer", post: "deadlock-thread", body: "Deadlock avoidance checks whether allocation leaves the system in a safe state." },
  { key: "scheduler-root", post: "scheduler-thread", body: "أسئلة حول تجارب المختبر." },
  { key: "scheduler-reply", post: "scheduler-thread", root: "scheduler-root", body: "جدولة RoundRobin تمنح كل عملية شريحة زمنية ثابتة." },
  { key: "race-answer", post: "race-thread", body: "A race condition occurs when unsynchronized accesses to shared memory make results depend on timing." },
] satisfies { key: string; post: string; body: string; root?: string }[];

// Exact anchor presence is a reproducible passage-selection proxy, not a semantic
// entailment score. Anchors were chosen before running retrieval.
export const supportingAnchors: Record<string, string> = {
  "cache-en": "reusing nearby addresses", "normalization-ar": "يقلل تطبيع قواعد البيانات تكرار المعلومات",
  "pointers-mixed": "تخزن عنوان موقع في الذاكرة", "deadlock-answer": "leaves the system in a safe state",
  "scheduler-reply": "تمنح كل عملية شريحة زمنية ثابتة", "conflict-a": "record A states 10 November 2026",
  "conflict-b": "record B states 12 November 2026", cpp: "keep referenced objects alive", schedule: "chooses the next runnable process",
  "pipeline-old": "pause instruction execution", "race-answer": "results depend on timing",
  "split-passage": "memory maps addresses through page tables", "routing-public": "uses a default gateway",
  "routing-private": "uses a protected synthetic subnet",
};
export type EvaluationQuery = {
  id: string; category: string; intent: string; query: string; gold: string[];
  actor?: "pending" | "member" | "revoked"; privateFilter?: boolean; expectedStatus?: 400 | 404;
};
export const evaluationQueries: EvaluationQuery[] = [
  { id: "en-keyword", category: "English", intent: "Find an explanation of cache locality.", query: "cache locality", gold: ["cache-en"] },
  { id: "en-question", category: "natural question", intent: "Find an explanation of cache locality.", query: "How does cache locality improve memory access?", gold: ["cache-en"] },
  { id: "ar-keyword", category: "Arabic", intent: "Find an explanation of database normalization.", query: "تطبيع قواعد البيانات", gold: ["normalization-ar"] },
  { id: "ar-question", category: "natural question", intent: "Find an explanation of database normalization.", query: "كيف يساعد تطبيع قواعد البيانات في تقليل التكرار؟", gold: ["normalization-ar"] },
  { id: "mixed", category: "mixed language", intent: "Find CE101 pointer notes.", query: "ce101 مؤشرات", gold: ["pointers-mixed"] },
  { id: "comment", category: "comment", intent: "Find a deadlock-avoidance explanation.", query: "deadlock avoidance", gold: ["deadlock-answer"] },
  { id: "reply", category: "reply", intent: "Find the RoundRobin explanation.", query: "جدولة roundrobin", gold: ["scheduler-reply"] },
  { id: "conflict", category: "conflicting evidence", intent: "Retrieve both contradictory synthetic deadline records without choosing a winner.", query: "lab safety deadline", gold: ["conflict-a", "conflict-b"] },
  { id: "insufficient", category: "insufficient evidence", intent: "No source addresses this subject.", query: "quantum parking permit", gold: [] },
  { id: "cpp-literal", category: "punctuation", intent: "Find C++ material without treating plain C as equivalent.", query: "C++", gold: ["cpp"] },
  { id: "morphology", category: "morphology", intent: "Find material about process scheduling.", query: "scheduling", gold: ["schedule"] },
  { id: "synonym", category: "synonym", intent: "Find the explanation of pipeline stalls.", query: "CPU stalls", gold: ["pipeline-old"] },
  { id: "cross-language", category: "cross-language", intent: "Find the Arabic normalization explanation using an English query.", query: "database normalization", gold: ["normalization-ar"] },
  { id: "crowded-old-answer", category: "ranking", intent: "Find a technical explanation, not social notices that repeat the terms.", query: "pipeline hazards", gold: ["pipeline-old"] },
  { id: "parent-precedence", category: "source selection", intent: "Find the substantive comment rather than its unanswered parent request.", query: "race condition", gold: ["race-answer"] },
  { id: "split-passage", category: "passage selection", intent: "Return the supporting address-mapping explanation.", query: "virtual memory", gold: ["split-passage"] },
  { id: "long-question", category: "natural question", intent: "Find the race-condition explanation.", query: "How can I prevent race conditions in shared memory programs?", gold: ["race-answer"], expectedStatus: 400 },
  { id: "public-outsider", category: "permission", intent: "Retrieve only public routing material.", query: "routing sentinel", gold: ["routing-public"] },
  { id: "private-pending", category: "permission", intent: "A pending request grants no private content access.", query: "routing sentinel", gold: ["routing-public"], actor: "pending" },
  { id: "private-member", category: "permission", intent: "An approved member can retrieve both public and private synthetic sources.", query: "routing sentinel", gold: ["routing-public", "routing-private"], actor: "member" },
  { id: "private-revoked", category: "permission", intent: "Removal prevents both private retrieval and validation of the old evidence.", query: "routing sentinel", gold: ["routing-public"], actor: "revoked" },
  { id: "private-filter-denied", category: "permission", intent: "A private filter must deny a nonmember without content metadata.", query: "routing sentinel", gold: [], privateFilter: true, expectedStatus: 404 },
];
