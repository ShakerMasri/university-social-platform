// Theme preference shared by the server layout and the client toggle (plan
// decision 7). The cookie holds only an explicit choice; when it is absent or
// invalid the system preference applies through CSS.
export const themeCookieName = "theme";
export const themes = ["light", "dark"] as const;
export type Theme = (typeof themes)[number];
// One year: a display preference, not a credential.
export const themeCookieMaxAgeSeconds = 60 * 60 * 24 * 365;

export function parseThemePreference(value: unknown): Theme | null {
  return typeof value === "string" && themes.some((theme) => theme === value) ? (value as Theme) : null;
}

/** Serializes the preference cookie. Not HttpOnly: the client toggle writes it. */
export function themeCookie(theme: Theme, secure: boolean) {
  return `${themeCookieName}=${theme}; Path=/; Max-Age=${themeCookieMaxAgeSeconds}; SameSite=Lax${secure ? "; Secure" : ""}`;
}
