import { NextResponse } from "next/server";
import { createSession, exchangeCode, validateOAuthState } from "@/lib/auth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code || !(await validateOAuthState(url.searchParams.get("state")))) return NextResponse.redirect(new URL("/?auth=denied", request.url));

  try {
    const user = await exchangeCode(code);
    await createSession({ id: user.id, username: user.username, avatar: user.avatar });
    return NextResponse.redirect(new URL("/", request.url));
  } catch {
    return NextResponse.redirect(new URL("/?auth=error", request.url));
  }
}
