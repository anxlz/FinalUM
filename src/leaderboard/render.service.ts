/**
 * Leaderboard image composition (§7.5). Uses `@napi-rs/canvas`.
 *
 * This is where the Universe Meta design system (UM-DS-2026 · EMEA) actually applies in
 * full — Discord embeds only expose one accent colour and no font control, but a
 * canvas-rendered image is a real surface, so the system's rules are followed literally:
 *
 *   - matte 6-step surface ramp, never pure black
 *   - ONE red accent (#FA1146) per composition — a 2px rule under the header, nothing else.
 *     Rank is never colour-coded across the whole medal set; only rank 1 gets the cream
 *     "trophy" treatment the system reserves for grand-final moments.
 *   - Antonio (display/uppercase) for titles, scores and names; Archivo for section
 *     headings; Geist for body copy; Geist Mono for the numeric data columns.
 *   - sharp corners (badges sit on the system's 0/2/4/6/10 radius scale, never more)
 *   - no gradients, no glow, no glassmorphism, no fade/bounce/spin — motion is a straight
 *     slide on a single fast-in/smooth-out ease, and the LIVE dot is the one place the
 *     system specifies a loop (a slow pulse), used only when this board is a live one.
 *
 * The brand fonts ship in /assets/fonts (Antonio, Archivo, Geist, Geist Mono — all
 * OFL-licensed, sourced from google/fonts and vercel/geist-font). Arabic/CJK team names
 * still need the system-font fallback registered alongside them (§34).
 */

