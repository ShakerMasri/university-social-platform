"use client";

// Document memory survives locale-page remounts. Never serialize this credential
// into React props/markup, a URL, history state, cookies or browser storage.
// Server expiry/binding remain authoritative; local retention is at most 10 min
// after capture and is not extended by reading it on a language switch.
let pending: { token: string; expiresAt: number } | undefined;
let expiryTimer: ReturnType<typeof setTimeout> | undefined;

export function clearPendingConfirmation() {
  pending = undefined;
  clearTimeout(expiryTimer);
  expiryTimer = undefined;
}

export function capturePendingConfirmation(token: string) {
  clearPendingConfirmation();
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return;
  pending = { token, expiresAt: Date.now() + 10 * 60 * 1000 };
  expiryTimer = setTimeout(clearPendingConfirmation, 10 * 60 * 1000);
}

export function pendingConfirmationToken() {
  if (pending && pending.expiresAt <= Date.now()) clearPendingConfirmation();
  return pending?.token ?? "";
}
