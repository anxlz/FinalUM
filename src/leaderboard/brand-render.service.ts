/**
 * Shared "brand hero" image renderer — the single top-of-embed image used everywhere a
 * Components V2 screen needs the Universe Meta look (matte surfaces, Antonio display type,
 * the one Universe Red #FA1146 accent) instead of a plain Discord embed. Every screen that
 * needs this look (Roster Apply, Roster Confirm, Application Review, Support, the
 * Create-Match wizard steps, the Match Room "vs" banner, and My Matches) renders through
 * this one module so the theme/fonts/spacing stay identical everywhere, instead of each
 * screen re-implementing its own canvas layout.
 */

import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import {
  PALETTE,
  SURFACE,
  WIDTH,
  bodyFont,
  displayFont,
  drawBadge,
  drawFooter,
  monoFont,
  registerLeaderboardFonts,
  truncate,
} from "./render.service";

const HEADER_HEIGHT = 130;
// Matches render.service.ts's own FOOTER_HEIGHT constant so drawFooter's fixed-height
// band lines up exactly with the space reserved for it below.
const FOOTER_HEIGHT = 46;
const ROSTER_ROW_HEIGHT = 64;
const MATCH_ROW_HEIGHT = 68;
const DETAIL_ROW_HEIGHT = 46;
const MATCHUP_HEIGHT = 200;
const STATUS_BAND_HEIGHT = 56;

export interface HeroDetail {
  label: string;
  value: string;
}

export interface HeroRosterEntry {
  name: string;
  avatarUrl?: string | null;
  sub?: string | null;
}

export interface HeroMatchupSide {
  name: string;
  logoUrl?: string | null;
}

export interface HeroStatus {
  label: string;
  tone: "approved" | "rejected" | "pending";
}

export interface HeroMatchRow {
  home: HeroMatchupSide;
  away: HeroMatchupSide;
  result: string;
}

export interface RenderHeroOptions {
  /** Big uppercase Antonio title — "ROSTER APPLY", "ROSTER CONFIRM", "SUPPORT", etc. */
  title: string;
  /** Small line under the title (step indicator, team name, application applicant, ...). */
  subtitle?: string;
  /** Optional small kicker above the title, e.g. "STEP 1 OF 3". */
  kicker?: string;
  /** Label/value rows rendered as a simple two-column detail list. */
  details?: HeroDetail[];
  /** Avatar + name rows — used for roster/application screens. */
  roster?: HeroRosterEntry[];
  /** Two-team "vs" graphic — used for the match room and my-matches banners. */
  matchup?: { home: HeroMatchupSide; away: HeroMatchupSide };
  /** Compact per-match rows (logos + names + result) — used for "My Matches". */
  matches?: HeroMatchRow[];
  /** Approved/rejected/pending status band, drawn under the header. */
  status?: HeroStatus;
  /** Footer note (defaults to a generic league note). */
  footer?: string;
}

function statusColor(tone: HeroStatus["tone"]): string {
  if (tone === "approved") return "#3FD17A"; // Win green
  if (tone === "rejected") return PALETTE.red; // #FA1146
  return "#FFB547"; // pending amber
}

function drawStatusBand(ctx: SKRSContext2D, y: number, status: HeroStatus): void {
  ctx.fillStyle = SURFACE.panel;
  ctx.fillRect(0, y, WIDTH, STATUS_BAND_HEIGHT);
  const color = statusColor(status.tone);
  ctx.fillStyle = color;
  ctx.fillRect(0, y, 4, STATUS_BAND_HEIGHT);
  ctx.font = displayFont(22);
  ctx.fillStyle = color;
  ctx.fillText(`● ${status.label.toUpperCase()}`, 36, y + STATUS_BAND_HEIGHT / 2 + 8);
}

function drawDetails(ctx: SKRSContext2D, y: number, details: HeroDetail[]): number {
  const colWidth = (WIDTH - 72) / 2;
  details.forEach((d, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 36 + col * colWidth;
    const rowY = y + row * DETAIL_ROW_HEIGHT;
    ctx.fillStyle = PALETTE.muted;
    ctx.font = bodyFont(12);
    ctx.fillText(d.label.toUpperCase(), x, rowY + 16);
    ctx.fillStyle = PALETTE.text;
    ctx.font = displayFont(18);
    ctx.fillText(truncate(ctx, d.value, colWidth - 20), x, rowY + 38);
  });
  return Math.ceil(details.length / 2) * DETAIL_ROW_HEIGHT;
}

async function drawRoster(ctx: SKRSContext2D, y: number, roster: HeroRosterEntry[]): Promise<number> {
  for (const [index, entry] of roster.entries()) {
    const rowY = y + index * ROSTER_ROW_HEIGHT;
    ctx.fillStyle = index % 2 === 0 ? SURFACE.panel : SURFACE.panelAlt;
    ctx.fillRect(0, rowY, WIDTH, ROSTER_ROW_HEIGHT);

    await drawBadge(ctx, entry.avatarUrl ?? null, 30, rowY + 8, 48, "circle", false, entry.name);

    ctx.fillStyle = PALETTE.text;
    ctx.font = displayFont(19);
    ctx.fillText(truncate(ctx, entry.name.toUpperCase(), WIDTH - 140), 96, rowY + 30);

    if (entry.sub) {
      ctx.fillStyle = PALETTE.muted;
      ctx.font = bodyFont(13);
      ctx.fillText(truncate(ctx, entry.sub, WIDTH - 140), 96, rowY + 50);
    }
  }
  return roster.length * ROSTER_ROW_HEIGHT;
}

