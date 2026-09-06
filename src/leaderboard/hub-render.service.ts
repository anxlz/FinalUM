/**
 * The static "Match Center" hero banner — same matte/red/Antonio system as the
 * leaderboard, cached after first render since it carries no per-request data (personal
 * stats live in the ephemeral replies the hub's action select produces, not in this image).
 */

import { createCanvas } from "@napi-rs/canvas";
import { registerLeaderboardFonts } from "./render.service";

const WIDTH = 900;
const HEIGHT = 220;
const PALETTE = { bg0: "#0A0C0F", text: "#FFFFFF", muted: "#8B93A1", red: "#FA1146" };

let cached: Buffer | null = null;

export function renderMatchCenterBanner(): Buffer {
  if (cached) return cached;
  registerLeaderboardFonts();

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = PALETTE.bg0;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = PALETTE.red;
  ctx.fillRect(0, HEIGHT - 3, WIDTH, 3);

  ctx.fillStyle = PALETTE.text;
  ctx.font = `700 52px "UMDisplay", sans-serif`;
  ctx.fillText("UM LEAGUE MATCH CENTER", 36, 110);

  ctx.fillStyle = PALETTE.muted;
  ctx.font = `400 20px "UMBody", sans-serif`;
  ctx.fillText("Manage your official league matches.", 36, 150);

  cached = canvas.toBuffer("image/png");
  return cached;
}
