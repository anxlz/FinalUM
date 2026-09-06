import Link from "next/link";
import { getTeamsData } from "@/lib/teams-data";
import { getApprovalsData, getAuditData, getLeaderboardData, getMatchesData, getPlayersData, getSettingsData } from "@/lib/operations-data";
import { authRequired, getDashboardAccess, getSessionIdentity } from "@/lib/auth";
import { AuthGate } from "@/components/auth-gate";
import { AccessRestricted } from "@/components/access-restricted";
import { SettingsTable } from "@/components/settings-table";

const labels: Record<string, { eyebrow: string; title: string; description: string }> = {
  matches: { eyebrow: "02 · Match operations", title: "Matches", description: "Match records, statuses, results, and history will appear here from the existing match service." },
  approvals: { eyebrow: "03 · Validation queue", title: "Approvals", description: "Approval review actions will be enabled after server-side Discord authorization is configured." },
  teams: { eyebrow: "04 · Competition", title: "Teams", description: "Team profiles, tiers, points, captains, and rosters will reuse the existing team service." },
  rosters: { eyebrow: "05 · Competition", title: "Rosters", description: "Roster and unresolved player data will appear here from the existing roster and player services." },
  players: { eyebrow: "06 · Competition", title: "Players", description: "Players from the active team rosters." },
  leaderboard: { eyebrow: "07 · Season data", title: "Leaderboard", description: "Standings from the existing point transactions." },
  tickets: { eyebrow: "08 · Support operations", title: "Tickets", description: "Ticket persistence is not present in the current SQLite schema." },
  database: { eyebrow: "09 · System", title: "Database", description: "Connection and migration health." },
  audit: { eyebrow: "10 · System", title: "Audit log", description: "Audited operational events from the bot." },
  settings: { eyebrow: "11 · System", title: "Settings", description: "Automation configuration from the bot database." },
};

