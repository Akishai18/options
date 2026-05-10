/* Supabase email-link / OAuth callback.
 * The user clicks a link in their inbox → arrives here with a `code` in the
 * URL → we exchange it for a session cookie → redirect to wherever they were
 * trying to go. */

import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const fail = new URL("/sign-in", url.origin);
      fail.searchParams.set("error", error.message);
      return NextResponse.redirect(fail);
    }
  }

  const destPath = next.startsWith("/") ? next : "/";
  return NextResponse.redirect(new URL(destPath, url.origin));
}