/** Compact per-match row: small home/away badges, "TEAM vs TEAM", and a result label —
 *  used by "My Matches" to list recent fixtures with logos, one row each. */
async function drawMatchRows(ctx: SKRSContext2D, y: number, rows: HeroMatchRow[]): Promise<number> {
  const badgeSize = 40;
  for (const [index, row] of rows.entries()) {
    const rowY = y + index * MATCH_ROW_HEIGHT;
    ctx.fillStyle = index % 2 === 0 ? SURFACE.panel : SURFACE.panelAlt;
    ctx.fillRect(0, rowY, WIDTH, MATCH_ROW_HEIGHT);

    await drawBadge(ctx, row.home.logoUrl ?? null, 30, rowY + 14, badgeSize, "square", false, row.home.name);
    await drawBadge(ctx, row.away.logoUrl ?? null, 96, rowY + 14, badgeSize, "square", false, row.away.name);

    ctx.fillStyle = PALETTE.text;
    ctx.font = displayFont(17);
    const label = `${row.home.name.toUpperCase()}  vs  ${row.away.name.toUpperCase()}`;
    ctx.fillText(truncate(ctx, label, WIDTH - 340), 156, rowY + 40);

    ctx.textAlign = "right";
    ctx.fillStyle = PALETTE.red;
    ctx.font = monoFont(13, 500);
    ctx.fillText(truncate(ctx, row.result.toUpperCase(), 260), WIDTH - 30, rowY + MATCH_ROW_HEIGHT / 2 + 5);
    ctx.textAlign = "left";
  }
  return rows.length * MATCH_ROW_HEIGHT;
}

async function drawMatchup(ctx: SKRSContext2D, y: number, matchup: { home: HeroMatchupSide; away: HeroMatchupSide }): Promise<void> {
  const logoSize = 96;
  const centerX = WIDTH / 2;
  const logoY = y + 20;

  await drawBadge(ctx, matchup.home.logoUrl ?? null, centerX - 220 - logoSize / 2, logoY, logoSize, "square", false, matchup.home.name);
  await drawBadge(ctx, matchup.away.logoUrl ?? null, centerX + 220 - logoSize / 2, logoY, logoSize, "square", false, matchup.away.name);

  ctx.fillStyle = PALETTE.text;
  ctx.font = displayFont(20);
  ctx.textAlign = "center";
  ctx.fillText(truncate(ctx, matchup.home.name.toUpperCase(), 220), centerX - 220, logoY + logoSize + 30);
  ctx.fillText(truncate(ctx, matchup.away.name.toUpperCase(), 220), centerX + 220, logoY + logoSize + 30);

  ctx.fillStyle = PALETTE.red;
  ctx.font = displayFont(34);
  ctx.fillText("VS", centerX, logoY + logoSize / 2 + 12);
  ctx.textAlign = "left";
}

/**
 * Renders a single branded hero-image PNG combining whichever optional sections are
 * supplied. Callers attach the result as `attachment://<filename>` behind a Components V2
 * `MediaGalleryBuilder` (the "top large image" every one of these screens needs), never as
 * a classic embed image — CV2 messages can't mix `embeds` with `flags: IsComponentsV2`.
 */
export async function renderHero(options: RenderHeroOptions): Promise<Buffer> {
  registerLeaderboardFonts();

  let height = HEADER_HEIGHT;
  if (options.status) height += STATUS_BAND_HEIGHT;
  if (options.details?.length) height += Math.ceil(options.details.length / 2) * DETAIL_ROW_HEIGHT + 16;
  if (options.roster?.length) height += options.roster.length * ROSTER_ROW_HEIGHT + 8;
  if (options.matches?.length) height += options.matches.length * MATCH_ROW_HEIGHT + 8;
  if (options.matchup) height += MATCHUP_HEIGHT;
  height += FOOTER_HEIGHT;

  const canvas = createCanvas(WIDTH, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = SURFACE.background;
  ctx.fillRect(0, 0, WIDTH, height);

  if (options.kicker) {
    ctx.fillStyle = PALETTE.red;
    ctx.font = monoFont(13, 500);
    ctx.fillText(options.kicker.toUpperCase(), 36, 34);
  }

  ctx.fillStyle = PALETTE.red;
  ctx.fillRect(0, HEADER_HEIGHT - 2, WIDTH, 2);

  ctx.fillStyle = PALETTE.text;
  ctx.font = displayFont(40);
  ctx.fillText(options.title.toUpperCase(), 36, 78);

  if (options.subtitle) {
    ctx.fillStyle = PALETTE.muted;
    ctx.font = bodyFont(16);
    ctx.fillText(truncate(ctx, options.subtitle, WIDTH - 72), 36, 106);
  }

  let cursor = HEADER_HEIGHT;

  if (options.status) {
    drawStatusBand(ctx, cursor, options.status);
    cursor += STATUS_BAND_HEIGHT;
  }

  if (options.details?.length) {
    cursor += 16;
    cursor += drawDetails(ctx, cursor, options.details);
  }

  if (options.roster?.length) {
    cursor += 8;
    cursor += await drawRoster(ctx, cursor, options.roster);
  }

  if (options.matches?.length) {
    cursor += 8;
    cursor += await drawMatchRows(ctx, cursor, options.matches);
  }

  if (options.matchup) {
    await drawMatchup(ctx, cursor, options.matchup);
    cursor += MATCHUP_HEIGHT;
  }

  drawFooter(ctx, height - FOOTER_HEIGHT, options.footer ?? "UM LEAGUE • UNIVERSE META");

  return canvas.toBuffer("image/png");
}