export default async function SectionPage({ params }: { params: Promise<{ section: string[] }> }) {
  const access = await getDashboardAccess();
  if (authRequired() && !access) {
    const identity = await getSessionIdentity();
    return identity ? <AccessRestricted username={identity.username} /> : <AuthGate />;
  }
  const { section } = await params;
  const key = section.at(-1) ?? "overview";
  const page = labels[key] ?? { eyebrow: "Operations", title: "Section unavailable", description: "This dashboard route is not registered." };

  if (key === "teams") {
    const teams = getTeamsData(access);
    return (
      <main className="placeholder-page"><Link className="back-link" href="/">← Return to overview</Link><div className="section-heading"><div><p className="eyebrow accent">{page.eyebrow}</p><h1>{page.title}</h1><p className="subheading">Live team records from the shared SQLite database</p></div><span className="panel-code">{teams.length} TEAMS</span></div><section className="panel data-panel"><div className="data-panel-heading"><span className="eyebrow">Registered teams</span><span className="panel-code">READ ONLY</span></div>{teams.length === 0 ? <p className="empty-state">No teams have been registered for this guild yet.</p> : <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Team</th><th>Tier</th><th>Region</th><th>Roster</th><th>Points</th><th>Status</th></tr></thead><tbody>{teams.map((team) => <tr key={team.id}><td><img className="team-logo" src={team.logoUrl ?? "/universe-meta-mark.webp"} alt="" /><strong>{team.name}</strong>{team.tag && <span>{team.tag}</span>}</td><td>{team.tier ?? "UNASSIGNED"}</td><td>{team.region ?? "UNASSIGNED"}</td><td>{team.rosterCount}</td><td>{team.points.toLocaleString("en-US")}</td><td><span className={team.active ? "table-status active" : "table-status"}>{team.active ? "ACTIVE" : "INACTIVE"}</span></td></tr>)}</tbody></table></div>}</section></main>
    );
  }

  if (key === "database") {
    const configuration = (await import("@/lib/system-status")).getSystemStatus;
    const system = await configuration();
    return <main className="placeholder-page"><Link className="back-link" href="/">← Return to overview</Link><div className="section-heading"><div><p className="eyebrow accent">{page.eyebrow}</p><h1>{page.title}</h1><p className="subheading">Live server-side connection status</p></div><span className="panel-code">READ ONLY</span></div><section className="panel data-panel"><div className="connection-list"><div><span>Selected data source</span><strong>{system.configuration.dataSource.toUpperCase()}</strong></div><div><span>Database connection</span><strong className="status-online">{system.database.status.toUpperCase()}</strong></div><div><span>Bot health</span><strong className={system.bot.status === "online" ? "status-online" : "status-pending"}>{system.bot.status.toUpperCase()}</strong></div><div><span>Credentials exposed</span><strong className="status-online">NO</strong></div></div></section></main>;
  }

  if (key === "settings") {
    const settings = getSettingsData();
    return <main className="placeholder-page"><Link className="back-link" href="/">← Return to overview</Link><div className="section-heading"><div><p className="eyebrow accent">{page.eyebrow}</p><h1>{page.title}</h1><p className="subheading">Automation configuration from the bot database</p></div><span className="panel-code">STAFF ONLY</span></div><section className="panel data-panel">{settings.length === 0 ? <p className="empty-state">No saved configuration values yet.</p> : <SettingsTable settings={settings.map((setting) => ({ key: String(setting.key), value: setting.value, updatedAt: setting.updatedAt, updatedBy: setting.updatedBy }))} />}</section></main>;
  }

  const data = key === "matches" ? getMatchesData(access) : key === "players" || key === "rosters" ? getPlayersData(access) : key === "leaderboard" ? getLeaderboardData(access) : key === "approvals" ? getApprovalsData() : key === "audit" ? getAuditData() : key === "settings" ? getSettingsData() : [];
  const unsupportedTickets = key === "tickets";
  const columns = key === "matches" ? ["matchId", "homeTeam", "awayTeam", "scheduleStatus", "resultStatus"] : key === "players" || key === "rosters" ? ["logoUrl", "ign", "teamName", "role", "uid", "active"] : key === "leaderboard" ? ["logoUrl", "name", "tag", "tier", "points"] : key === "approvals" ? ["matchId", "homeTeam", "awayTeam", "kind", "status"] : key === "audit" ? ["action", "subjectType", "subjectId", "createdAt"] : ["key", "value", "updatedAt"];
  return <main className="placeholder-page"><Link className="back-link" href="/">← Return to overview</Link><div className="section-heading"><div><p className="eyebrow accent">{page.eyebrow}</p><h1>{page.title}</h1><p className="subheading">{page.description}</p></div><span className="panel-code">{unsupportedTickets ? "SCHEMA GAP" : `${data.length} RECORDS`}</span></div><section className="panel data-panel">{unsupportedTickets ? <p className="empty-state">No ticket table exists in the current SQLite schema. Ticket channel IDs are stored on matches, but ticket status and activity are not persisted.</p> : data.length === 0 ? <p className="empty-state">No records found for this guild.</p> : <div className="data-table-wrap"><table className="data-table"><thead><tr>{columns.map((column) => <th key={column}>{column === "logoUrl" ? "Logo" : column.replace(/([A-Z])/g, " $1")}</th>)}</tr></thead><tbody>{data.map((row, index) => <tr key={String(row.id ?? row.matchId ?? row.subjectId ?? index)}>{columns.map((column) => <td key={column}>{column === "logoUrl" ? <img className="team-logo" src={String(row[column] ?? "/universe-meta-mark.webp")} alt="" /> : column === "active" ? (row[column] ? "ACTIVE" : "INACTIVE") : String(row[column] ?? "-")}</td>)}</tr>)}</tbody></table></div>}</section></main>;

  /* This branch is retained for unknown route keys. */
  return (
    <main className="placeholder-page">
      <Link className="back-link" href="/">← Return to overview</Link>
      <p className="eyebrow accent">{page.eyebrow}</p>
      <h1>{page.title}</h1>
      <section className="panel placeholder-panel">
        <span className="panel-code">INTEGRATION PENDING</span>
        <h2>Operational data adapter pending</h2>
        <p>{page.description}</p>
        <p className="empty-state">No placeholder records are being displayed.</p>
      </section>
    </main>
  );
}