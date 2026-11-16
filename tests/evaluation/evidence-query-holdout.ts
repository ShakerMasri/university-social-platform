// New original synthetic material, independent of the M5-02 corpus. Questions,
// relevance labels, contrary foils and anchors are fixed before database testing.
// This is a deliberate challenge set authored with knowledge of the algorithm,
// not blinded human sampling or authoritative protocol/university guidance.
export const holdoutVersion = "m5-03b-v1";
export const holdoutPosts = [
  { key: "dns", title: "Name lookup exercise", body: "DNS records map domain names to IP addresses." },
  { key: "tcp", title: "Transport exercise", body: "TCP acknowledgments work by confirming received sequence numbers." },
  { key: "dhcp", title: "تهيئة الشبكة", body: "وظيفة DHCP تخصيص عناوين IP تلقائيا للأجهزة." },
  { key: "encryption", title: "التشفير في التمرين", body: "التشفير يحول البيانات إلى صيغة مقروءة فقط بالمفتاح المناسب." },
  { key: "latency", title: "زمن الاستجابة", body: "زمن الاستجابة هو المدة بين إرسال الطلب واستقبال الرد." },
  { key: "tls-negative", title: "Why is TLS not obsolete?", body: "TLS is not obsolete under the exercise assumptions; use the current exercise protocol." },
  { key: "tls-contrary", title: "TLS alternative claim", body: "TLS is obsolete; notification text accompanies this deliberately contrary exercise claim.", newer: true },
  { key: "select-negative", title: "لماذا لا يحذف SELECT البيانات؟", body: "SELECT لا يحذف البيانات؛ هذا المثال يقرأ الصفوف فقط." },
  { key: "select-contrary", title: "افتراض معاكس SELECT", body: "SELECT يحذف البيانات في افتراض خلاف المثال.", newer: true },
  { key: "mixed-id", title: "Toolchain identifier exercise", body: "CE202_v3 combines Node.js tooling with a C++ interoperability exercise." },
  { key: "not-supported", title: "حالة NOT_SUPPORTED", body: "NOT_SUPPORTED معرّف يدل على عملية غير مدعومة." },
  { key: "no-definition", title: "ما معنى لا؟", body: "لا أداة نفي في هذا المثال اللغوي." },
  { key: "literal-can", title: "What is CAN??", body: "CAN?? names the literal exercise identifier, not the network acronym." },
] satisfies { key: string; title: string; body: string; newer?: boolean }[];
export const holdoutQueries = [
  { id: "en-dns", query: "What are DNS records?", gold: ["dns"], category: "English" },
  { id: "en-tcp", query: "How do TCP acknowledgments work?", gold: ["tcp"], category: "English" },
  { id: "ar-dhcp", query: "ما هي وظيفة DHCP؟", gold: ["dhcp"], category: "Arabic" },
  { id: "ar-encryption", query: "ما معنى التشفير؟", gold: ["encryption"], category: "Arabic" },
  { id: "ar-latency", query: "ما معنى زمن الاستجابة؟", gold: ["latency"], category: "Arabic" },
  { id: "en-negation", query: "Why is TLS not obsolete?", gold: ["tls-negative"], category: "negation" },
  { id: "ar-negation", query: "لماذا لا يحذف SELECT البيانات؟", gold: ["select-negative"], category: "negation" },
  { id: "technical-id", query: "What is CE202_v3 Node.js C++?", gold: ["mixed-id"], category: "identifiers" },
  { id: "ar-technical-id", query: "ما معنى NOT_SUPPORTED؟", gold: ["not-supported"], category: "identifiers" },
  { id: "ar-negation-definition", query: "ما معنى لا؟", gold: ["no-definition"], category: "ambiguous wording" },
  { id: "literal-question-marks", query: "What is CAN??", gold: ["literal-can"], category: "ambiguous wording" },
  // With no context, a source about زمن (time) does not explain من (who/from).
  { id: "ar-ambiguous-empty", query: "ما معنى من؟", gold: [], category: "ambiguous wording" },
];
export const holdoutAnchors: Record<string, string> = {
  dns: "map domain names to IP addresses", tcp: "confirming received sequence numbers", dhcp: "تخصيص عناوين IP تلقائيا",
  encryption: "بالمفتاح المناسب", latency: "بين إرسال الطلب واستقبال الرد", "tls-negative": "TLS is not obsolete",
  "select-negative": "يقرأ الصفوف فقط", "mixed-id": "C++ interoperability exercise", "not-supported": "عملية غير مدعومة",
  "no-definition": "أداة نفي", "literal-can": "literal exercise identifier",
};