import { createCanvas, GlobalFonts, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import { GIFEncoder, applyPalette, quantize } from "gifenc";
import { logger } from "../lib/logger";
import type { PlayerStanding, TeamStanding } from "./standings.service";

export type LeaderboardStyle = "static" | "animated";

export const WIDTH = 900;
const HEADER_HEIGHT = 120;
const ROW_HEIGHT = 72;
const FOOTER_HEIGHT = 46;

/** Universe Meta 6-step matte ramp + semantic tokens. Never pure black (#000). */
export const PALETTE = {
  stage: "#060708",
  bg0: "#0A0C0F",
  bg1: "#101318",
  bg2: "#161A20",
  bg3: "#1E232B",
  bg4: "#272D37",
  text: "#FFFFFF", // pure white — reserved for score numbers and hero titles
  muted: "#8B93A1",
  cream: "#EDE6D6", // trophies and grand-final moments only
  red: "#FA1146", // Universe Red — the single accent, used once per composition
};

/** Header, panel and alt-row colours drawn from the ramp. */
export const SURFACE = {
  background: PALETTE.bg0,
  panel: PALETTE.bg1,
  panelAlt: PALETTE.bg2,
};

const FONT_CANDIDATES: Array<{ family: string; paths: string[] }> = [
  {
    family: "UMDisplay",
    paths: ["./assets/fonts/Antonio-Variable.ttf", `${process.cwd()}/assets/fonts/Antonio-Variable.ttf`],
  },
  {
    family: "UMHeadline",
    paths: ["./assets/fonts/Archivo-Variable.ttf", `${process.cwd()}/assets/fonts/Archivo-Variable.ttf`],
  },
  {
    family: "UMBody",
    paths: ["./assets/fonts/Geist-Regular.ttf", `${process.cwd()}/assets/fonts/Geist-Regular.ttf`],
  },
  {
    family: "UMMono",
    paths: ["./assets/fonts/GeistMono-Regular.ttf", `${process.cwd()}/assets/fonts/GeistMono-Regular.ttf`],
  },
  {
    family: "UMArabic",
    paths: [
      "/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf",
      "/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf",
      "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ],
  },
  {
    family: "UMCjk",
    paths: [
      "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
      "/usr/share/fonts/truetype/fonts-japanese-gothic.ttf",
      "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
    ],
  },
];

let fontsReady = false;
const registeredFamilies = new Set<string>();

export function registerLeaderboardFonts(): { registered: string[]; missing: string[] } {
  if (fontsReady) return { registered: [...registeredFamilies], missing: [] };

  const missing: string[] = [];
  for (const candidate of FONT_CANDIDATES) {
    const found = candidate.paths.find((path) => {
      try {
        return GlobalFonts.registerFromPath(path, candidate.family) !== undefined;
      } catch {
        return false;
      }
    });
    if (found) registeredFamilies.add(candidate.family);
    else missing.push(candidate.family);
  }

  fontsReady = true;
  if (missing.length > 0) {
    logger.warn("leaderboard fonts missing", {
      missing,
      fix:
        "brand fonts ship in ./assets/fonts — check the working directory; Arabic/CJK need apt-get install fonts-noto-core fonts-noto-cjk",
    });
  } else {
    logger.info("leaderboard fonts registered", { families: [...registeredFamilies] });
  }
  return { registered: [...registeredFamilies], missing };
}

/** Antonio-first stack: titles, scores, uppercase team/player names, kickers. */
export function displayFont(size: number): string {
  const fallback = ["UMArabic", "UMCjk"].filter((f) => registeredFamilies.has(f));
  return `700 ${size}px ${["UMDisplay", ...fallback, "sans-serif"].map((f) => `"${f}"`).join(", ")}`;
}

/** Archivo — section headings only (unused at leaderboard row-scale, kept for parity). */
export function headlineFont(size: number): string {
  return `800 ${size}px "UMHeadline", "UMDisplay", sans-serif`;
}

/** Geist — running/body text, muted secondary lines. */
export function bodyFont(size: number, weight: 400 | 500 = 400): string {
  const fallback = ["UMArabic", "UMCjk"].filter((f) => registeredFamilies.has(f));
  return `${weight} ${size}px ${["UMBody", ...fallback, "sans-serif"].map((f) => `"${f}"`).join(", ")}`;
}

/** Geist Mono — the numeric stat columns (data, per the system's own type rules). */
export function monoFont(size: number, weight: 400 | 500 = 500): string {
  return `${weight} ${size}px "UMMono", monospace`;
}

export function truncate(ctx: SKRSContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}

function formatObjective(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** "01".."99" — the system's two-digit tabular numeral rule for ranks. */
function rankLabel(index: number): string {
  return String(index + 1).padStart(2, "0");
}

/**
 * Header: bg-0 surface, uppercase Antonio title, Geist subtitle, and a single 2px
 * Universe Red rule underneath — the one accent this composition is allowed. `liveAlpha`
 * (0–1, only set on the animated live-board path) draws the small pulsing "● LIVE" mark the
 * system specifies for the live state; omitted entirely on ordinary boards.
 */
export function drawHeader(ctx: SKRSContext2D, title: string, subtitle: string, liveAlpha?: number): void {
  ctx.fillStyle = SURFACE.background;
  ctx.fillRect(0, 0, WIDTH, HEADER_HEIGHT);

  ctx.fillStyle = PALETTE.red;
  ctx.fillRect(0, HEADER_HEIGHT - 2, WIDTH, 2);

  ctx.fillStyle = PALETTE.text;
  ctx.font = displayFont(36);
  ctx.fillText(title.toUpperCase(), 36, 60);

  ctx.fillStyle = PALETTE.muted;
  ctx.font = bodyFont(16);
  ctx.fillText(subtitle, 36, 88);

  if (liveAlpha !== undefined) {
    const label = "● LIVE";
    ctx.font = monoFont(14, 500);
    const w = ctx.measureText(label).width;
    ctx.save();
    ctx.globalAlpha = 0.45 + 0.55 * liveAlpha;
    ctx.fillStyle = PALETTE.red;
    ctx.fillText(label, WIDTH - w - 36, 40);
    ctx.restore();
  }
}

export function drawFooter(ctx: SKRSContext2D, y: number, note: string): void {
  ctx.fillStyle = SURFACE.background;
  ctx.fillRect(0, y, WIDTH, FOOTER_HEIGHT);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = monoFont(12, 400);
  ctx.fillText(note, 36, y + 27);
}

/**
 * Badge: sharp square (team logo) or circle (player avatar). Only `trophy` (rank 1) gets a
 * ring — cream, per "reserved for trophies and grand-final moments." No other rank is
 * colour-coded; the numeral column alone communicates 2nd through 4th.
 */
export async function drawBadge(
  ctx: SKRSContext2D,
  imageUrl: string | null,
  x: number,
  y: number,
  size: number,
  shape: "circle" | "square",
  trophy: boolean,
  fallbackText: string,
): Promise<void> {
  const cx = x + size / 2;
  const cy = y + size / 2;
  const cornerRadius = 6; // system scale: 0 / 2 / 4 / 6 / 10

  ctx.save();
  ctx.beginPath();
  if (shape === "circle") ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  else ctx.roundRect(x, y, size, size, cornerRadius);
  ctx.clip();

  let drawn = false;
  if (imageUrl) {
    try {
      const image = await loadImage(imageUrl);
      ctx.drawImage(image, x, y, size, size);
      drawn = true;
    } catch {
      drawn = false;
    }
  }
  if (!drawn) {
    ctx.fillStyle = SURFACE.panelAlt;
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = displayFont(Math.round(size * 0.36));
    const initials = fallbackText.slice(0, 2).toUpperCase();
    const metrics = ctx.measureText(initials);
    ctx.fillText(initials, cx - metrics.width / 2, cy + size * 0.14);
  }
  ctx.restore();

  if (trophy) {
    ctx.strokeStyle = PALETTE.cream;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (shape === "circle") ctx.arc(cx, cy, size / 2 + 2, 0, Math.PI * 2);
    else ctx.roundRect(x - 2, y - 2, size + 4, size + 4, cornerRadius + 2);
    ctx.stroke();
  }
}

/** Two-column stat block: Geist label above, Geist Mono value below — "data" per the type rules. */
function drawStatColumn(ctx: SKRSContext2D, x: number, y: number, label: string, value: string): void {
  ctx.fillStyle = PALETTE.muted;
  ctx.font = bodyFont(11);
  ctx.fillText(label, x, y);
  ctx.fillStyle = PALETTE.text;
  ctx.font = monoFont(18, 500);
  ctx.fillText(value, x, y + 24);
}

export interface TeamBoardOptions {
  standings: TeamStanding[];
  sortLabel: string;
  regionLabel: string;
}

export async function renderTeamLeaderboard(options: TeamBoardOptions): Promise<Buffer> {
  registerLeaderboardFonts();

  const rows = options.standings.slice(0, 10);
  const height = HEADER_HEIGHT + Math.max(1, rows.length) * ROW_HEIGHT + FOOTER_HEIGHT;
  const canvas = createCanvas(WIDTH, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = SURFACE.background;
  ctx.fillRect(0, 0, WIDTH, height);
  drawHeader(ctx, "Team Leaderboard", `${options.regionLabel} • sorted by ${options.sortLabel}`);

  if (rows.length === 0) {
    ctx.fillStyle = PALETTE.muted;
    ctx.font = bodyFont(16);
    ctx.fillText("No completed matches yet.", 36, HEADER_HEIGHT + 44);
  }

  for (const [index, team] of rows.entries()) {
    const y = HEADER_HEIGHT + index * ROW_HEIGHT;

    ctx.fillStyle = index % 2 === 0 ? SURFACE.panel : SURFACE.panelAlt;
    ctx.fillRect(0, y, WIDTH, ROW_HEIGHT);

    ctx.fillStyle = index === 0 ? PALETTE.cream : PALETTE.muted;
    ctx.font = displayFont(22);
    ctx.fillText(rankLabel(index), 30, y + 45);

    await drawBadge(ctx, team.logoUrl, 78, y + 10, 52, "square", index === 0, team.tag ?? team.name);

    ctx.fillStyle = PALETTE.text;
    ctx.font = displayFont(19);
    const label = (team.tag ? `${team.name} [${team.tag}]` : team.name).toUpperCase();
    ctx.fillText(truncate(ctx, label, 320), 150, y + 33);

    ctx.fillStyle = PALETTE.muted;
    ctx.font = bodyFont(13);
    ctx.fillText(
      `${team.region ?? "—"} • ${team.wins}W ${team.losses}L • ${(team.winRate * 100).toFixed(0)}%`,
      150,
      y + 56,
    );

    const columns: Array<[string, string]> = [
      ["PTS", String(team.points)],
      ["K/D", team.kd.toFixed(2)],
      ["KILLS", String(team.kills)],
      ["OBJ", formatObjective(team.objectiveSeconds)],
    ];
    columns.forEach(([heading, value], i) => drawStatColumn(ctx, 520 + i * 95, y + 30, heading, value));
  }

  drawFooter(ctx, height - FOOTER_HEIGHT, "TOTALS INCLUDE APPROVED MATCHES ONLY");
  return canvas.toBuffer("image/png");
}

export interface PlayerBoardOptions {
  standings: PlayerStanding[];
  sortLabel: string;
  regionLabel: string;
}

export async function renderPlayerLeaderboard(options: PlayerBoardOptions): Promise<Buffer> {
  registerLeaderboardFonts();

  const rows = options.standings.slice(0, 10);
  const height = HEADER_HEIGHT + Math.max(1, rows.length) * ROW_HEIGHT + FOOTER_HEIGHT;
  const canvas = createCanvas(WIDTH, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = SURFACE.background;
  ctx.fillRect(0, 0, WIDTH, height);
  drawHeader(ctx, "Player Leaderboard", `${options.regionLabel} • sorted by ${options.sortLabel}`);

  if (rows.length === 0) {
    ctx.fillStyle = PALETTE.muted;
    ctx.font = bodyFont(16);
    ctx.fillText("No completed matches yet.", 36, HEADER_HEIGHT + 44);
  }

  for (const [index, player] of rows.entries()) {
    const y = HEADER_HEIGHT + index * ROW_HEIGHT;

    ctx.fillStyle = index % 2 === 0 ? SURFACE.panel : SURFACE.panelAlt;
    ctx.fillRect(0, y, WIDTH, ROW_HEIGHT);

    ctx.fillStyle = index === 0 ? PALETTE.cream : PALETTE.muted;
    ctx.font = displayFont(22);
    ctx.fillText(rankLabel(index), 30, y + 45);

    await drawBadge(ctx, player.avatarUrl ?? null, 78, y + 10, 52, "circle", index === 0, player.ign);

    ctx.fillStyle = PALETTE.text;
    ctx.font = displayFont(19);
    ctx.fillText(truncate(ctx, player.ign.toUpperCase(), 300), 150, y + 33);

    ctx.fillStyle = PALETTE.muted;
    ctx.font = bodyFont(13);
    ctx.fillText(
      truncate(ctx, `${player.teamName} • ${player.matchesPlayed} matches`, 300),
      150,
      y + 56,
    );

    const columns: Array<[string, string]> = [
      ["PTS", String(player.points)],
      ["K/D", player.kd.toFixed(2)],
      ["KILLS", String(player.kills)],
      ["MVP", String(player.mvps)],
    ];
    columns.forEach(([heading, value], i) => drawStatColumn(ctx, 520 + i * 95, y + 30, heading, value));
  }

  drawFooter(ctx, height - FOOTER_HEIGHT, "TOTALS INCLUDE APPROVED MATCHES ONLY");
  return canvas.toBuffer("image/png");
}


/* ------------------------------------------------------------------ *
 * Animated variant (§7.5 /leaderboardstyle)
 *
 * Per direct instruction this now runs counter to the design system's general "no glow"
 * rule for exactly one thing: the top 3 ranks flicker with a Universe Red heat-lightning
 * glow behind their badge. Every frame otherwise shows the full, static board — there is no
 * slide-in entrance any more — and the glow is always the same hue (#FA1146), only its
 * intensity/radius flicker frame to frame, which is what keeps it reading as "the same
 * colour, just glowing" rather than a rainbow effect.
 * ------------------------------------------------------------------ */

const GIF_FRAMES = 12;
// 50% slower playback than the original 90ms/frame (§10 — glow animation slowed down).
const GIF_FRAME_DELAY_MS = 135;

/** Irregular, lightning-like flicker rather than a smooth sine pulse — sum of two
 *  incommensurate frequencies so consecutive frames don't repeat a clean rhythm.
 *  Frequencies are halved (50% slower) alongside the frame delay above so the glow's
 *  own flicker rate slows in step with the overall playback rate. */
function heatFlicker(frame: number, seed: number): number {
  const a = Math.sin(frame * 0.85 + seed * 2.1);
  const b = Math.sin(frame * 1.45 + seed * 4.4);
  return Math.max(0, (a * 0.6 + b * 0.4 + 1) / 2);
}

function drawHeatLightning(ctx: SKRSContext2D, cx: number, cy: number, baseRadius: number, intensity: number): void {
  const radius = baseRadius * (1.3 + 0.5 * intensity);
  const glow = ctx.createRadialGradient(cx, cy, baseRadius * 0.5, cx, cy, radius);
  glow.addColorStop(0, `rgba(250, 17, 70, ${0.55 * intensity})`);
  glow.addColorStop(1, "rgba(250, 17, 70, 0)");
  ctx.save();
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

async function renderAnimated(
  drawFrame: (ctx: SKRSContext2D, frame: number, liveAlpha: number) => Promise<void>,
  width: number,
  height: number,
): Promise<Buffer> {
  const encoder = GIFEncoder();

  for (let frame = 0; frame < GIF_FRAMES; frame += 1) {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    const linear = frame / (GIF_FRAMES - 1);
    // One slow pulse cycle across the clip, per the system's 1.4s LIVE-dot loop.
    const liveAlpha = 0.5 + 0.5 * Math.sin(Math.PI * linear);

    await drawFrame(ctx, frame, liveAlpha);

    const { data } = ctx.getImageData(0, 0, width, height);
    const palette = quantize(data, 256);
    encoder.writeFrame(applyPalette(data, palette), width, height, {
      palette,
      delay: frame === GIF_FRAMES - 1 ? 2000 : GIF_FRAME_DELAY_MS,
    });
  }

  encoder.finish();
  return Buffer.from(encoder.bytes());
}

export async function renderTeamLeaderboardAnimated(
  options: TeamBoardOptions,
  live = false,
): Promise<Buffer> {
  registerLeaderboardFonts();
  const rows = options.standings.slice(0, 10);
  const height = HEADER_HEIGHT + Math.max(1, rows.length) * ROW_HEIGHT + FOOTER_HEIGHT;

  return renderAnimated(
    async (ctx, frame, liveAlpha) => {
      ctx.fillStyle = SURFACE.background;
      ctx.fillRect(0, 0, WIDTH, height);
      drawHeader(
        ctx,
        "Team Leaderboard",
        `${options.regionLabel} • sorted by ${options.sortLabel}`,
        live ? liveAlpha : undefined,
      );

      for (const [index, team] of rows.entries()) {
        const y = HEADER_HEIGHT + index * ROW_HEIGHT;

        ctx.fillStyle = index % 2 === 0 ? SURFACE.panel : SURFACE.panelAlt;
        ctx.fillRect(0, y, WIDTH, ROW_HEIGHT);

        if (index < 3) {
          drawHeatLightning(ctx, 78 + 26, y + 10 + 26, 30, heatFlicker(frame, index));
        }

        ctx.fillStyle = index === 0 ? PALETTE.cream : PALETTE.muted;
        ctx.font = displayFont(22);
        ctx.fillText(rankLabel(index), 30, y + 45);

        await drawBadge(ctx, team.logoUrl, 78, y + 10, 52, "square", index === 0, team.tag ?? team.name);

        ctx.fillStyle = PALETTE.text;
        ctx.font = displayFont(19);
        const label = (team.tag ? `${team.name} [${team.tag}]` : team.name).toUpperCase();
        ctx.fillText(truncate(ctx, label, 320), 150, y + 33);

        ctx.fillStyle = PALETTE.muted;
        ctx.font = bodyFont(13);
        ctx.fillText(
          `${team.region ?? "—"} • ${team.wins}W ${team.losses}L • ${(team.winRate * 100).toFixed(0)}%`,
          150,
          y + 56,
        );

        const columns: Array<[string, string]> = [
          ["PTS", String(team.points)],
          ["K/D", team.kd.toFixed(2)],
          ["KILLS", String(team.kills)],
          ["OBJ", formatObjective(team.objectiveSeconds)],
        ];
        columns.forEach(([heading, value], i) => drawStatColumn(ctx, 520 + i * 95, y + 30, heading, value));
      }

      drawFooter(ctx, height - FOOTER_HEIGHT, "TOTALS INCLUDE APPROVED MATCHES ONLY");
    },
    WIDTH,
    height,
  );
}

export async function renderPlayerLeaderboardAnimated(
  options: PlayerBoardOptions,
  live = false,
): Promise<Buffer> {
  registerLeaderboardFonts();
  const rows = options.standings.slice(0, 10);
  const height = HEADER_HEIGHT + Math.max(1, rows.length) * ROW_HEIGHT + FOOTER_HEIGHT;

  return renderAnimated(
    async (ctx, frame, liveAlpha) => {
      ctx.fillStyle = SURFACE.background;
      ctx.fillRect(0, 0, WIDTH, height);
      drawHeader(
        ctx,
        "Player Leaderboard",
        `${options.regionLabel} • sorted by ${options.sortLabel}`,
        live ? liveAlpha : undefined,
      );

      for (const [index, player] of rows.entries()) {
        const y = HEADER_HEIGHT + index * ROW_HEIGHT;

        ctx.fillStyle = index % 2 === 0 ? SURFACE.panel : SURFACE.panelAlt;
        ctx.fillRect(0, y, WIDTH, ROW_HEIGHT);

        if (index < 3) {
          drawHeatLightning(ctx, 78 + 26, y + 10 + 26, 30, heatFlicker(frame, index));
        }

        ctx.fillStyle = index === 0 ? PALETTE.cream : PALETTE.muted;
        ctx.font = displayFont(22);
        ctx.fillText(rankLabel(index), 30, y + 45);

        await drawBadge(ctx, player.avatarUrl ?? null, 78, y + 10, 52, "circle", index === 0, player.ign);

        ctx.fillStyle = PALETTE.text;
        ctx.font = displayFont(19);
        ctx.fillText(truncate(ctx, player.ign.toUpperCase(), 300), 150, y + 33);

        ctx.fillStyle = PALETTE.muted;
        ctx.font = bodyFont(13);
        ctx.fillText(
          truncate(ctx, `${player.teamName} • ${player.matchesPlayed} matches`, 300),
          150,
          y + 56,
        );

        const columns: Array<[string, string]> = [
          ["PTS", String(player.points)],
          ["K/D", player.kd.toFixed(2)],
          ["KILLS", String(player.kills)],
          ["MVP", String(player.mvps)],
        ];
        columns.forEach(([heading, value], i) => drawStatColumn(ctx, 520 + i * 95, y + 30, heading, value));
      }

      drawFooter(ctx, height - FOOTER_HEIGHT, "TOTALS INCLUDE APPROVED MATCHES ONLY");
    },
    WIDTH,
    height,
  );
}
