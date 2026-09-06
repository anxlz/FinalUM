import Link from "next/link";

export function AccessRestricted({ username }: { username?: string }) {
  return (
    <main className="auth-gate">
      <img src="/universe-meta-mark.webp" alt="Universe Meta" className="auth-logo" />
      <p className="eyebrow accent">ACCESS RESTRICTED</p>
      <h1>Missing staff permission</h1>
      <p>{username ? `Discord account ${username} is authenticated, but it does not have a configured Universe Meta staff role.` : "Your Discord account does not have permission to access Universe Meta Operations."}</p>
      <p>Ask a server administrator to assign the configured staff role, then sign in again.</p>
      <div className="auth-actions"><Link className="auth-button" href="/api/auth/logout">LOG OUT</Link><Link className="auth-secondary" href="/">RETURN HOME</Link></div>
    </main>
  );
}
