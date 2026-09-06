import Link from "next/link";
import { authConfigured, getLoginUrl } from "@/lib/auth";

export function AuthGate() {
  const loginUrl = getLoginUrl();
  return (
    <main className="auth-gate">
      <img src="/universe-meta-mark.webp" alt="Universe Meta" className="auth-logo" />
      <p className="eyebrow accent">SECURE STAFF ACCESS</p>
      <h1>Sign in to operations</h1>
      <p>{authConfigured() ? "Authenticate with Discord to access teams, players, and match operations." : "Discord OAuth is not configured on this dashboard yet."}</p>
      {loginUrl ? <Link className="auth-button" href="/api/auth/login">CONTINUE WITH DISCORD</Link> : <span className="auth-disabled">CONFIGURE DISCORD OAUTH FIRST</span>}
    </main>
  );
}
