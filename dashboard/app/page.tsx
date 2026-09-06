import Link from "next/link";
import { getSystemStatus } from "@/lib/system-status";
import { getOverviewData } from "@/lib/overview-data";
import { getLeaderboardData } from "@/lib/operations-data";
import { authRequired, getDashboardAccess, getSessionIdentity } from "@/lib/auth";
import { AuthGate } from "@/components/auth-gate";
import { AccessRestricted } from "@/components/access-restricted";

const navigation = [
  { label: "Overview", index: "01", href: "/" },
  { label: "Matches", index: "02", href: "/matches" },
  { label: "Approvals", index: "03", href: "/approvals", badge: "--" },
  { label: "Teams", index: "04", href: "/teams" },
  { label: "Rosters", index: "05", href: "/rosters" },
  { label: "Players", index: "06", href: "/players" },
  { label: "Leaderboard", index: "07", href: "/leaderboard" },
  { label: "Tickets", index: "08", href: "/tickets" },
];

const systemNavigation = [
  { label: "Database", href: "/system/database" },
  { label: "Audit Log", href: "/system/audit" },
  { label: "Settings", href: "/system/settings" },
];
export default async function DashboardPage() {
  const access = await getDashboardAccess();
  if (authRequired() && !access) {
    const identity = await getSessionIdentity();
    return identity ? <AccessRestricted username={identity.username} /> : <AuthGate />;
  }
  const system = await getSystemStatus();
  const overview = getOverviewData();
  const leaderboard = getLeaderboardData(access);
  const botLabel = system.bot.status === "online" ? "ONLINE" : system.bot.status.replace("_", " ").toUpperCase();
  const databaseLabel = system.database.status === "connected" ? "SYNCED" : system.database.status.replace("_", " ").toUpperCase();
  const databaseConnected = system.database.status === "connected";
  const usesSqlite = system.configuration.dataSource === "sqlite";
  const metrics = [
    { label: "Registered teams", value: overview.metrics.registeredTeams, note: "Active teams", tone: "neutral" },
    { label: "Active matches", value: overview.metrics.activeMatches, note: "In progress or scheduled", tone: "neutral" },
    { label: "Pending approvals", value: overview.metrics.pendingApprovals, note: "Awaiting staff review", tone: "alert" },
    { label: "Matches completed", value: overview.metrics.completedMatches, note: "Season total", tone: "neutral" },
  ];

  return (
    <main className="dashboard-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <img className="brand-mark" src="/universe-meta-mark.webp" alt="Universe Meta" />
          <div>
            <strong>UNIVERSE<br />META</strong>
            <span>COMPETITIVE OPERATIONS</span>
          </div>
        </div>

        <div className="nav-group">
          <p className="eyebrow">Operations</p>
          <nav aria-label="Operations">
            {navigation.map((item) => (
              <Link className="nav-item is-active" href={item.href} key={item.label}>
                <span className="nav-index">{item.index}</span>
                <span>{item.label}</span>
                {item.badge && <span className="nav-badge">{item.badge}</span>}
              </Link>
            ))}
          </nav>
        </div>

        <div className="nav-group system-nav">
          <p className="eyebrow">System</p>
          <nav aria-label="System">
            {systemNavigation.map((item, index) => (
              <Link className="nav-item" href={item.href} key={item.label}>
                <span className="nav-index">{String(index + 8).padStart(2, "0")}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>
        </div>

        <div className="system-link">
          <p className="eyebrow">System link</p>
          <div><span>Discord bot</span><strong className={system.bot.status === "online" ? "status-online" : "status-pending"}>{botLabel}</strong></div>
          <div><span>Database</span><strong className={system.database.status === "connected" ? "status-online" : "status-pending"}>{databaseLabel}</strong></div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <span className="topbar-title">UNIVERSE META <b>/</b> COMPETITIVE OPERATIONS</span>
          <div className="topbar-status"><span className={`status-dot${system.bot.status === "online" && system.database.status === "connected" ? " is-online" : ""}`} /> {system.bot.status === "online" && system.database.status === "connected" ? "SYSTEM OPERATIONAL" : "SYSTEM DEGRADED"}</div>
          {access ? <Link className="user-chip" href="/api/auth/logout">{access.username} <span>LOG OUT</span></Link> : <Link className="user-chip" href="/api/auth/login">STAFF ACCESS <span>DISCORD LOGIN</span></Link>}
        </header>

        <div className="content">
          <div className="page-heading">
            <div>
              <p className="eyebrow accent">01 · Overview</p>
              <h1>Operations overview</h1>
              <p className="subheading">Season 01 / Staff dashboard</p>
            </div>
            <div className="window-status">
              <span className={`status-dot${databaseConnected ? " is-online" : " muted"}`} />
              <div><b>Competitive window</b><span>{databaseConnected ? "DATABASE CONNECTED" : "DATABASE CONNECTION REQUIRED"}</span></div>
            </div>
          </div>

          <section className="metrics-grid" aria-label="Operational metrics">
            {metrics.map((metric, index) => (
              <article className={`metric-card ${metric.tone === "alert" ? "is-alert" : ""}`} key={metric.label}>
                <div className="metric-top"><span>0{index + 1}</span><span className="metric-symbol">+</span></div>
                <strong>{String(metric.value).padStart(2, "0")}</strong>
                <div><p>{metric.label}</p><span>{metric.note}</span></div>
              </article>
            ))}
          </section>

          <section className="panel connection-panel">
            <div className="panel-heading">
              <div><p className="eyebrow">Integration status</p><h2>{databaseConnected ? "Operational database connected" : "Operational data is not connected"}</h2></div>
              <span className="panel-code">READ ONLY / PHASE 01</span>
            </div>
            <div className="connection-grid">
              <div className="connection-copy">
                <p>{databaseConnected ? "The dashboard is connected to the shared operational database. Match, approval, team, points, leaderboard, ticket, and audit views can now be wired to live queries." : "The dashboard shell is ready. Match, approval, team, points, leaderboard, ticket, and audit data will appear here after the shared database connection is configured."}</p>
                <div className="connection-note"><span className={`status-dot${databaseConnected ? " is-online" : " muted"}`} /> {databaseConnected ? "Live database connection verified." : "No operational metrics are being fabricated."}</div>
              </div>
              <div className="connection-list">
                <div><span>Dashboard runtime</span><strong>READY</strong></div>
                <div><span>Server-side data adapter</span><strong className={databaseConnected ? "status-online" : ""}>{databaseConnected ? "CONNECTED" : "PENDING"}</strong></div>
                <div><span>Discord OAuth</span><strong className="status-pending">NOT CONFIGURED</strong></div>
                <div><span>Realtime subscriptions</span><strong className="status-pending">{usesSqlite ? "DISABLED / SQLITE" : "NOT IMPLEMENTED"}</strong></div>
              </div>
            </div>
          </section>

          <div className="lower-grid">
            <section className="panel overview-data-panel"><div className="panel-heading"><div><p className="eyebrow">Match operations</p><h2>Recent matches</h2></div><Link className="panel-link" href="/matches">VIEW ALL →</Link></div>{overview.recentMatches.length === 0 ? <p className="empty-state">No matches have been registered for this guild yet.</p> : <div className="overview-table-wrap"><table className="overview-table"><thead><tr><th>Match</th><th>Teams</th><th>Status</th><th>Result</th></tr></thead><tbody>{overview.recentMatches.map((match) => <tr key={match.publicMatchId}><td className="mono-cell">{match.publicMatchId}</td><td><strong>{match.homeTeam}</strong><span>vs {match.awayTeam}</span></td><td><span className="table-status">{match.resultStatus.replaceAll("_", " ")}</span></td><td className="mono-cell">{match.leftScore === null || match.rightScore === null ? "-" : `${match.leftScore}-${match.rightScore}`}</td></tr>)}</tbody></table></div>}</section>
            <section className="panel overview-data-panel"><div className="panel-heading"><div><p className="eyebrow">Season data</p><h2>Season leaderboard</h2></div><Link className="panel-link" href="/leaderboard">FULL RANKING →</Link></div>{leaderboard.length === 0 ? <p className="empty-state">No teams are available for leaderboard standings.</p> : <div className="overview-table-wrap"><table className="overview-table"><thead><tr><th>#</th><th>Logo</th><th>Team</th><th>Tier</th><th>Points</th></tr></thead><tbody>{leaderboard.slice(0, 5).map((team, index) => <tr key={String(team.name)}><td className="mono-cell rank-cell">{String(index + 1).padStart(2, "0")}</td><td className="logo-cell"><img className="team-logo" src={String(team.logoUrl ?? "/universe-meta-mark.webp")} alt="" /></td><td><strong>{String(team.name)}</strong>{team.tag && <span>{String(team.tag)}</span>}</td><td>{String(team.tier ?? "UNASSIGNED")}</td><td className="mono-cell points-cell">{Number(team.points ?? 0).toLocaleString("en-US")}</td></tr>)}</tbody></table></div>}</section>
          </div>
        </div>
      </section>
    </main>
  );
}
