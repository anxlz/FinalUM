/**
 * The Components V2 leaderboard board: image on top, a "View" select (Team/Player), a
 * "Filter By" select (Region / Tier / mode / sort), and First/Prev/Next/Last pagination —
 * all inside one container, shared by `/leaderboard`, `/leaderboardlive`, the 30s refresh
 * watcher, and the Match Center "Leaderboard" shortcut, so none of them can drift from
 * each other.
 *
 * State (view/sort/region/tier/mode/page) is small enough to encode directly in
 * `custom_id` — unlike the match wizard's team UUIDs, none of these values threaten
 * Discord's 100-character limit, so there's no need for a session-token map here.
 */

import { AttachmentBuilder, StringSelectMenuBuilder, type Client } from "discord.js";
import { getConfig } from "../lib/automation-config";
import {
  getPlayerStandings,
  getPlayerStandingsCount,
  getTeamStandings,
  getTeamStandingsCount,
  listDistinctTiers,
  PLAYER_SORTS,
  TEAM_SORTS,
  type PlayerSort,
  type PlayerStanding,
  type TeamSort,
} from "./standings.service";
import { REGIONS, type Region } from "../teams/team.service";
import {
  renderPlayerLeaderboard,
  renderPlayerLeaderboardAnimated,
  renderTeamLeaderboard,
  renderTeamLeaderboardAnimated,
  type LeaderboardStyle,
} from "./render.service";
import { BRAND_COLOR, actionRow, container, divider, galleryImage, grayButton, redButton, text, CV2 } from "../lib/ui-kit";
import type { ContainerChild } from "../lib/ui-kit";

export const BOARD_PREFIX = "board";
const PAGE_SIZE = 10;

export type LeaderboardMode = "hardpoint" | "search_and_destroy" | "control";

export interface BoardState {
  view: "team" | "player";
  sort: string;
  region: Region | null;
  tier: string | null;
  mode: LeaderboardMode | null;
  page: number;
}

export function encodeState(s: BoardState): string {
  return [s.view, s.sort, s.region ?? "*", s.tier ?? "*", s.mode ?? "*", String(s.page)].join("~");
}

export function decodeState(token: string): BoardState {
  const [view, sort, region, tier, mode, page] = token.split("~");
  return {
    view: view === "player" ? "player" : "team",
    sort: sort || "points",
    region: !region || region === "*" ? null : (region as Region),
    tier: !tier || tier === "*" ? null : tier,
    mode: !mode || mode === "*" ? null : (mode as LeaderboardMode),
    page: Number(page) || 0,
  };
}

export const DEFAULT_STATE: BoardState = {
  view: "team",
  sort: "points",
  region: null,
  tier: null,
  mode: null,
  page: 0,
};

/** The 9 options from the mockup. Region/Tier open a follow-up picker; the rest apply directly. */
export const FILTER_OPTIONS = [
  { value: "region", label: "Region" },
  { value: "tier", label: "Tier" },
  { value: "hardpoint", label: "Hard Point" },
  { value: "search_and_destroy", label: "Search and Destroy" },
  { value: "control", label: "Control" },
  { value: "winRate", label: "Win Rate" },
  { value: "kd", label: "K/D" },
  { value: "objective", label: "OBJ" },
  { value: "assists", label: "Assists" },
] as const;

/** Applies one Filter By choice to a state — mode/sort options resolve immediately; region
 *  and tier are handled by the caller via a follow-up picker instead. */
export function applyFilterChoice(state: BoardState, choice: string): BoardState {
  if (choice === "hardpoint" || choice === "search_and_destroy" || choice === "control") {
    return { ...state, mode: state.mode === choice ? null : (choice as LeaderboardMode), page: 0 };
  }
  if (choice === "winRate") return { ...state, view: "team", sort: "winRate", page: 0 };
  if (choice === "assists") return { ...state, view: "player", sort: "assists", page: 0 };
  if (choice === "kd" || choice === "objective") return { ...state, sort: choice, page: 0 };
  return state;
}

async function attachAvatars(standings: PlayerStanding[], client: Client): Promise<PlayerStanding[]> {
  return Promise.all(
    standings.map(async (s) => {
      if (!s.discordId) return s;
      try {
        const user = await client.users.fetch(s.discordId);
        return { ...s, avatarUrl: user.displayAvatarURL({ extension: "png", size: 128 }) };
      } catch {
        return s;
      }
    }),
  );
}

