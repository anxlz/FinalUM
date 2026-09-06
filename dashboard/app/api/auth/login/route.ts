import { NextResponse } from "next/server";
import { createOAuthState, getLoginUrl } from "@/lib/auth";

export async function GET() {
  const state = await createOAuthState();
  const loginUrl = getLoginUrl(state ?? undefined);
  if (!loginUrl) return NextResponse.json({ error: "Discord OAuth is not configured" }, { status: 503 });
  return NextResponse.redirect(loginUrl, { headers: { "cache-control": "no-store" } });
}
