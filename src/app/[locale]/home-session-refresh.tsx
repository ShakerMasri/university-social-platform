"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function HomeSessionRefresh() {
  const router = useRouter();
  useEffect(() => {
    // Back/forward can restore a client route snapshot even for a dynamic page.
    // Also recheck when returning from another tab where logout may have occurred.
    const refresh = () => { if (document.visibilityState === "visible") router.refresh(); };
    const restored = (event: PageTransitionEvent) => { if (event.persisted) refresh(); };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", restored);
    window.addEventListener("popstate", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", restored);
      window.removeEventListener("popstate", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);
  return null;
}
