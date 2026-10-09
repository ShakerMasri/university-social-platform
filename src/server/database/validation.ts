import { lowercaseEmail } from "./email-case.ts";

// Count Unicode code points, matching PostgreSQL char_length/varchar semantics.
export const EMAIL_MAX_LENGTH = 254;
export const DISPLAY_NAME_MAX_LENGTH = 60;

function text(value: unknown): string {
  if (typeof value !== "string" || !value.isWellFormed() || value.includes("\0")) {
    throw new Error("Invalid text");
  }
  return value.trim();
}

export function normalizeEmail(value: unknown) {
  const email = text(value);
  const emailKey = lowercaseEmail(email);
  // Minimal persistence input shape, not an exhaustive email/deliverability validator.
  if (
    !/^[^\s@\p{Cc}]+@[^\s@\p{Cc}]+$/u.test(email) ||
    [...email].length > EMAIL_MAX_LENGTH ||
    [...emailKey].length > EMAIL_MAX_LENGTH
  ) {
    throw new Error("Invalid email");
  }
  return { email, emailKey };
}

export function validateDisplayName(value: unknown): string {
  const displayName = text(value);
  if (!displayName || [...displayName].length > DISPLAY_NAME_MAX_LENGTH) {
    throw new Error("Invalid display name");
  }
  return displayName;
}

export function validateUserId(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error("Invalid user identifier");
  }
}
