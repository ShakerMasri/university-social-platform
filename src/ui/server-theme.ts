import "server-only";
import { cookies } from "next/headers";
import { parseThemePreference, themeCookieName } from "./theme";

/** The user's explicit theme choice, or null to follow the system preference. */
export async function readThemePreference() {
  return parseThemePreference((await cookies()).get(themeCookieName)?.value);
}
