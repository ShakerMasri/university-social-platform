import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale } from "@/i18n/locales";

export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL(`/${defaultLocale}`, request.url), 307);
}
