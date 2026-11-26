import localFont from "next/font/local";

// IBM Plex Sans and IBM Plex Sans Arabic, SIL OFL 1.1, self-hosted from IBM's
// official npm releases (see THIRD-PARTY-NOTICES.md). Three families chained in
// --font-sans, each limited by unicode-range so a browser downloads a file only
// when the page contains characters from that range:
// - latin: IBM's Latin-1 subset (~21 KB per weight);
// - extended: the complete Plex Sans file, for Latin Extended, Greek, Cyrillic
//   and symbols outside Latin-1;
// - arabic: Plex Sans Arabic, only for Arabic script.
// Generated size-adjusted fallbacks are off for latin and extended: a fallback
// face with no unicode-range would claim Arabic text before the arabic family.

// next/font reads its options at build time, so they must be literals.
// Latin-1 and extended ranges come from IBM's split CSS in @ibm/plex-sans
// 2.0.0. The Arabic range covers Arabic, Arabic Supplement, Arabic Extended-A,
// presentation forms, and the joiners and direction marks used inside Arabic.

export const plexLatin = localFont({
  src: [
    { path: "./fonts/IBMPlexSans-Regular-Latin1.woff2", weight: "400", style: "normal" },
    { path: "./fonts/IBMPlexSans-Medium-Latin1.woff2", weight: "500", style: "normal" },
    { path: "./fonts/IBMPlexSans-SemiBold-Latin1.woff2", weight: "600", style: "normal" },
    { path: "./fonts/IBMPlexSans-Bold-Latin1.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-plex-latin",
  display: "swap",
  // Not preloaded: next/font would preload all four weights on every page,
  // and the old harness pages do not use the font. Revisit in Stage 1 once
  // every page uses it (measure before preloading any weight).
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+0000, U+000D, U+0020-007E, U+00A0-00FF, U+0131, U+0152-0153, U+02C6, U+02DA, U+02DC, U+2013-2014, U+2018-201A, U+201C-201E, U+2020-2022, U+2026, U+2030, U+2039-203A, U+2044, U+2074, U+20AC, U+2122, U+2212, U+FB01-FB02" }],
});

export const plexExtended = localFont({
  src: [
    { path: "./fonts/IBMPlexSans-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/IBMPlexSans-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/IBMPlexSans-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "./fonts/IBMPlexSans-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-plex-extended",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+0100-024F, U+0259, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03CE, U+0400-045F, U+0472-0473, U+0490-04F9, U+0E3F, U+1E00-1EFF, U+2032-2033, U+2070-2089, U+20A0-20CF, U+2113, U+2116, U+2126, U+212E, U+2150-215E, U+2190-21BB, U+21C4, U+21C6, U+2202, U+2206, U+220F, U+2211, U+221A, U+221E, U+222B, U+2248, U+2260, U+2264-2265, U+25CA, U+2713, U+274C, U+2B0E-2B11, U+2C60-2C7F, U+A720-A7FF" }],
});

export const plexArabic = localFont({
  src: [
    { path: "./fonts/IBMPlexSansArabic-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/IBMPlexSansArabic-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/IBMPlexSansArabic-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "./fonts/IBMPlexSansArabic-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-plex-arabic",
  display: "swap",
  preload: false,
  declarations: [{ prop: "unicode-range", value: "U+0600-06FF, U+0750-077F, U+0870-08FF, U+200C-200F, U+FB50-FDFF, U+FE70-FEFF" }],
});

export const fontVariableClasses = `${plexLatin.variable} ${plexExtended.variable} ${plexArabic.variable}`;
