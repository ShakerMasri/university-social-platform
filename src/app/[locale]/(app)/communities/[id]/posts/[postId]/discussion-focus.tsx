"use client";
import { useEffect } from "react";

// Only explicit discussion destinations move focus. Ordinary page loads and
// the site's skip link retain their existing browser behavior.
export function DiscussionFocus({ linkedTarget }: { linkedTarget?: string }) {
  useEffect(() => {
    const comments = () => {
      if (window.location.hash === "#comments-heading") document.getElementById("comments-heading")?.focus();
    };
    const frame = requestAnimationFrame(() => {
      if (window.location.hash === "#comments-heading") comments();
      else if (linkedTarget && !window.location.hash) document.getElementById(linkedTarget)?.focus();
    });
    window.addEventListener("hashchange", comments);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("hashchange", comments); };
  }, [linkedTarget]);
  return null;
}