export interface BoardPayload {
  components: ReturnType<typeof container>[];
  files: AttachmentBuilder[];
  flags: typeof CV2;
}

export async function buildBoardPayload(
  guildId: string,
  initialState: BoardState,
  client: Client,
  live: boolean,
): Promise<BoardPayload> {
  let state = initialState;
  const style: LeaderboardStyle =
    (getConfig(guildId, "leaderboard_style") as LeaderboardStyle) === "animated" ? "animated" : "static";
  const regionLabel = state.region ?? "All regions";
  const modeLabel = state.mode ? state.mode.replace(/_/g, " ") : null;
  const sortLabel = state.sort;

  let buffer: Buffer;
  let total: number;
  let clampedPage = state.page;

  if (state.view === "team") {
    const sort = (TEAM_SORTS as readonly string[]).includes(state.sort) ? (state.sort as TeamSort) : "points";
    const countQuery = { guildId, region: state.region, tier: state.tier, mode: state.mode };
    total = getTeamStandingsCount(countQuery);
    clampedPage = Math.min(state.page, Math.max(0, Math.ceil(total / PAGE_SIZE) - 1));
    const standings = getTeamStandings(
      { ...countQuery, limit: PAGE_SIZE, offset: clampedPage * PAGE_SIZE },
      sort,
    );
    const args = { standings, sortLabel, regionLabel: [regionLabel, modeLabel].filter(Boolean).join(" • ") };
    buffer = style === "animated" ? await renderTeamLeaderboardAnimated(args, live) : await renderTeamLeaderboard(args);
  } else {
    const sort = (PLAYER_SORTS as readonly string[]).includes(state.sort) ? (state.sort as PlayerSort) : "points";
    const countQuery = { guildId, region: state.region, tier: state.tier, mode: state.mode };
    total = getPlayerStandingsCount(countQuery);
    clampedPage = Math.min(state.page, Math.max(0, Math.ceil(total / PAGE_SIZE) - 1));
    const standingsRaw = getPlayerStandings(
      { ...countQuery, limit: PAGE_SIZE, offset: clampedPage * PAGE_SIZE },
      sort,
    );
    const standings = await attachAvatars(standingsRaw, client);
    const args = { standings, sortLabel, regionLabel: [regionLabel, modeLabel].filter(Boolean).join(" • ") };
    buffer = style === "animated" ? await renderPlayerLeaderboardAnimated(args, live) : await renderPlayerLeaderboard(args);
  }

  state = { ...state, page: clampedPage };
  const filename = `leaderboard-${state.view}.${style === "animated" ? "gif" : "png"}`;
  const attachment = new AttachmentBuilder(buffer, { name: filename });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const token = encodeState(state);

  const viewSelect = new StringSelectMenuBuilder()
    .setCustomId(`${BOARD_PREFIX}:view:${token}`)
    .setPlaceholder(`View: ${state.view === "team" ? "Team" : "Player"}`)
    .addOptions(
      { label: "Team View", value: "team", default: state.view === "team" },
      { label: "Player View", value: "player", default: state.view === "player" },
    );

  const filterSelect = new StringSelectMenuBuilder()
    .setCustomId(`${BOARD_PREFIX}:filter:${token}`)
    .setPlaceholder("Filter By…")
    .addOptions(FILTER_OPTIONS.map((o) => ({ label: o.label, value: o.value })));

  const children: ContainerChild[] = [
    text(`# ${state.view === "team" ? "Team" : "Player"} Leaderboard`),
    galleryImage(filename, `${state.view} leaderboard`),
    divider(),
    actionRow(viewSelect),
    actionRow(filterSelect),
    actionRow(
      grayButton(`${BOARD_PREFIX}:page:first:${token}`, "First", state.page === 0),
      grayButton(`${BOARD_PREFIX}:page:prev:${token}`, "Prev", state.page === 0),
      grayButton(`${BOARD_PREFIX}:page:next:${token}`, "Next", state.page + 1 >= pages),
      grayButton(`${BOARD_PREFIX}:page:last:${token}`, "Last", state.page + 1 >= pages),
    ),
    text(`Page ${state.page + 1} of ${pages}${live ? " • ● LIVE — refreshes every 30s" : ""}`),
  ];

  return { components: [container(children, BRAND_COLOR)], files: [attachment], flags: CV2 };
}

export async function fetchDistinctTiers(guildId: string): Promise<string[]> {
  return listDistinctTiers(guildId);
}

export { REGIONS };
